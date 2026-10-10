//! A snapshot is the raw record of one finished scan: what each host said and
//! how far each host got. Delta, expected, stale and rollups are computed at
//! read time by `evaluate`, never stored.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::datetime::Timestamp;
use super::fact::{CheckFact, CheckKey};
use super::host::HostRef;
use super::manifest::CheckGroup;
use super::severity::UnknownReason;

/// Current snapshot format version. Older snapshots are read leniently, never migrated.
pub const SNAPSHOT_VERSION: u32 = 1;

/// Network-level reason a host could not be reached.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum NetCause {
    Dns,
    Refused,
    NoRoute,
    ConnectTimeout,
    Other,
}

/// How one host's part of the scan ended. Serialized with a `state` tag.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum HostOutcome {
    /// The bundle ran to its `end` line.
    Reached,
    /// Output stopped before `end`; groups not in coverage are unverified.
    Partial,
    Unreachable {
        cause: NetCause,
    },
    AuthFailed,
    HostKeyUnknown {
        fp: String,
    },
    HostKeyChanged {
        fp: String,
    },
    /// The per-host budget ran out.
    Timeout,
    /// The alias is no longer in `~/.ssh/config`, and ssh failed to look it up
    /// as a DNS name.
    NotInConfig,
}

impl HostOutcome {
    /// Whether any output from the host can be trusted as complete.
    pub fn is_reached(&self) -> bool {
        matches!(self, HostOutcome::Reached)
    }

    /// Whether the host produced any output at all.
    pub fn answered(&self) -> bool {
        matches!(self, HostOutcome::Reached | HostOutcome::Partial)
    }

    /// The reason to show for results this outcome left unchecked.
    pub fn unknown_reason(&self) -> UnknownReason {
        match self {
            HostOutcome::Partial | HostOutcome::Timeout => UnknownReason::Timeout,
            _ => UnknownReason::Unreachable,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Snapshot {
    #[serde(default = "v1")]
    pub v: u32,
    /// Scan number, assigned by the store when the snapshot is saved.
    #[serde(default)]
    pub seq: u32,
    pub started_at: Timestamp,
    pub finished_at: Timestamp,
    /// Hash of the check bundle that ran, to tell apart results of different check versions.
    #[serde(default)]
    pub bundle_hash: String,
    #[serde(default)]
    pub hosts: BTreeMap<HostRef, HostOutcome>,
    /// Check groups each host finished (`step` lines). `@local` covers `uptime`.
    #[serde(default)]
    pub coverage: BTreeMap<HostRef, BTreeSet<CheckGroup>>,
    #[serde(default)]
    pub facts: BTreeMap<HostRef, Vec<CheckFact>>,
    /// How long each host took, in total and per finished group.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub timing: BTreeMap<HostRef, HostTiming>,
}

/// Time one host took in a scan, measured on this Mac (`ms`) and on the
/// server for each group that finished (`steps`, from the `step` lines).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostTiming {
    pub ms: u32,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub steps: BTreeMap<CheckGroup, u32>,
}

fn v1() -> u32 {
    SNAPSHOT_VERSION
}

impl Snapshot {
    pub fn new(started_at: Timestamp, finished_at: Timestamp) -> Self {
        Self {
            v: SNAPSHOT_VERSION,
            seq: 0,
            started_at,
            finished_at,
            bundle_hash: String::new(),
            hosts: BTreeMap::new(),
            coverage: BTreeMap::new(),
            facts: BTreeMap::new(),
            timing: BTreeMap::new(),
        }
    }

    pub fn outcome(&self, host: &HostRef) -> Option<&HostOutcome> {
        self.hosts.get(host)
    }

    /// Whether this scan fully verified `group` on `host`: the host was reached
    /// (bundle ran to `end`) and the group's step completed. Only then can a
    /// missing result mean "gone" and an old issue be called fixed.
    pub fn covered(&self, host: &HostRef, group: CheckGroup) -> bool {
        self.hosts.get(host).is_some_and(HostOutcome::is_reached)
            && self.coverage.get(host).is_some_and(|g| g.contains(&group))
    }

    /// The fact for `key`, if this scan produced one.
    pub fn fact(&self, key: &CheckKey) -> Option<&CheckFact> {
        self.facts
            .get(&key.host)?
            .iter()
            .find(|f| f.check == key.check && f.target == key.target)
    }

    /// Every result key in this snapshot.
    pub fn keys(&self) -> impl Iterator<Item = CheckKey> + '_ {
        self.facts
            .iter()
            .flat_map(|(h, fs)| fs.iter().map(move |f| CheckKey::of(h, f)))
    }
}
