//! What the setup screens say about this Mac before any server is touched:
//! whether the SSH agent holds keys.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::SetupService;
use crate::ssh::SshTools;

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
}

/// What `ssh-add -l` says about the agent, for Settings › About and the
/// diagnostics. Only whether an agent answers and how many keys it holds.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AgentStatus {
    /// An agent answered (with or without keys).
    pub present: bool,
    /// The agent holds at least one key.
    pub has_keys: bool,
    /// How many keys it holds (a count only, never names or fingerprints).
    pub keys: u32,
}

impl AgentStatus {
    pub fn new(state: AgentState, keys: u32) -> Self {
        Self {
            present: state != AgentState::Unavailable,
            has_keys: keys > 0,
            keys,
        }
    }
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
    /// `~/.ssh` of the home folder the ssh tools use, only when it exists as a folder.
    pub fn existing_ssh_dir(&self) -> Option<PathBuf> {
        self.shared
            .tools
            .home()
            .map(|home| home.join(".ssh"))
            .filter(|dir| dir.is_dir())
    }

    /// The agent, for the empty-app screens.
    pub async fn environment(&self) -> SshEnvironment {
        let (agent, keys) = ask_agent(&self.shared.tools).await;
        SshEnvironment { agent, keys }
    }

    /// Whether the agent the app would use answers, and how many keys it holds.
    pub async fn agent_status(&self) -> AgentStatus {
        let (agent, keys) = ask_agent(&self.shared.tools).await;
        AgentStatus::new(agent, keys)
    }
}

/// Runs `ssh-add -l` with the environment the app resolved at launch.
async fn ask_agent(tools: &SshTools) -> (AgentState, u32) {
    let mut cmd = tools.command(tools.ssh_add());
    cmd.arg("-l");
    match tools.capture(cmd, b"", AGENT_TIMEOUT).await {
        Some(out) => read_agent(out.code, &out.stdout),
        None => (AgentState::Unavailable, 0),
    }
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
    fn status_is_only_presence_and_a_count() {
        assert_eq!(
            AgentStatus::new(AgentState::Keys, 2),
            AgentStatus {
                present: true,
                has_keys: true,
                keys: 2
            }
        );
        assert_eq!(
            AgentStatus::new(AgentState::Empty, 0),
            AgentStatus {
                present: true,
                has_keys: false,
                keys: 0
            }
        );
        assert_eq!(
            AgentStatus::new(AgentState::Unavailable, 0),
            AgentStatus {
                present: false,
                has_keys: false,
                keys: 0
            }
        );
    }

    #[test]
    fn an_older_environment_with_a_field_since_removed_still_reads() {
        let old = r#"{"agent":"empty","keys":0,"termius_installed":true}"#;
        let env: SshEnvironment = serde_json::from_str(old).unwrap();
        assert_eq!(
            env,
            SshEnvironment {
                agent: AgentState::Empty,
                keys: 0
            }
        );
    }
}
