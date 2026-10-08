//! Host key lookups for the setup screens: is the key of this host in the
//! user's known-hosts files, and what key does the host offer?
//!
//! Both questions go to OpenSSH's own tools. `ssh-keygen -F` searches a
//! known-hosts file (hashed names included), `ssh-keyscan` reads the key the
//! server offers and `ssh-keygen -lf -` turns key lines into fingerprints.
//! The app has no known-hosts parser and never writes a known-hosts file: a
//! host it has never seen is shown with its fingerprint, and the user accepts
//! it by running `ssh <alias>` in Terminal.
//!
//! `ssh-keyscan` connects straight to the host name and knows nothing of the
//! user's config, so for a host reached through `ProxyJump` or `ProxyCommand`
//! the offered key is not read here; the login test reads it through the same
//! route the real connection takes (see `SshTransport`).

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::config::ResolvedHost;
use super::system::parse_keygen_all;
use super::tools::SshTools;

/// How long `ssh-keyscan` waits for a host (`-T`).
const SCAN_SECONDS: u32 = 5;
/// How long each helper program may take in all.
const HELPER_TIMEOUT: Duration = Duration::from_secs(12);

/// Where a host's key stands.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum HostKeyState {
    /// The key is recorded, and the host offers it (or could not be asked).
    Known,
    /// Nothing is recorded for this host.
    Unknown,
    /// A key is recorded, but the host offers another one.
    Changed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostKeyInfo {
    pub state: HostKeyState,
    /// The key the host offers, as `ED25519 SHA256:…`; `None` when it could
    /// not be read (unreachable, or reached through a proxy).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offered: Option<String>,
    /// The keys recorded for it, same format.
    pub known: Vec<String>,
    /// The name known-hosts files file this host's key under (what
    /// `ssh-keygen -R` takes); `None` when the lookup never resolved the host.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lookup_name: Option<String>,
}

/// Looks the host's key up and asks the host for the key it offers.
pub async fn check(tools: &SshTools, host: &ResolvedHost) -> HostKeyInfo {
    let known = known_fingerprints(tools, host).await;
    let offered = if host.proxied() {
        Vec::new()
    } else {
        offered_fingerprints(tools, host).await
    };
    let state = match (known.is_empty(), offered.is_empty()) {
        (true, _) => HostKeyState::Unknown,
        (false, true) => HostKeyState::Known,
        (false, false) if offered.iter().any(|o| known.contains(o)) => HostKeyState::Known,
        (false, false) => HostKeyState::Changed,
    };
    HostKeyInfo {
        state,
        offered: preferred(offered),
        known,
        lookup_name: Some(lookup_name(host)),
    }
}

/// The name a known-hosts entry is filed under: `HostKeyAlias`, else the host
/// name, with the port as `[host]:port` when it is not 22.
pub(crate) fn lookup_name(host: &ResolvedHost) -> String {
    let name = host.host_key_alias.as_deref().unwrap_or(&host.hostname);
    if host.port == 22 {
        name.to_owned()
    } else {
        format!("[{name}]:{}", host.port)
    }
}

/// Whether `s` can be handed to `ssh-keygen` / `ssh-keyscan` as a host name:
/// no option, space or control character. Anything else goes (a `HostKeyAlias`
/// may be any word, an IPv6 address may carry a `%zone`): the programs are
/// started without a shell, and the name is an argument of `-F` or follows `--`.
fn plain_host(s: &str) -> bool {
    let name = s.trim_start_matches('[');
    !s.is_empty()
        && s.len() <= 255
        && !name.starts_with('-')
        && s.chars().all(|c| !c.is_control() && !c.is_whitespace())
}

/// The recorded keys of `host` in the files ssh would read.
async fn known_fingerprints(tools: &SshTools, host: &ResolvedHost) -> Vec<String> {
    let name = lookup_name(host);
    if !plain_host(&name) {
        return Vec::new();
    }
    let mut lines = String::new();
    for file in &host.known_hosts_files {
        let Some(path) = expand(tools, file) else {
            continue;
        };
        if !path.is_file() {
            continue;
        }
        let mut cmd = tools.command(&tools.keygen);
        cmd.arg("-F").arg(&name).arg("-f").arg(&path);
        let Some(out) = tools.capture(cmd, b"", HELPER_TIMEOUT).await else {
            continue;
        };
        if !out.ok() {
            continue;
        }
        for line in out.stdout.lines().filter(|l| !l.starts_with('#')) {
            lines.push_str(line);
            lines.push('\n');
        }
    }
    fingerprints(tools, &lines).await
}

/// The keys the host offers, read with `ssh-keyscan`.
async fn offered_fingerprints(tools: &SshTools, host: &ResolvedHost) -> Vec<String> {
    if !plain_host(&host.hostname) {
        return Vec::new();
    }
    let mut cmd = tools.command(&tools.keyscan);
    cmd.arg("-T")
        .arg(SCAN_SECONDS.to_string())
        .arg("-p")
        .arg(host.port.to_string())
        .arg("-t")
        .arg("ed25519,ecdsa,rsa")
        .arg("--")
        .arg(&host.hostname);
    let Some(out) = tools.capture(cmd, b"", HELPER_TIMEOUT).await else {
        return Vec::new();
    };
    let keys: String = out
        .stdout
        .lines()
        .filter(|l| !l.starts_with('#'))
        .map(|l| format!("{l}\n"))
        .collect();
    fingerprints(tools, &keys).await
}

/// `ssh-keygen -lf -` over key lines: `ED25519 SHA256:…` per key.
async fn fingerprints(tools: &SshTools, key_lines: &str) -> Vec<String> {
    if key_lines.trim().is_empty() {
        return Vec::new();
    }
    let mut cmd = tools.command(&tools.keygen);
    cmd.arg("-lf").arg("-");
    match tools
        .capture(cmd, key_lines.as_bytes(), HELPER_TIMEOUT)
        .await
    {
        Some(out) => {
            let mut all = parse_keygen_all(&out.stdout);
            all.dedup();
            all
        }
        None => Vec::new(),
    }
}

/// The key worth showing: ED25519 first, then ECDSA, then the rest.
fn preferred(offered: Vec<String>) -> Option<String> {
    ["ED25519", "ECDSA"]
        .iter()
        .find_map(|kind| offered.iter().find(|o| o.starts_with(kind)))
        .or_else(|| offered.first())
        .cloned()
}

/// `~` and `~/…` in a known-hosts path; `None` for paths with `%` tokens.
fn expand(tools: &SshTools, file: &str) -> Option<PathBuf> {
    if file.contains('%') {
        return None;
    }
    if let Some(rest) = file.strip_prefix("~/") {
        return Some(PathBuf::from(tools.var("HOME")?).join(rest));
    }
    Some(PathBuf::from(file))
}

#[cfg(test)]
mod tests;
