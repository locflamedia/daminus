//! Writing "mark as expected" rules. The webview names a result, why it is fine, how far the rule
//! reaches and when to look again; everything else (the evidence fingerprint, the review day, the
//! id) is taken here from the latest report, so a rule can only cover a result that exists and
//! its fingerprint never comes from the webview.

use serde::{Deserialize, Serialize};

use crate::domain::datetime::{Day, Timestamp};
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::evaluate::Item;
use crate::domain::expected::{ExpectedReason, ExpectedRule};
use crate::domain::host::HostRef;
use crate::domain::severity::Severity;
use crate::store::{FsStore, PROJECTS_FILE};

use super::latest_report;

/// The longest note a rule keeps, in characters.
pub const MAX_NOTE_CHARS: usize = 200;

/// The review periods the popover offers; "never" is `None`.
pub const REVIEW_DAYS: [u32; 2] = [30, 90];

/// How far a rule reaches.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Covers {
    /// This evidence, as it is now: a different fingerprint breaks the rule.
    AsItIs,
    /// Whatever the evidence is at this target.
    AnyEvidence,
}

/// What the person chose in the popover.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ExpectedDraft {
    pub host: HostRef,
    pub check: String,
    pub target: String,
    pub reason: ExpectedReason,
    pub covers: Covers,
    /// Days until the rule comes back for review; `None` is "never".
    #[serde(default)]
    pub review_days: Option<u32>,
    #[serde(default)]
    pub note: String,
}

fn refused(detail: &str) -> AppError {
    AppError::from(ErrorCode::SchemaInvalid).with_param("detail", detail)
}

/// The rule for `draft`, checked against the result it covers. A critical result, and a risk
/// that is accepted for now, always has a review day; a critical one is always bound to its
/// evidence, so it comes back the moment the evidence changes.
pub fn make_rule(
    draft: ExpectedDraft,
    items: &[Item],
    taken_ids: &[&str],
    now: Timestamp,
) -> Result<ExpectedRule, AppError> {
    let item = items
        .iter()
        .find(|i| {
            i.key.host == draft.host && i.key.check == draft.check && i.key.target == draft.target
        })
        .ok_or_else(|| refused("rule_no_result"))?;
    if !item.severity.is_issue() {
        return Err(refused("rule_not_an_issue"));
    }
    if draft.review_days.is_some_and(|d| !REVIEW_DAYS.contains(&d)) {
        return Err(refused("rule_review_days"));
    }
    let critical = item.severity == Severity::Crit;
    if (critical || draft.reason == ExpectedReason::AcceptedRisk) && draft.review_days.is_none() {
        return Err(refused("rule_needs_date"));
    }
    if critical && draft.covers == Covers::AnyEvidence {
        return Err(refused("rule_critical_any"));
    }
    let note = draft.note.trim();
    if note.chars().count() > MAX_NOTE_CHARS || note.chars().any(char::is_control) {
        return Err(refused("rule_note"));
    }
    let fp = match draft.covers {
        Covers::AsItIs => Some(
            item.fact
                .as_ref()
                .and_then(|f| f.fp.clone())
                .ok_or_else(|| refused("rule_no_evidence"))?,
        ),
        Covers::AnyEvidence => None,
    };
    let until = draft.review_days.and_then(|days| {
        now.date()
            .inner()
            .checked_add(time::Duration::days(i64::from(days)))
            .map(Day::new)
    });
    Ok(ExpectedRule {
        id: free_id(now, taken_ids),
        host: draft.host,
        check: draft.check,
        target: draft.target,
        fp,
        reason: draft.reason,
        until,
        note: note.to_owned(),
    })
}

fn free_id(now: Timestamp, taken: &[&str]) -> String {
    (0..)
        .map(|n| format!("r{}-{n}", now.unix()))
        .find(|id| !taken.contains(&id.as_str()))
        .unwrap_or_default()
}

fn writable(
    stamped: &crate::store::Stamped<crate::domain::project::ProjectsFile>,
) -> Result<(), AppError> {
    if stamped.read_only {
        return Err(ErrorCode::ConfigFromNewerVersion {
            path: PROJECTS_FILE.to_owned(),
            version: stamped.value.version,
        }
        .into());
    }
    Ok(())
}

/// Checks `draft` against the latest report and saves the rule in `projects.json`, replacing a
/// rule that already covers the same result. Returns the rule as saved.
pub fn add_rule(
    store: &FsStore,
    draft: ExpectedDraft,
    now: Timestamp,
) -> Result<ExpectedRule, AppError> {
    let report = latest_report(store, now)?;
    let stamped = store.load_projects()?;
    writable(&stamped)?;
    let stamp = stamped.stamp;
    let mut file = stamped.value;
    let taken: Vec<&str> = file.rules.iter().map(|r| r.id.as_str()).collect();
    let rule = make_rule(draft, &report.items, &taken, now)?;
    file.rules.retain(|r| !r.covers(&rule.key()));
    file.rules.push(rule.clone());
    store.save_projects(&file, stamp)?;
    Ok(rule)
}

