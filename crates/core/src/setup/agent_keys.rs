//! Whether the key a host's config points at is in the SSH agent, for the
//! sentence a refused login shows: "the key is not loaded" (with an `ssh-add`
//! line) or "the key is loaded, but the server refused it" (check `User` and
//! `authorized_keys`). Only fingerprints are compared; no key is read.

use std::time::Duration;

use crate::ssh::SshTools;
use crate::ssh::config::ResolvedHost;
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

/// Whether the agent the app can ask is the one ssh used, and every key file
/// can be found: not with an `IdentityAgent` of its own, nor with `%` tokens
/// in an `IdentityFile` (they would read as "no file on disk").
pub(super) fn can_tell(host: &ResolvedHost) -> bool {
    host.identity_agent.is_none() && !host.identity_files.iter().any(|f| f.contains('%'))
}

/// Asks the agent and `ssh-keygen` about the host's identity files (as `ssh
/// -G` lists them). `None` when it cannot tell, so the caller keeps the
/// generic sentence.
pub(super) async fn check(tools: &SshTools, host: &ResolvedHost) -> Option<bool> {
    if !can_tell(host) {
        return None;
    }
    let identity_files = &host.identity_files;
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
    fn cannot_tell_for_an_agent_of_its_own_or_a_tokenised_key_path() {
        let plain = ResolvedHost {
            hostname: "h".into(),
            user: None,
            port: 22,
            identity_files: vec!["~/.ssh/id_rsa".into()],
            proxy_jump: None,
            proxy_command: false,
            known_hosts_files: Vec::new(),
            host_key_alias: None,
            identity_agent: None,
        };
        assert!(can_tell(&plain));
        let agent = ResolvedHost {
            identity_agent: Some("~/Library/1Password/agent.sock".into()),
            ..plain.clone()
        };
        assert!(!can_tell(&agent));
        let token = ResolvedHost {
            identity_files: vec!["~/.ssh/%h".into()],
            ..plain
        };
        assert!(!can_tell(&token));
    }

    #[test]
    fn with_no_key_file_on_disk_the_agent_keys_are_what_ssh_offered() {
        let agent = vec!["SHA256:a".to_owned()];
        assert!(key_in_agent(&agent, &[], false));
        assert!(!key_in_agent(&[], &[], false));
    }
}
