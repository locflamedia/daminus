//! What a setup run tells its listeners, and the live status and results the
//! screens can read back. Shaped like the scan's events (`scan::event`): one
//! stream per run, a rising `seq`, a status folded from the same events.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::discover::{HostDiscovery, LoginResult, SetupRecord, grouping::Proposal};
use crate::domain::datetime::Timestamp;
use crate::domain::error::AppError;
use crate::domain::host::HostAlias;
use crate::domain::snapshot::HostOutcome;
use crate::scan::HostState;
use crate::ssh::config::ResolvedHost;
use crate::ssh::hostkey::HostKeyInfo;

/// What a run does on each host.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, rename = "SetupStep"))]
pub enum Step {
    /// The login test: who the SSH user is and what it may do.
    Test,
    /// Discover: nginx, compose, pm2, databases, `.env` paths, ports.
    Discover,
}

/// What `start` did.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, rename = "SetupStarted"))]
pub struct Started {
    pub setup_id: String,
    /// A run was already going; this is its id and nothing new started.
    pub joined: bool,
}

/// One event. `seq` rises by one per event within a run.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SetupEvent {
    pub setup_id: String,
    pub seq: u32,
    #[serde(flatten)]
    #[cfg_attr(feature = "ts", ts(flatten))]
    pub body: SetupEventBody,
}

/// Serialized with a `kind` tag.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum SetupEventBody {
    /// A host left the queue.
    HostStarted { host: HostAlias },
    /// Authentication is waiting, most likely on an SSH agent approval
    /// (1Password, Secretive). Not counted in the host's time budget.
    AgentWait { host: HostAlias },
    /// The host's shell started the script (its `begin` line arrived).
    HostRunning { host: HostAlias },
    /// One thing the script found or reported.
    Item { host: HostAlias, item: SetupRecord },
    /// The host's key is not one the user has accepted (or changed): what
    /// is recorded, and the key it offers.
    HostKey { host: HostAlias, info: HostKeyInfo },
    HostFinished {
        host: HostAlias,
        outcome: HostOutcome,
        /// Wall time on this Mac.
        ms: u32,
        items: u32,
        /// Lines rejected by the parser.
        dropped: u32,
    },
    /// Every host is done; `result()` has what was found.
    Done,
    /// Stopped by the user or app quit.
    Cancelled,
    /// The run broke (a host task died): the other hosts' results are kept.
    Failed { error: AppError },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SetupHostProgress {
    #[serde(flatten)]
    #[cfg_attr(feature = "ts", ts(flatten))]
    pub state: HostState,
    pub items: u32,
    pub dropped: u32,
}

/// The run in progress, as `SetupService::status` returns it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SetupRun {
    pub setup_id: String,
    pub step: Step,
    pub started_at: Timestamp,
    /// `seq` of the next event: every event before it is folded in here.
    pub next_seq: u32,
    pub hosts: BTreeMap<HostAlias, SetupHostProgress>,
}

impl SetupRun {
    pub(super) fn new(
        setup_id: String,
        step: Step,
        started_at: Timestamp,
        hosts: &[HostAlias],
    ) -> Self {
        Self {
            setup_id,
            step,
            started_at,
            next_seq: 0,
            hosts: hosts
                .iter()
                .map(|h| {
                    (
                        h.clone(),
                        SetupHostProgress {
                            state: HostState::Queued,
                            items: 0,
                            dropped: 0,
                        },
                    )
                })
                .collect(),
        }
    }

    /// Folds event `seq` into the status.
    pub(super) fn apply(&mut self, seq: u32, body: &SetupEventBody) {
        self.next_seq = seq.saturating_add(1);
        let (host, f): (&HostAlias, fn(&mut SetupHostProgress, &SetupEventBody)) = match body {
            SetupEventBody::HostStarted { host }
            | SetupEventBody::AgentWait { host }
            | SetupEventBody::HostRunning { host }
            | SetupEventBody::Item { host, .. }
            | SetupEventBody::HostFinished { host, .. } => (host, fold),
            _ => return,
        };
        if let Some(p) = self.hosts.get_mut(host) {
            f(p, body);
        }
    }
}

fn fold(p: &mut SetupHostProgress, body: &SetupEventBody) {
    match body {
        SetupEventBody::HostStarted { .. } => p.state = HostState::Connecting,
        SetupEventBody::AgentWait { .. } => p.state = HostState::AgentWait,
        SetupEventBody::HostRunning { .. } => p.state = HostState::Running,
        SetupEventBody::Item { .. } => {
            p.state = HostState::Running;
            p.items += 1;
        }
        SetupEventBody::HostFinished {
            outcome,
            items,
            dropped,
            ..
        } => {
            p.state = HostState::Finished {
                outcome: outcome.clone(),
            };
            p.items = *items;
            p.dropped = *dropped;
        }
        _ => {}
    }
}

/// Everything known about one host from the setup runs so far.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostSetup {
    pub host: HostAlias,
    /// How the last run on this host ended.
    pub outcome: Option<HostOutcome>,
    /// What `ssh -G` says the connection uses.
    pub resolved: Option<ResolvedHost>,
    /// Set when the host key is not accepted yet (or changed).
    pub host_key: Option<HostKeyInfo>,
    pub login: Option<LoginResult>,
    pub discovery: Option<HostDiscovery>,
}

impl HostSetup {
    pub(super) fn new(host: HostAlias) -> Self {
        Self {
            host,
            outcome: None,
            resolved: None,
            host_key: None,
            login: None,
            discovery: None,
        }
    }
}

/// What the runs found: per host, and the suggested projects from every host
/// that has been discovered.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SetupResult {
    pub hosts: Vec<HostSetup>,
    pub proposal: Option<Proposal>,
}
