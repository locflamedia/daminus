//! Grading one fact with one rule.

use serde_json::Value;

use super::{Cmp, Scale, SeverityRule};
use crate::domain::fact::CheckFact;
use crate::domain::severity::{Level, Severity, UnknownReason};

const MISSING: Severity = Severity::Unknown(UnknownReason::Missing);

impl SeverityRule {
    /// Severity of `fact`. `prev` is the last checked fact for the same key in
    /// an earlier scan (only `increase` uses it). A fact that carries an
    /// unknown reason is unknown whatever the rule; a fact missing the field a
    /// rule needs is `Unknown(Missing)`.
    pub fn grade(&self, fact: &CheckFact, prev: Option<&CheckFact>) -> Severity {
        if let Some(reason) = fact.unknown {
            return Severity::Unknown(reason);
        }
        match self {
            SeverityRule::Threshold {
                field,
                warn,
                crit,
                cmp,
                scale,
            } => {
                let Some(v) = number(fact, field) else {
                    return MISSING;
                };
                let factor = match scale {
                    None => 1.0,
                    Some(Scale::Cores) => match number(fact, "data.cores") {
                        Some(c) if c > 0.0 => c,
                        _ => return MISSING,
                    },
                };
                threshold(v, warn * factor, crit.map(|c| c * factor), *cmp).into()
            }
            SeverityRule::MaxOf { rules } => {
                Severity::worst(rules.iter().map(|r| r.grade(fact, prev)))
            }
            SeverityRule::Present { severity } => match fact.value {
                Some(0.0) => Severity::Ok,
                _ => (*severity).into(),
            },
            SeverityRule::StateMap {
                field,
                map,
                default,
            } => match lookup(fact, field) {
                Some(Value::String(s)) => map.get(s).copied().unwrap_or(*default).into(),
                Some(Value::Bool(b)) => map.get(&b.to_string()).copied().unwrap_or(*default).into(),
                Some(Value::Number(n)) => {
                    map.get(&n.to_string()).copied().unwrap_or(*default).into()
                }
                _ => MISSING,
            },
            SeverityRule::Increase {
                field,
                severity,
                min,
            } => {
                let Some(now) = number(fact, field) else {
                    return MISSING;
                };
                match prev.and_then(|p| number(p, field)) {
                    Some(before) if now - before >= *min => (*severity).into(),
                    _ => Severity::Ok,
                }
            }
            SeverityRule::DaysLeft { warn, crit, flags } => {
                if flags
                    .iter()
                    .any(|f| truthy(lookup(fact, &format!("data.{f}"))))
                {
                    return Severity::Crit;
                }
                let Some(days) = fact.value else {
                    return MISSING;
                };
                threshold(days, *warn, Some(*crit), Cmp::Lt).into()
            }
            SeverityRule::Info => Severity::Info,
        }
    }
}

fn threshold(v: f64, warn: f64, crit: Option<f64>, cmp: Cmp) -> Level {
    let past = |limit: f64| match cmp {
        Cmp::Gt => v > limit,
        Cmp::Gte => v >= limit,
        Cmp::Lt => v < limit,
        Cmp::Lte => v <= limit,
    };
    if crit.is_some_and(past) {
        Level::Crit
    } else if past(warn) {
        Level::Warn
    } else {
        Level::Ok
    }
}

/// Resolves `value` or `data.a.b` in a fact. `value` is returned as a JSON number.
fn lookup<'a>(fact: &'a CheckFact, field: &str) -> Option<&'a Value> {
    let mut parts = field.split('.');
    match parts.next()? {
        "data" => parts.try_fold(&fact.data, |v, key| v.get(key)),
        _ => None,
    }
}

fn number(fact: &CheckFact, field: &str) -> Option<f64> {
    if field == "value" {
        return fact.value.filter(|v| v.is_finite());
    }
    lookup(fact, field)
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite())
}

fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|x| x != 0.0),
        // Only the exact word counts: "false", "0" or "no" must not grade Crit.
        Some(Value::String(s)) => s == "true",
        _ => false,
    }
}
