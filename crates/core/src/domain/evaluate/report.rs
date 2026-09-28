//! The output of `evaluate`: what every screen, the menu bar, the CLI and the
//! AI payload read. It carries keys, numbers and codes, never display text.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::datetime::Timestamp;
use crate::domain::fact::{CheckFact, CheckKey};
use crate::domain::host::{HostAlias, HostRef};
use crate::domain::manifest::CheckGroup;
use crate::domain::severity::{Level, Severity};
use crate::domain::snapshot::HostOutcome;

/// Whether a result counts as it stands.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Disposition {
    /// Measured in the latest scan (or never measured: severity is unknown).
    Active,
    /// Matches an expected rule: shown, but does not colour cards or count as an issue.
    /// `stale_since` is set when the result was not re-checked in the latest
    /// scan, so an expected issue on an unreachable host still reads as stale.
    Expected {
        rule: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        stale_since: Option<u32>,
    },
    /// Not re-checked in the latest scan (host not reached, group unfinished).
    /// Keeps the severity it had when last checked, in scan `since_seq`.
    Stale { since_seq: u32 },
}

impl Disposition {
    /// Scan since which the result has not been re-checked, if it is stale.
    pub fn stale_since(&self) -> Option<u32> {
        match self {
            Disposition::Stale { since_seq } => Some(*since_seq),
            Disposition::Expected { stale_since, .. } => *stale_since,
            Disposition::Active => None,
        }
    }
}

/// Change against the previous scan.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Delta {
    /// Became warn or crit in this scan.
    New,
    /// Was warn or crit and is now fine; only when the host was reached and the group finished.
    Fixed,
    /// Still warn or crit; `scans_open` counts the scans in a row it has been open.
    Still { scans_open: u32 },
    /// Still an issue, at a different level.
    Changed { from: Severity, to: Severity },
}

/// Who a result belongs to, so each issue is counted once.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Owner {
    Project { id: String },
    Server { host: HostRef },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Item {
    pub key: CheckKey,
    pub group: CheckGroup,
    pub owner: Owner,
    pub severity: Severity,
    pub disposition: Disposition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delta: Option<Delta>,
    /// The fact behind the severity: the latest one, or the last checked one when stale.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fact: Option<CheckFact>,
    /// Scan in which the result was last really checked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked_seq: Option<u32>,
    /// An expected rule on this key whose evidence changed ("was expected, now different").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rule_broken: Option<String>,
}

impl Item {
    /// Warn or crit that colours a card and counts as an issue.
    pub fn is_open_issue(&self) -> bool {
        self.severity.is_issue() && !matches!(self.disposition, Disposition::Expected { .. })
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Counts {
    pub crit: u32,
    pub warn: u32,
    pub expected: u32,
    pub needs_perm: u32,
    pub stale: u32,
    /// Unknown for reasons other than permissions.
    pub unknown: u32,
}

/// The one issue a card leads with. The UI words it from `key.check` + `params`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct MainIssue {
    pub key: CheckKey,
    pub params: BTreeMap<String, Value>,
    pub severity: Severity,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ProjectRollup {
    pub id: String,
    /// Worst open issue; expected and needs-permission results never colour it.
    pub level: Level,
    pub counts: Counts,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub main_issue: Option<MainIssue>,
    /// Hosts of this project that did not answer the latest scan (a card state of its own).
    pub unreachable_hosts: Vec<HostAlias>,
    /// Hosts of this project left out of the latest scan (excluded or not asked).
    pub not_scanned_hosts: Vec<HostAlias>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ServerRollup {
    pub host: HostAlias,
    /// Outcome in the latest scan; `None` when the host was not part of it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<HostOutcome>,
    pub included: bool,
    /// Last scan that reached the host, and when it finished.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_reached_seq: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_reached_at: Option<Timestamp>,
    /// Over every result on the host, whoever owns it.
    pub level: Level,
    pub counts: Counts,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub main_issue: Option<MainIssue>,
    /// Ids of projects with a component on this host.
    pub used_by: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Report {
    /// Latest scan number; `None` before the first scan.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seq: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scanned_at: Option<Timestamp>,
    pub evaluated_at: Timestamp,
    pub items: Vec<Item>,
    pub projects: Vec<ProjectRollup>,
    pub servers: Vec<ServerRollup>,
    /// Groups switched off in Settings: not evaluated, shown as "off in Settings".
    pub disabled_groups: Vec<CheckGroup>,
    /// Expected rules past their review date; they no longer apply.
    pub rules_due: Vec<String>,
    /// Every item counted once.
    pub counts: Counts,
}
