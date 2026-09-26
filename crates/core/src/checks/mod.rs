//! Check runtime: the shell sources embedded in the binary, the manifest, the
//! bundle builder and the NDJSON v1 parser for what a bundle prints.
//!
//! Scripts live in `crates/core/checks/`. Each one is the body of a function;
//! the bundle wraps it in a subshell so `exit`, `cd` or a variable in one check
//! cannot touch the next.

pub mod bundle;
pub mod ndjson;

use crate::domain::manifest::Manifest;

/// Helpers every bundle starts with (`emit`, `json_str`, `has`, `run_light`…).
pub const PRELUDE: &str = include_str!("../../checks/prelude.sh");

/// The check manifest, as shipped. The UI imports the same file.
pub const MANIFEST_JSON: &str = include_str!("../../checks/manifest.json");

/// Every check script by file name, as named in the manifest's `script`.
pub const SCRIPTS: &[(&str, &str)] = &[
    ("sys_load.sh", include_str!("../../checks/sys_load.sh")),
    ("disk_fs.sh", include_str!("../../checks/disk_fs.sh")),
];

/// The source of a check script by its manifest file name.
pub fn script(name: &str) -> Option<&'static str> {
    SCRIPTS.iter().find(|(n, _)| *n == name).map(|(_, s)| *s)
}

/// The shipped manifest. It is embedded, so a parse error is a build defect
/// caught by the tests; callers still get it as an error, never a panic.
pub fn manifest() -> Result<Manifest, serde_json::Error> {
    serde_json::from_str(MANIFEST_JSON)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::manifest::Runs;
    use std::collections::BTreeSet;

    #[test]
    fn manifest_parses_with_unique_ids_and_known_scripts() {
        let m = manifest().unwrap();
        let ids: BTreeSet<&str> = m.checks.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids.len(), m.checks.len(), "duplicate check id");
        for c in &m.checks {
            if let Some(file) = &c.script {
                assert_eq!(
                    c.runs,
                    Runs::Remote,
                    "{}: only remote checks have scripts",
                    c.id
                );
                assert!(script(file).is_some(), "{}: {file} is not in SCRIPTS", c.id);
            } else {
                assert!(c.needs.is_empty(), "{}: needs without a script", c.id);
            }
        }
    }

    #[test]
    fn every_script_file_is_embedded_and_used() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("checks");
        let m = manifest().unwrap();
        let used: BTreeSet<&str> = m
            .checks
            .iter()
            .filter_map(|c| c.script.as_deref())
            .collect();
        for entry in std::fs::read_dir(dir).unwrap() {
            let name = entry.unwrap().file_name().into_string().unwrap();
            if name.ends_with(".sh") && name != "prelude.sh" {
                assert!(script(&name).is_some(), "{name} is not in SCRIPTS");
                assert!(
                    used.contains(name.as_str()),
                    "{name} is not in the manifest"
                );
            }
        }
    }

    #[test]
    fn prelude_starts_by_closing_stderr() {
        assert_eq!(PRELUDE.lines().next(), Some("exec 2>/dev/null"));
    }
}
