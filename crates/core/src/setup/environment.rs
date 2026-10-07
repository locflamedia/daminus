//! What the setup screens say about this Mac before any server is touched:
//! whether the SSH agent holds keys, and whether Termius is installed (it keeps
//! its own host list, which Daminus never reads).

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::SetupService;

/// How long `ssh-add -l` may take.
const AGENT_TIMEOUT: Duration = Duration::from_secs(5);

/// The state of the SSH agent the app would use.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum AgentState {
    /// The agent answers and holds at least one key.
    Keys,
    /// The agent answers and holds no key.
    Empty,
    /// No agent to ask (`SSH_AUTH_SOCK` unset, agent not running, no `ssh-add`).
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SshEnvironment {
    pub agent: AgentState,
    /// Keys the agent holds (their count only, never their names or contents).
    pub keys: u32,
    /// `Termius.app` is installed.
    pub termius_installed: bool,
}

/// Reads `ssh-add -l`: exit 0 lists the keys, 1 says there are none, 2 means
/// no agent answered.
pub(super) fn read_agent(code: Option<i32>, stdout: &str) -> (AgentState, u32) {
    match code {
        Some(0) => {
            let keys = stdout
                .lines()
                .filter(|l| {
                    let l = l.trim();
                    !l.is_empty() && !l.starts_with("The agent has no identities")
                })
                .count();
            let keys = u32::try_from(keys).unwrap_or(u32::MAX);
            if keys == 0 {
                (AgentState::Empty, 0)
            } else {
                (AgentState::Keys, keys)
            }
        }
        Some(1) => (AgentState::Empty, 0),
        _ => (AgentState::Unavailable, 0),
    }
}

impl SetupService {
    /// The agent and Termius, for the empty-app screens.
    pub async fn environment(&self) -> SshEnvironment {
        let tools = &self.shared.tools;
        let cmd = tools.command(tools.ssh_add());
        let (agent, keys) = match tools.capture(cmd_with_flag(cmd), b"", AGENT_TIMEOUT).await {
            Some(out) => read_agent(out.code, &out.stdout),
            None => (AgentState::Unavailable, 0),
        };
        SshEnvironment {
            agent,
            keys,
            termius_installed: termius_paths(tools.home()).iter().any(|p| p.is_dir()),
        }
    }
}

fn cmd_with_flag(mut cmd: tokio::process::Command) -> tokio::process::Command {
    cmd.arg("-l");
    cmd
}

fn termius_paths(home: Option<PathBuf>) -> Vec<PathBuf> {
    let mut paths = vec![PathBuf::from("/Applications/Termius.app")];
    if let Some(home) = home {
        paths.push(home.join("Applications/Termius.app"));
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_with_keys_counts_them() {
        let out = "256 SHA256:abc a@b (ED25519)\n3072 SHA256:def c@d (RSA)\n";
        assert_eq!(read_agent(Some(0), out), (AgentState::Keys, 2));
    }

    #[test]
    fn agent_without_identities_is_empty() {
        assert_eq!(
            read_agent(Some(1), "The agent has no identities.\n"),
            (AgentState::Empty, 0)
        );
        assert_eq!(
            read_agent(Some(0), "The agent has no identities.\n"),
            (AgentState::Empty, 0)
        );
    }

    #[test]
    fn no_agent_is_unavailable() {
        assert_eq!(read_agent(Some(2), ""), (AgentState::Unavailable, 0));
        assert_eq!(read_agent(None, ""), (AgentState::Unavailable, 0));
    }

    #[test]
    fn termius_is_looked_for_in_both_application_folders() {
        let paths = termius_paths(Some(PathBuf::from("/Users/a")));
        assert_eq!(paths.len(), 2);
        assert!(paths[1].ends_with("Applications/Termius.app"));
    }
}
