//! Raw facts: what a check script or a probe measured, before any judgement.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::host::HostRef;
use super::severity::UnknownReason;

/// One raw result line. Severity is not part of it: Rust grades facts at read
/// time with the manifest rule, so a threshold change needs no rescan.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CheckFact {
    /// Check id from the manifest, e.g. `disk.fs`.
    pub check: String,
    /// What was checked: a mount point, a path, a container, a URL. Empty for
    /// checks with a single result per host (`sys.load`).
    #[serde(default)]
    pub target: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    /// Check-specific details (sizes, top lists, states). Arrays are capped at ingest.
    #[serde(default, skip_serializing_if = "Value::is_null")]
    pub data: Value,
    /// Evidence fingerprint (size + mtime + short sha256) for checks with evidence.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fp: Option<String>,
    /// Set when the check could not answer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unknown: Option<UnknownReason>,
}

impl CheckFact {
    pub fn new(check: impl Into<String>, target: impl Into<String>) -> Self {
        Self {
            check: check.into(),
            target: target.into(),
            value: None,
            unit: None,
            data: Value::Null,
            fp: None,
            unknown: None,
        }
    }

    pub fn with_value(mut self, value: f64, unit: impl Into<String>) -> Self {
        self.value = Some(value);
        self.unit = Some(unit.into());
        self
    }

    pub fn with_data(mut self, data: Value) -> Self {
        self.data = data;
        self
    }

    pub fn with_fp(mut self, fp: impl Into<String>) -> Self {
        self.fp = Some(fp.into());
        self
    }

    pub fn with_unknown(mut self, reason: UnknownReason) -> Self {
        self.unknown = Some(reason);
        self
    }
}

/// Identity of a result across scans: `(host, check, target)`. URL probes run
/// from this Mac use host `@local` and the URL as target.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CheckKey {
    pub host: HostRef,
    pub check: String,
    pub target: String,
}

impl CheckKey {
    pub fn new(host: HostRef, check: impl Into<String>, target: impl Into<String>) -> Self {
        Self {
            host,
            check: check.into(),
            target: target.into(),
        }
    }

    pub fn of(host: &HostRef, fact: &CheckFact) -> Self {
        Self::new(host.clone(), fact.check.clone(), fact.target.clone())
    }
}
