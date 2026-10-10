//! Whether the key a host's config points at is in the SSH agent, for the
//! sentence a refused login shows: "the key is not loaded" (with an `ssh-add`
//! line) or "the key is loaded, but the server refused it" (check `User` and
//! `authorized_keys`). Only fingerprints are compared; no key is read.

use std::time::Duration;

use crate::ssh::SshTools;
use crate::ssh::hostkey::expand;

/// How long one `ssh-add -l` or `ssh-keygen -l` may take.
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);

/// The SHA256 fingerprints a `ssh-add -l -E sha256` or `ssh-keygen -l -E sha256`
/// listing names: the second field of each `bits SHA256:… comment (TYPE)` line.
pub(super) fn fingerprints(listing: &str) -> Vec<String> {
    listing
        .lines()
        .filter_map(|l| l.split_whitespace().nth(1))
        .filter(|f| f.starts_with("SHA256:"))
        .map(str::to_owned)
        .collect()
}

/// The answer from what was found: `agent` are the fingerprints the agent
/// holds, `files` those of the identity files that exist on disk.
///
/// - one of the files is in the agent: loaded;
/// - no file exists but the agent holds keys: ssh offered those, so loaded;
/// - otherwise: not loaded.
pub(super) fn key_in_agent(agent: &[String], files: &[String], any_file: bool) -> bool {
    if files.iter().any(|f| agent.contains(f)) {
        return true;
    }
    !any_file && !agent.is_empty()
}

/// Asks the agent and `ssh-keygen` about `identity_files` (as `ssh -G` lists
/// them). `None` when a tool could not answer, so the caller keeps the
/// generic sentence.
pub(super) async fn check(tools: &SshTools, identity_files: &[String]) -> Option<bool> {
    let mut cmd = tools.command(tools.ssh_add());
    cmd.args(["-l", "-E", "sha256"]);
    let out = tools.capture(cmd, b"", LOOKUP_TIMEOUT).await?;
    // 0 lists keys, 1 means none; 2 is no agent at all, which reads as "not loaded".
    let agent = match out.code {
        Some(0) => fingerprints(&out.stdout),
        Some(1 | 2) => Vec::new(),
        _ => return None,
    };
    let mut files = Vec::new();
    let mut any_file = false;
    for file in identity_files {
        let Some(path) = expand(tools, file) else {
            continue;
        };
        if !path.is_file() {
            continue;
        }
        any_file = true;
        let mut cmd = tools.command(&tools.keygen);
        cmd.args(["-l", "-E", "sha256", "-f"]).arg(&path);
        if let Some(out) = tools.capture(cmd, b"", LOOKUP_TIMEOUT).await
            && out.code == Some(0)
        {
            files.extend(fingerprints(&out.stdout));
        }
    }
    Some(key_in_agent(&agent, &files, any_file))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_fingerprints_of_a_listing() {
        let listing = "3072 SHA256:abc123 me@mac (RSA)\n256 SHA256:def456 work (ED25519)\n";
        assert_eq!(fingerprints(listing), ["SHA256:abc123", "SHA256:def456"]);
        assert!(fingerprints("The agent has no identities.\n").is_empty());
    }

    #[test]
    fn a_config_key_in_the_agent_is_loaded() {
        let agent = vec!["SHA256:a".to_owned()];
        assert!(key_in_agent(&agent, &["SHA256:a".to_owned()], true));
        assert!(!key_in_agent(&agent, &["SHA256:b".to_owned()], true));
    }

    #[test]
    fn with_no_key_file_on_disk_the_agent_keys_are_what_ssh_offered() {
        let agent = vec!["SHA256:a".to_owned()];
        assert!(key_in_agent(&agent, &[], false));
        assert!(!key_in_agent(&[], &[], false));
    }
}
