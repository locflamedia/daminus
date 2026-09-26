//! Builds the shell bundle one host runs: prelude, a block of variables, one
//! subshell function per enabled check, and `main`, called with stdin from
//! `/dev/null` on the last line.
//!
//! The server shell reads `main` completely before running it, and no check
//! can read the rest of the bundle from stdin (a stray `cat` gets EOF). Every
//! variable value is single-quoted with `'` written as `'\''`, so config text
//! never runs as shell. Scripts only read limits from these variables (skip
//! paths, file floor); severity thresholds stay in Rust.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

use crate::domain::manifest::{CheckGroup, Manifest, Runs};
use crate::domain::settings::ScanSettings;

use super::{PRELUDE, script};

/// Why a bundle could not be built. All are caller or build defects.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum BundleError {
    #[error("variable name {0:?} is not an upper-case DAMINUS_ shell identifier")]
    BadName(String),
    #[error("variable {0} holds a NUL byte, which a shell cannot")]
    NulInValue(String),
    #[error("check {0:?} is not in the manifest or has no script")]
    UnknownCheck(String),
    #[error("check {0:?} names a script that is not embedded")]
    MissingScript(String),
    #[error("check id {0:?} does not map to a unique shell function name")]
    BadCheckId(String),
}

/// Set to `1` by a caller that keeps stdin open after the bundle (the SSH
/// transport). The bundle then watches stdin: end of file means the client
/// went away (Ctrl-C, app quit, lost connection), and the bundle stops its
/// whole process group instead of running on unattended until the
/// server-side `timeout`. Without it the bundle just runs `main`.
pub const HANGUP_VAR: &str = "DAMINUS_HANGUP";

/// The last line. It is one line so the shell has read all of it before the
/// watcher starts reading stdin; it ends with `exit` so the shell never
/// waits for more input. With the watcher, `main` runs in a subshell: bash
/// 3.2 (macOS `sh`) aborts when a function call redirects stdin while a
/// background job reads a copy of it.
const TAIL: &str = "if [ \"${DAMINUS_HANGUP-}\" = 1 ]; then exec 3<&0; { read -r _ <&3 || kill -TERM 0; } & w=$!; exec 3<&-; (main) </dev/null; kill \"$w\"; else main </dev/null; fi; exit 0\n";

/// Name of the variable holding the bundle hash, set by [`build`].
pub const BUNDLE_VAR: &str = "DAMINUS_BUNDLE";

/// Every bundle variable name starts with this.
pub const VAR_PREFIX: &str = "DAMINUS_";

/// Values passed to the scripts. Names are upper-case identifiers starting
/// with [`VAR_PREFIX`]; values are any text without NUL. Lists are newline-separated.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BundleVars(BTreeMap<String, String>);

impl BundleVars {
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets one variable. Names must start with `DAMINUS_`, so shell settings
    /// such as `PATH`, `IFS` or `LC_ALL` can never be overridden from here.
    pub fn set(&mut self, name: &str, value: impl Into<String>) -> Result<(), BundleError> {
        let value = value.into();
        let valid = name.len() > VAR_PREFIX.len()
            && name.starts_with(VAR_PREFIX)
            && name
                .chars()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
            && name != BUNDLE_VAR;
        if !valid {
            return Err(BundleError::BadName(name.to_owned()));
        }
        if value.contains('\0') {
            return Err(BundleError::NulInValue(name.to_owned()));
        }
        self.0.insert(name.to_owned(), value);
        Ok(())
    }

    /// The limits Settings › Scan hands to the scripts.
    pub fn from_scan(scan: &ScanSettings) -> Result<Self, BundleError> {
        let mut vars = Self::new();
        vars.set("DAMINUS_SKIP_PATHS", scan.skip_paths.join("\n"))?;
        vars.set("DAMINUS_LARGE_FILE_MB", scan.large_file_mb.to_string())?;
        Ok(vars)
    }
}

/// Which checks go in the bundle.
#[derive(Clone, Debug, Default)]
pub struct Selection {
    /// Groups switched off in Settings › Scan. `system` cannot be switched off.
    pub disabled_groups: BTreeSet<CheckGroup>,
    /// Only these check ids, when set (harness, "scan one check").
    pub only: Option<BTreeSet<String>>,
}

