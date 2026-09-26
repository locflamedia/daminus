//! The check manifest: one entry per check id, naming its group, where it runs
//! and the severity rule that grades its facts. The file is
//! `crates/core/checks/manifest.json` (embedded by `checks::manifest`, imported
//! by the UI through the `@checks` alias); this is its typed shape. Unknown keys
//! are ignored so later fields do not break older readers.

use std::collections::BTreeMap;

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

/// What a check's facts carry, in words, for contributors and reviewers.
/// Documentation only: nothing is validated against it.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct FactsDoc {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub target: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub data: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CheckSpec {
    pub id: String,
    pub group: CheckGroup,
    pub runs: Runs,
    /// File in `crates/core/checks/` for remote checks. A remote check without
    /// one is not in the bundle yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script: Option<String>,
    /// External commands the script may run on the server. CI rejects any
    /// other command (allowlist), so this is also the script's review list.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub needs: Vec<String>,
    #[serde(default, skip_serializing_if = "is_default")]
    pub facts: FactsDoc,
    /// How the evidence fingerprint `fp` is made, for checks with evidence.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fp: Option<String>,
    pub rule: SeverityRule,
}

fn is_default(doc: &FactsDoc) -> bool {
    *doc == FactsDoc::default()
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
