//! "Mark as expected" rules (board 13). A rule silences one result key while
//! its evidence stays the same and until its review date passes.

use serde::{Deserialize, Serialize};

use super::datetime::{Day, Timestamp};
use super::fact::CheckKey;
use super::host::HostRef;

/// Why the user trusts the finding.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum ExpectedReason {
    /// It is meant to be there.
    Intended,
    /// Known problem, fixed later (needs a date).
    AcceptedRisk,
    /// The check is wrong here.
    FalsePositive,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ExpectedRule {
    pub id: String,
    pub host: HostRef,
    pub check: String,
    pub target: String,
    /// Evidence fingerprint when the rule covers "this file, as it is now".
    /// `None` covers any evidence at the target. A different fingerprint
    /// breaks the rule and the finding is reported again.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fp: Option<String>,
    pub reason: ExpectedReason,
    /// Review date: the rule stops applying after this day (UTC).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub until: Option<Day>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub note: String,
}

/// How a rule relates to the current evidence for its key.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuleMatch {
    /// Applies: the result is expected.
    Holds,
    /// The evidence changed since the rule was made.
    EvidenceChanged,
}

impl ExpectedRule {
    pub fn key(&self) -> CheckKey {
        CheckKey::new(self.host.clone(), self.check.clone(), self.target.clone())
    }

    pub fn covers(&self, key: &CheckKey) -> bool {
        self.host == key.host && self.check == key.check && self.target == key.target
    }

    /// Expired once `now` is past the `until` day.
    pub fn is_expired(&self, now: Timestamp) -> bool {
        self.until.is_some_and(|until| now.date() > until)
    }

    pub fn check_evidence(&self, fp: Option<&str>) -> RuleMatch {
        match &self.fp {
            Some(want) if Some(want.as_str()) != fp => RuleMatch::EvidenceChanged,
            _ => RuleMatch::Holds,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::{date, datetime};

    fn rule(fp: Option<&str>, until: Option<Day>) -> ExpectedRule {
        ExpectedRule {
            id: "r1".into(),
            host: HostRef::parse("vps-sg-2").unwrap(),
            check: "sec.upload_php".into(),
            target: "/srv/booking/storage/app/public/uploads/index.php".into(),
            fp: fp.map(Into::into),
            reason: ExpectedReason::Intended,
            until,
            note: "Laravel silence file".into(),
        }
    }

    #[test]
    fn expires_after_the_until_day() {
        let r = rule(None, Some(Day::new(date!(2026 - 10 - 26))));
        assert!(!r.is_expired(Timestamp::new(datetime!(2026-10-26 23:59 UTC))));
        assert!(r.is_expired(Timestamp::new(datetime!(2026-10-27 00:00 UTC))));
        assert!(!rule(None, None).is_expired(Timestamp::new(datetime!(2099-01-01 00:00 UTC))));
    }

    #[test]
    fn fingerprint_change_breaks_the_rule() {
        let r = rule(Some("52:1710400000:9f3a1c"), None);
        assert_eq!(
            r.check_evidence(Some("52:1710400000:9f3a1c")),
            RuleMatch::Holds
        );
        assert_eq!(
            r.check_evidence(Some("3481:1790000000:0b77e2")),
            RuleMatch::EvidenceChanged
        );
        assert_eq!(r.check_evidence(None), RuleMatch::EvidenceChanged);
        assert_eq!(
            rule(None, None).check_evidence(Some("anything")),
            RuleMatch::Holds
        );
    }
}