/// A ready-to-send bundle.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bundle {
    /// The shell text, fed to `sh -s` on the server.
    pub text: String,
    /// FNV-1a 64 of the bundle without its variables: the same checks give the
    /// same hash, so results of different check versions can be told apart.
    pub hash: String,
    /// Check ids in run order.
    pub checks: Vec<String>,
    /// Groups that emit a `step` line, in run order.
    pub groups: Vec<CheckGroup>,
}

/// Builds the bundle for the remote checks of `manifest` picked by `selection`.
pub fn build(
    manifest: &Manifest,
    selection: &Selection,
    vars: &BundleVars,
) -> Result<Bundle, BundleError> {
    if let Some(only) = &selection.only {
        for id in only {
            let known = manifest
                .get(id)
                .is_some_and(|c| c.runs == Runs::Remote && c.script.is_some());
            if !known {
                return Err(BundleError::UnknownCheck(id.clone()));
            }
        }
    }
    let mut groups: BTreeMap<CheckGroup, Vec<Part>> = BTreeMap::new();
    for spec in &manifest.checks {
        let Some(file) = spec.script.as_deref() else {
            continue;
        };
        let enabled = spec.runs == Runs::Remote
            && (!spec.group.can_disable() || !selection.disabled_groups.contains(&spec.group))
            && selection.only.as_ref().is_none_or(|o| o.contains(&spec.id));
        if !enabled {
            continue;
        }
        let body = script(file).ok_or_else(|| BundleError::MissingScript(spec.id.clone()))?;
        groups.entry(spec.group).or_default().push(Part {
            id: spec.id.clone(),
            body: body.to_owned(),
        });
    }
    assemble(PRELUDE, groups, vars)
}

/// One check in the bundle: its id and script body.
#[derive(Clone, Debug)]
struct Part {
    id: String,
    body: String,
}

fn function_name(id: &str) -> Result<String, BundleError> {
    let ok = !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_');
    if !ok {
        return Err(BundleError::BadCheckId(id.to_owned()));
    }
    Ok(format!("c_{}", id.replace('.', "_")))
}

fn assemble(
    prelude: &str,
    groups: BTreeMap<CheckGroup, Vec<Part>>,
    vars: &BundleVars,
) -> Result<Bundle, BundleError> {
    let mut functions = String::new();
    let mut main = String::from("main() {\n\td_begin\n");
    let mut names = BTreeSet::new();
    let mut checks = Vec::new();
    for (group, parts) in &groups {
        let group_name = group_name(*group);
        let _ = writeln!(main, "\td_group");
        for part in parts {
            let name = function_name(&part.id)?;
            if !names.insert(name.clone()) {
                return Err(BundleError::BadCheckId(part.id.clone()));
            }
            let _ = writeln!(functions, "{name}() (\n{}\n)", part.body.trim_end());
            let _ = writeln!(main, "\t{name}");
            checks.push(part.id.clone());
        }
        let _ = writeln!(main, "\td_step {group_name}");
    }
    main.push_str("\td_end\n}\n");
    main.push_str(TAIL);

    let code = format!("{functions}{main}");
    let hash = fnv1a64(format!("{prelude}\0{code}").as_bytes());

    let mut text = String::with_capacity(prelude.len() + code.len() + 256);
    text.push_str(prelude.trim_end());
    text.push('\n');
    let _ = writeln!(text, "{BUNDLE_VAR}={}", quote(&hash));
    for (name, value) in &vars.0 {
        let _ = writeln!(text, "{name}={}", quote(value));
    }
    text.push_str(&code);
    Ok(Bundle {
        text,
        hash,
        checks,
        groups: groups.keys().copied().collect(),
    })
}

/// The wire name of a group, as in the manifest and `step` lines.
fn group_name(group: CheckGroup) -> String {
    serde_json::to_value(group)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

/// Single-quotes `value` for sh: `'` becomes `'\''`; nothing else is special
/// inside single quotes.
pub fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

fn fnv1a64(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x0000_0100_0000_01b3)
    });
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests;
