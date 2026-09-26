//! Severity rules: the small closed set of ways a manifest entry turns a raw
//! fact into a level. Each rule is a pure function of the fact (and, for
//! `increase`, the previous value of the same key), with table tests.

mod grade;
#[cfg(test)]
mod tests;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::severity::Level;

/// How a measured number compares to a threshold.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Cmp {
    /// Worse when greater (`value > warn`).
    #[default]
    Gt,
    /// Worse when greater or equal (`value >= warn`).
    Gte,
    /// Worse when lower (`value < warn`), e.g. free memory.
    Lt,
    /// Worse when lower or equal.
    Lte,
}

/// Multiplies thresholds by a fact field before comparing.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Scale {
    /// `data.cores`: load thresholds are per core.
    Cores,
}

/// A path into a fact: `value`, or `data.<key>[.<key>…]`.
pub type Field = String;

/// One severity rule from the manifest. Serialized with a `type` tag.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum SeverityRule {
    /// Number against warn/crit limits (load × cores, memory, swap, PSI, disk %).
    /// Without `crit` the rule never goes past warn (container restarts).
    Threshold {
        field: Field,
        warn: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        crit: Option<f64>,
        #[serde(default)]
        cmp: Cmp,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        scale: Option<Scale>,
    },
    /// The worst of several rules (disk % and inode %).
    MaxOf { rules: Vec<SeverityRule> },
    /// Existing is the problem (PHP in uploads, preload, miner, open DB port).
    /// A fact with `value` 0 means "looked, found none" and grades ok.
    Present { severity: Level },
    /// A state string mapped to a level (container or pm2 status).
    StateMap {
        field: Field,
        map: BTreeMap<String, Level>,
        /// Level for a state missing from `map`.
        #[serde(default = "default_state_level")]
        default: Level,
    },
    /// The field grew by at least `min` since the previous scan (restarts).
    Increase {
        field: Field,
        severity: Level,
        #[serde(default = "one")]
        min: f64,
    },
    /// Days left on the `value` (TLS). Any truthy `data.<flag>` is crit.
    DaysLeft {
        warn: f64,
        crit: f64,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        flags: Vec<String>,
    },
    /// Shown only; the delta is the signal (sizes, recent changes).
    Info,
}

fn default_state_level() -> Level {
    Level::Warn
}

fn one() -> f64 {
    1.0
}

/// A user threshold for one check, from Settings › Scan or a project sheet.
/// `field` narrows it to rules on that field; otherwise it applies to every
/// thresholded rule of the check. `min` sets `increase` rules.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ThresholdOverride {
    pub check: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field: Option<Field>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warn: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crit: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
}

impl SeverityRule {
    /// A copy of the rule with the overrides for `check` applied in order.
    pub fn with_overrides<'a, I>(&self, check: &str, overrides: I) -> SeverityRule
    where
        I: IntoIterator<Item = &'a ThresholdOverride>,
    {
        let mut rule = self.clone();
        for o in overrides.into_iter().filter(|o| o.check == check) {
            rule.apply(o);
        }
        rule
    }

    fn apply(&mut self, o: &ThresholdOverride) {
        let field_ok = |f: &Field| o.field.as_ref().is_none_or(|want| want == f);
        match self {
            SeverityRule::Threshold {
                field, warn, crit, ..
            } if field_ok(field) => {
                *warn = o.warn.unwrap_or(*warn);
                *crit = o.crit.or(*crit);
            }
            SeverityRule::DaysLeft { warn, crit, .. } if o.field.is_none() => {
                *warn = o.warn.unwrap_or(*warn);
                *crit = o.crit.unwrap_or(*crit);
            }
            SeverityRule::Increase { field, min, .. } if field_ok(field) => {
                *min = o.min.unwrap_or(*min);
            }
            SeverityRule::MaxOf { rules } => rules.iter_mut().for_each(|r| r.apply(o)),
            _ => {}
        }
    }
}
