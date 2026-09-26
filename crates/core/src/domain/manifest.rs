//! The check manifest: one entry per check id, naming its group, where it runs
//! and the severity rule that grades its facts. The manifest file itself
//! (`checks/manifest.json`) arrives with the check runtime; this is its typed
//! shape. Unknown keys are ignored so later fields do not break older readers.

use serde::{Deserialize, Serialize};

use super::rule::SeverityRule;

/// A group of checks that the user switches on or off as one (Settings › Scan).
/// `System` (load, memory, swap, pressure, OOM) is always on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum CheckGroup {
    System,
    Disk,
    Containers,
    Databases,
    Security,
    Uptime,
    CodeChanges,
}

impl CheckGroup {
    /// Whether Settings › Scan can switch this group off.
    pub fn can_disable(self) -> bool {
        self != CheckGroup::System
    }
}

/// Where a check runs.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Runs {
    /// In the bundle on the server, over SSH.
    Remote,
    /// On this Mac (URL probes).
    Local,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CheckSpec {
    pub id: String,
    pub group: CheckGroup,
    pub runs: Runs,
    pub rule: SeverityRule,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Manifest {
    pub checks: Vec<CheckSpec>,
}

impl Manifest {
    pub fn get(&self, id: &str) -> Option<&CheckSpec> {
        self.checks.iter().find(|c| c.id == id)
    }
}
