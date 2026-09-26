//! What a scan tells its listeners (`scan://event` in the app, stderr in the
//! dev CLI), and the live status the UI and tray can read back.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::domain::datetime::Timestamp;
use crate::domain::error::AppError;
use crate::domain::fact::CheckFact;
use crate::domain::host::HostRef;
use crate::domain::manifest::CheckGroup;
use crate::domain::snapshot::HostOutcome;

/// One event. `seq` rises by one per event within a scan, so a listener can
/// spot a gap or reorder.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ScanEvent {
    pub scan_id: String,
    pub seq: u32,
    #[serde(flatten)]
    #[cfg_attr(feature = "ts", ts(flatten))]
    pub body: ScanEventBody,
}

/// Serialized with a `kind` tag.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum ScanEventBody {
    /// A host (or `@local`, for URL probes) left the queue.
    HostStarted {
        host: HostRef,
    },
    /// Authentication is waiting, most likely on an SSH agent approval.
    /// Not counted in the connect timeout.
    AgentWait {
        host: HostRef,
    },
    /// The host's shell started the bundle (its `begin` line arrived).
    HostRunning {
        host: HostRef,
    },
    /// A check group finished on the host (`ms` measured on the server).
    Step {
        host: HostRef,
        group: CheckGroup,
        ms: u32,
    },
    Fact {
        host: HostRef,
        fact: CheckFact,
    },
    HostFinished {
        host: HostRef,
        outcome: HostOutcome,
        /// Wall time on this Mac.
        ms: u32,
        facts: u32,
        /// Lines rejected by the parser.
        dropped: u32,
    },
    /// Saved as snapshot `snapshot_seq`.
    Done {
        snapshot_seq: u32,
    },
    /// Stopped by the user or app quit; nothing was saved.
    Cancelled,
    /// Ended without a snapshot (`LocalNetworkDown`, a store error).
    Failed {
        error: AppError,
    },
}

/// Where a host is in the scan.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum HostState {
    Queued,
    Connecting,
    AgentWait,
    Running,
    Finished { outcome: HostOutcome },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostProgress {
    #[serde(flatten)]
    #[cfg_attr(feature = "ts", ts(flatten))]
    pub state: HostState,
    /// Last group that finished.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step: Option<CheckGroup>,
    pub facts: u32,
    pub dropped: u32,
}

impl HostProgress {
    fn queued() -> Self {
        Self {
            state: HostState::Queued,
            step: None,
            facts: 0,
            dropped: 0,
        }
    }
}

/// The scan in progress, as `ScanService::status` returns it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ScanRun {
    pub scan_id: String,
    pub started_at: Timestamp,
    /// `seq` of the next event: every event before it is folded in here, so
    /// a listener that reads the status mid-scan skips events below it.
    pub next_seq: u32,
    pub hosts: BTreeMap<HostRef, HostProgress>,
}

impl ScanRun {
    pub(crate) fn new(
        scan_id: String,
        started_at: Timestamp,
        hosts: impl IntoIterator<Item = HostRef>,
    ) -> Self {
        Self {
            scan_id,
            started_at,
            next_seq: 0,
            hosts: hosts
                .into_iter()
                .map(|h| (h, HostProgress::queued()))
                .collect(),
        }
    }

    /// Folds event `seq` into the status.
    pub(crate) fn apply(&mut self, seq: u32, body: &ScanEventBody) {
        self.next_seq = seq.saturating_add(1);
        let host = match body {
            ScanEventBody::HostStarted { host }
            | ScanEventBody::AgentWait { host }
            | ScanEventBody::HostRunning { host }
            | ScanEventBody::Step { host, .. }
            | ScanEventBody::Fact { host, .. }
            | ScanEventBody::HostFinished { host, .. } => host,
            _ => return,
        };
        let Some(p) = self.hosts.get_mut(host) else {
            return;
        };
        match body {
            ScanEventBody::HostStarted { .. } => p.state = HostState::Connecting,
            ScanEventBody::AgentWait { .. } => p.state = HostState::AgentWait,
            ScanEventBody::HostRunning { .. } => p.state = HostState::Running,
            ScanEventBody::Step { group, .. } => {
                p.state = HostState::Running;
                p.step = Some(*group);
            }
            ScanEventBody::Fact { .. } => {
                p.state = HostState::Running;
                p.facts += 1;
            }
            ScanEventBody::HostFinished {
                outcome,
                facts,
                dropped,
                ..
            } => {
                p.state = HostState::Finished {
                    outcome: outcome.clone(),
                };
                p.facts = *facts;
                p.dropped = *dropped;
            }
            _ => {}
        }
    }
}
