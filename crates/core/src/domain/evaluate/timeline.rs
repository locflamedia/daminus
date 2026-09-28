//! Walks one result key through the retained history, oldest first, and
//! decides what the latest scan says about it.

use std::collections::HashMap;

use crate::domain::fact::{CheckFact, CheckKey};
use crate::domain::manifest::CheckGroup;
use crate::domain::rule::SeverityRule;
use crate::domain::severity::{Severity, UnknownReason};
use crate::domain::snapshot::Snapshot;

use super::report::{Delta, Disposition};

/// What the latest scan concluded for one key, before expected rules.
#[derive(Debug)]
pub(super) struct Verdict<'h> {
    pub severity: Severity,
    pub disposition: Disposition,
    pub delta: Option<Delta>,
    pub fact: Option<&'h CheckFact>,
    pub checked_seq: Option<u32>,
}

/// The last real measurement of the key.
struct Checked<'h> {
    seq: u32,
    fact: &'h CheckFact,
    severity: Severity,
}

enum Seen<'h> {
    /// A real measurement.
    Checked,
    /// Verified absent: host reached, group finished, no result.
    Gone,
    /// No verdict this scan; the fact (if any) only says why.
    Unchecked(UnknownReason, Option<&'h CheckFact>),
}

/// A snapshot with its facts indexed by key (first fact wins on duplicates).
pub(super) struct Indexed<'h> {
    pub snap: &'h Snapshot,
    facts: HashMap<CheckKey, &'h CheckFact>,
}

impl<'h> Indexed<'h> {
    pub fn new(snap: &'h Snapshot) -> Self {
        let mut facts = HashMap::new();
        for (host, list) in &snap.facts {
            for f in list {
                facts.entry(CheckKey::of(host, f)).or_insert(f);
            }
        }
        Self { snap, facts }
    }
}

/// `history` is oldest first and non-empty. Returns `None` when there is
/// nothing to report (never an issue and now gone).
pub(super) fn walk<'h>(
    history: &[Indexed<'h>],
    key: &CheckKey,
    group: CheckGroup,
    rule: &SeverityRule,
) -> Option<Verdict<'h>> {
    let mut last: Option<Checked<'h>> = None;
    // Severity as of the end of each scan; `None` until anything is known.
    let mut effective: Option<Severity> = None;
    let mut before_latest: Option<Severity> = None;
    let mut open_streak = 0u32;
    let mut seen = Seen::Gone;

    for (i, indexed) in history.iter().enumerate() {
        let snap = indexed.snap;
        if i + 1 == history.len() {
            before_latest = effective;
        }
        seen = match indexed.facts.get(key).copied() {
            Some(fact) if fact.unknown.is_none() => {
                let severity = rule.grade(fact, last.as_ref().map(|c| c.fact));
                last = Some(Checked {
                    seq: snap.seq,
                    fact,
                    severity,
                });
                effective = Some(severity);
                Seen::Checked
            }
            Some(fact) => {
                let reason = fact.unknown.unwrap_or(UnknownReason::Missing);
                if last.is_none() {
                    effective = Some(Severity::Unknown(reason));
                }
                Seen::Unchecked(reason, Some(fact))
            }
            None if snap.covered(&key.host, group) => {
                // Verified gone: a later stale scan must not bring it back.
                last = None;
                effective = Some(Severity::Ok);
                Seen::Gone
            }
            None => {
                let reason = match snap.outcome(&key.host) {
                    // Reached, but this group's step did not finish.
                    Some(o) if o.is_reached() => UnknownReason::Timeout,
                    Some(o) => o.unknown_reason(),
                    // Not part of this scan (excluded or not asked).
                    None => UnknownReason::Unreachable,
                };
                Seen::Unchecked(reason, None)
            }
        };
        open_streak = if effective.is_some_and(Severity::is_issue) {
            open_streak + 1
        } else {
            0
        };
    }

    let latest = history.last()?.snap;
    let was_issue = before_latest.filter(|s| s.is_issue());
    let fixed_ok = latest.covered(&key.host, group);

    match seen {
        Seen::Checked => {
            let c = last?;
            let delta = if c.severity.is_issue() {
                Some(match was_issue {
                    Some(prev) if prev == c.severity => Delta::Still {
                        scans_open: open_streak,
                    },
                    Some(prev) => Delta::Changed {
                        from: prev,
                        to: c.severity,
                    },
                    None => Delta::New,
                })
            } else if was_issue.is_some() && fixed_ok {
                Some(Delta::Fixed)
            } else {
                None
            };
            Some(Verdict {
                severity: c.severity,
                disposition: Disposition::Active,
                delta,
                fact: Some(c.fact),
                checked_seq: Some(c.seq),
            })
        }
        Seen::Gone => was_issue.map(|_| Verdict {
            severity: Severity::Ok,
            disposition: Disposition::Active,
            delta: Some(Delta::Fixed),
            fact: None,
            checked_seq: Some(latest.seq),
        }),
        Seen::Unchecked(reason, fact) => match last {
            Some(c) => Some(Verdict {
                severity: c.severity,
                disposition: Disposition::Stale { since_seq: c.seq },
                delta: c.severity.is_issue().then_some(Delta::Still {
                    scans_open: open_streak,
                }),
                fact: Some(c.fact),
                checked_seq: Some(c.seq),
            }),
            // Verified gone earlier and unchecked now: nothing to say.
            None if effective == Some(Severity::Ok) => None,
            None => Some(Verdict {
                severity: Severity::Unknown(reason),
                disposition: Disposition::Active,
                delta: None,
                fact,
                checked_seq: None,
            }),
        },
    }
}