/// Takes a rule out (the toast's Undo). `false` when it was not there.
pub fn remove_rule(store: &FsStore, id: &str) -> Result<bool, AppError> {
    let stamped = store.load_projects()?;
    writable(&stamped)?;
    let stamp = stamped.stamp;
    let mut file = stamped.value;
    let before = file.rules.len();
    file.rules.retain(|r| r.id != id);
    if file.rules.len() == before {
        return Ok(false);
    }
    store.save_projects(&file, stamp)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::evaluate::{Disposition, Owner};
    use crate::domain::fact::{CheckFact, CheckKey};
    use crate::domain::manifest::CheckGroup;
    use time::macros::datetime;

    fn now() -> Timestamp {
        Timestamp::new(datetime!(2026-09-26 13:42 UTC))
    }

    fn item(severity: Severity, fp: Option<&str>) -> Item {
        let host = HostRef::parse("vps-sg-2").unwrap();
        let mut fact = CheckFact::new("sec.upload_php", "/srv/b/uploads/index.php");
        fact.fp = fp.map(Into::into);
        Item {
            key: CheckKey::new(host.clone(), "sec.upload_php", "/srv/b/uploads/index.php"),
            group: CheckGroup::Security,
            owner: Owner::Server { host },
            severity,
            disposition: Disposition::Active,
            delta: None,
            fact: Some(fact),
            checked_seq: Some(1),
            rule_broken: None,
        }
    }

    fn draft() -> ExpectedDraft {
        ExpectedDraft {
            host: HostRef::parse("vps-sg-2").unwrap(),
            check: "sec.upload_php".into(),
            target: "/srv/b/uploads/index.php".into(),
            reason: ExpectedReason::Intended,
            covers: Covers::AsItIs,
            review_days: Some(30),
            note: "  silence file  ".into(),
        }
    }

    fn code(e: &AppError) -> &str {
        e.params.get("detail").map_or("", String::as_str)
    }

    #[test]
    fn a_rule_takes_its_fingerprint_and_day_from_the_result() {
        let items = [item(Severity::Crit, Some("52:1:9f"))];
        let rule = make_rule(draft(), &items, &[], now()).unwrap();
        assert_eq!(rule.fp.as_deref(), Some("52:1:9f"));
        assert_eq!(rule.until.unwrap().inner().to_string(), "2026-10-26");
        assert_eq!(rule.note, "silence file");
        assert_eq!(rule.id, "r1790430120-0");
    }

    #[test]
    fn any_evidence_leaves_the_fingerprint_out_for_a_warning() {
        let items = [item(Severity::Warn, Some("52:1:9f"))];
        let any = ExpectedDraft {
            covers: Covers::AnyEvidence,
            review_days: None,
            ..draft()
        };
        let rule = make_rule(any, &items, &[], now()).unwrap();
        assert_eq!((rule.fp, rule.until), (None, None));
    }

    #[test]
    fn a_critical_result_needs_a_day_and_its_evidence() {
        let items = [item(Severity::Crit, Some("52:1:9f"))];
        let never = ExpectedDraft {
            review_days: None,
            ..draft()
        };
        assert_eq!(
            code(&make_rule(never, &items, &[], now()).unwrap_err()),
            "rule_needs_date"
        );
        let any = ExpectedDraft {
            covers: Covers::AnyEvidence,
            ..draft()
        };
        assert_eq!(
            code(&make_rule(any, &items, &[], now()).unwrap_err()),
            "rule_critical_any"
        );
    }

    #[test]
    fn as_it_is_needs_evidence_to_hold_on_to() {
        for severity in [Severity::Crit, Severity::Warn] {
            let items = [item(severity, None)];
            assert_eq!(
                code(&make_rule(draft(), &items, &[], now()).unwrap_err()),
                "rule_no_evidence"
            );
        }
    }

    #[test]
    fn an_accepted_risk_needs_a_day() {
        let items = [item(Severity::Warn, None)];
        let risk = ExpectedDraft {
            reason: ExpectedReason::AcceptedRisk,
            review_days: None,
            ..draft()
        };
        assert_eq!(
            code(&make_rule(risk, &items, &[], now()).unwrap_err()),
            "rule_needs_date"
        );
    }

    #[test]
    fn only_an_existing_open_result_can_be_covered() {
        let ok = [item(Severity::Ok, None)];
        assert_eq!(
            code(&make_rule(draft(), &ok, &[], now()).unwrap_err()),
            "rule_not_an_issue"
        );
        assert_eq!(
            code(&make_rule(draft(), &[], &[], now()).unwrap_err()),
            "rule_no_result"
        );
    }

    #[test]
    fn a_bad_period_or_note_is_refused() {
        let items = [item(Severity::Warn, None)];
        let days = ExpectedDraft {
            review_days: Some(7),
            ..draft()
        };
        assert_eq!(
            code(&make_rule(days, &items, &[], now()).unwrap_err()),
            "rule_review_days"
        );
        let long = ExpectedDraft {
            note: "x".repeat(MAX_NOTE_CHARS + 1),
            ..draft()
        };
        assert_eq!(
            code(&make_rule(long, &items, &[], now()).unwrap_err()),
            "rule_note"
        );
        let control = ExpectedDraft {
            note: "a\u{7}b".into(),
            ..draft()
        };
        assert_eq!(
            code(&make_rule(control, &items, &[], now()).unwrap_err()),
            "rule_note"
        );
    }

    #[test]
    fn ids_do_not_repeat() {
        let items = [item(Severity::Warn, None)];
        let any = ExpectedDraft {
            covers: Covers::AnyEvidence,
            ..draft()
        };
        let rule = make_rule(any, &items, &["r1790430120-0"], now()).unwrap();
        assert_eq!(rule.id, "r1790430120-1");
    }

    #[test]
    fn saving_needs_a_result_in_the_report_and_undo_of_an_unknown_rule_says_no() {
        let dir = tempfile::tempdir().unwrap();
        let store = FsStore::new(dir.path());
        // No scan has run: the report has no items, so nothing can be covered yet.
        let e = add_rule(&store, draft(), now()).unwrap_err();
        assert_eq!(code(&e), "rule_no_result");
        assert!(!remove_rule(&store, "nope").unwrap());
    }
}
