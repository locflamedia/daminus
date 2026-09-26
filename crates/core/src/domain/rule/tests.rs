use std::collections::BTreeMap;

use serde_json::json;

use super::*;
use crate::domain::fact::CheckFact;
use crate::domain::severity::{Severity, UnknownReason};

fn fact(value: Option<f64>, data: serde_json::Value) -> CheckFact {
    let mut f = CheckFact::new("x", "t").with_data(data);
    f.value = value;
    f
}

fn thr(field: &str, warn: f64, crit: f64, cmp: Cmp, scale: Option<Scale>) -> SeverityRule {
    SeverityRule::Threshold {
        field: field.into(),
        warn,
        crit: Some(crit),
        cmp,
        scale,
    }
}

const MISSING: Severity = Severity::Unknown(UnknownReason::Missing);

#[test]
fn threshold_table() {
    use Severity::*;
    let load = thr("data.load1", 1.0, 2.0, Cmp::Gt, Some(Scale::Cores));
    let mem = thr("value", 15.0, 5.0, Cmp::Lt, None);
    let oom = thr("value", 1.0, 5.0, Cmp::Gte, None);
    let disk = thr("data.pct", 80.0, 90.0, Cmp::Gte, None);
    let cases: Vec<(&SeverityRule, CheckFact, Severity)> = vec![
        (&load, fact(None, json!({"load1": 3.9, "cores": 4})), Ok),
        (&load, fact(None, json!({"load1": 4.1, "cores": 4})), Warn),
        (&load, fact(None, json!({"load1": 8.0, "cores": 4})), Warn),
        (&load, fact(None, json!({"load1": 8.1, "cores": 4})), Crit),
        (&load, fact(None, json!({"load1": 8.1})), MISSING),
        (
            &load,
            fact(None, json!({"load1": 8.1, "cores": 0})),
            MISSING,
        ),
        (&mem, fact(Some(40.0), json!(null)), Ok),
        (&mem, fact(Some(15.0), json!(null)), Ok),
        (&mem, fact(Some(14.9), json!(null)), Warn),
        (&mem, fact(Some(4.0), json!(null)), Crit),
        (&mem, fact(None, json!(null)), MISSING),
        (&oom, fact(Some(0.0), json!(null)), Ok),
        (&oom, fact(Some(1.0), json!(null)), Warn),
        (&oom, fact(Some(5.0), json!(null)), Crit),
        (&disk, fact(None, json!({"pct": 79})), Ok),
        (&disk, fact(None, json!({"pct": 80})), Warn),
        (&disk, fact(None, json!({"pct": 90})), Crit),
        (&disk, fact(None, json!({"pct": "90"})), MISSING),
    ];
    for (i, (rule, f, want)) in cases.into_iter().enumerate() {
        assert_eq!(rule.grade(&f, None), want, "case {i}: {f:?}");
    }
}

#[test]
fn threshold_without_crit_stops_at_warn() {
    let rule = SeverityRule::Threshold {
        field: "data.restarts".into(),
        warn: 0.0,
        crit: None,
        cmp: Cmp::Gt,
        scale: None,
    };
    assert_eq!(
        rule.grade(&fact(None, json!({"restarts": 0})), None),
        Severity::Ok
    );
    assert_eq!(
        rule.grade(&fact(None, json!({"restarts": 900})), None),
        Severity::Warn
    );
}

#[test]
fn max_of_takes_the_worse_of_disk_and_inodes() {
    let rule = SeverityRule::MaxOf {
        rules: vec![
            thr("data.pct", 80.0, 90.0, Cmp::Gte, None),
            thr("data.ipct", 80.0, 90.0, Cmp::Gte, None),
        ],
    };
    let cases = [
        (json!({"pct": 50, "ipct": 10}), Severity::Ok),
        (json!({"pct": 85, "ipct": 10}), Severity::Warn),
        (json!({"pct": 50, "ipct": 95}), Severity::Crit),
        (json!({"pct": 50}), MISSING),
    ];
    for (data, want) in cases {
        assert_eq!(rule.grade(&fact(None, data.clone()), None), want, "{data}");
    }
}

#[test]
fn present_is_the_problem_unless_zero() {
    let rule = SeverityRule::Present {
        severity: Level::Crit,
    };
    assert_eq!(rule.grade(&fact(None, json!(null)), None), Severity::Crit);
    assert_eq!(
        rule.grade(&fact(Some(2.0), json!(null)), None),
        Severity::Crit
    );
    assert_eq!(
        rule.grade(&fact(Some(0.0), json!(null)), None),
        Severity::Ok
    );
}

#[test]
fn state_map_with_default() {
    let rule = SeverityRule::StateMap {
        field: "data.status".into(),
        map: BTreeMap::from([
            ("online".into(), Level::Ok),
            ("stopped".into(), Level::Crit),
            ("errored".into(), Level::Crit),
        ]),
        default: Level::Warn,
    };
    let cases = [
        (json!({"status": "online"}), Severity::Ok),
        (json!({"status": "stopped"}), Severity::Crit),
        (json!({"status": "errored"}), Severity::Crit),
        (json!({"status": "launching"}), Severity::Warn),
        (json!({}), MISSING),
    ];
    for (data, want) in cases {
        assert_eq!(rule.grade(&fact(None, data.clone()), None), want, "{data}");
    }
    let running = SeverityRule::StateMap {
        field: "data.all_running".into(),
        map: BTreeMap::from([("true".into(), Level::Ok), ("false".into(), Level::Crit)]),
        default: Level::Warn,
    };
    assert_eq!(
        running.grade(&fact(None, json!({"all_running": false})), None),
        Severity::Crit
    );
}

#[test]
fn increase_compares_with_previous_scan() {
    let rule = SeverityRule::Increase {
        field: "data.restarts".into(),
        severity: Level::Warn,
        min: 2.0,
    };
    let at = |n: u32| fact(None, json!({ "restarts": n }));
    assert_eq!(rule.grade(&at(9), None), Severity::Ok, "no previous scan");
    assert_eq!(
        rule.grade(&at(4), Some(&at(3))),
        Severity::Ok,
        "grew by 1 < min 2"
    );
    assert_eq!(rule.grade(&at(5), Some(&at(3))), Severity::Warn);
    assert_eq!(
        rule.grade(&at(0), Some(&at(7))),
        Severity::Ok,
        "reset after restart of pm2"
    );
    assert_eq!(rule.grade(&fact(None, json!({})), Some(&at(3))), MISSING);
}

#[test]
fn days_left_with_flags() {
    let rule = SeverityRule::DaysLeft {
        warn: 14.0,
        crit: 3.0,
        flags: vec!["expired".into(), "untrusted".into()],
    };
    let cases = [
        (Some(74.0), json!(null), Severity::Ok),
        (Some(14.0), json!(null), Severity::Ok),
        (Some(13.0), json!(null), Severity::Warn),
        (Some(2.0), json!(null), Severity::Crit),
        (Some(60.0), json!({"untrusted": true}), Severity::Crit),
        (None, json!({"expired": true}), Severity::Crit),
        (Some(60.0), json!({"expired": false}), Severity::Ok),
        (Some(60.0), json!({"expired": "false"}), Severity::Ok),
        (Some(60.0), json!({"expired": "0"}), Severity::Ok),
        (Some(60.0), json!({"expired": 0}), Severity::Ok),
        (Some(60.0), json!({"expired": 1}), Severity::Crit),
        (Some(60.0), json!({"expired": "true"}), Severity::Crit),
        (None, json!(null), MISSING),
    ];
    for (value, data, want) in cases {
        assert_eq!(
            rule.grade(&fact(value, data.clone()), None),
            want,
            "{value:?} {data}"
        );
    }
}

#[test]
fn info_and_unknown_facts() {
    assert_eq!(
        SeverityRule::Info.grade(&fact(Some(1e12), json!(null)), None),
        Severity::Info
    );
    let perm = fact(None, json!(null)).with_unknown(UnknownReason::NeedsPerm);
    let rule = SeverityRule::Present {
        severity: Level::Crit,
    };
    assert_eq!(
        rule.grade(&perm, None),
        Severity::Unknown(UnknownReason::NeedsPerm)
    );
}

#[test]
fn overrides_apply_by_check_and_field() {
    let rule = SeverityRule::MaxOf {
        rules: vec![
            thr("data.state_bad", 0.0, 0.0, Cmp::Gt, None),
            thr("data.mem_pct", 90.0, 100.0, Cmp::Gte, None),
            SeverityRule::Increase {
                field: "data.restarts".into(),
                severity: Level::Warn,
                min: 1.0,
            },
        ],
    };
    let o = [
        ThresholdOverride {
            check: "other".into(),
            field: None,
            warn: Some(1.0),
            crit: None,
            min: None,
        },
        ThresholdOverride {
            check: "docker.compose".into(),
            field: Some("data.mem_pct".into()),
            warn: Some(80.0),
            crit: None,
            min: None,
        },
        ThresholdOverride {
            check: "docker.compose".into(),
            field: None,
            warn: None,
            crit: None,
            min: Some(5.0),
        },
    ];
    let SeverityRule::MaxOf { rules } = rule.with_overrides("docker.compose", &o) else {
        panic!("shape changed")
    };
    assert_eq!(
        rules[0],
        thr("data.state_bad", 0.0, 0.0, Cmp::Gt, None),
        "other field untouched"
    );
    assert_eq!(rules[1], thr("data.mem_pct", 80.0, 100.0, Cmp::Gte, None));
    assert_eq!(
        rules[2],
        SeverityRule::Increase {
            field: "data.restarts".into(),
            severity: Level::Warn,
            min: 5.0
        }
    );
}

#[test]
fn rules_round_trip_through_json() {
    let text = r#"{"type":"max_of","rules":[
        {"type":"threshold","field":"data.pct","warn":80,"crit":90,"cmp":"gte"},
        {"type":"days_left","warn":14,"crit":3,"flags":["expired"]},
        {"type":"state_map","field":"data.status","map":{"online":"ok"}},
        {"type":"increase","field":"data.restarts","severity":"warn"},
        {"type":"present","severity":"crit"},
        {"type":"info"}]}"#;
    let rule: SeverityRule = serde_json::from_str(text).unwrap();
    let back: SeverityRule = serde_json::from_str(&serde_json::to_string(&rule).unwrap()).unwrap();
    assert_eq!(rule, back);
    let SeverityRule::MaxOf { rules } = &rule else {
        panic!()
    };
    assert!(matches!(
        rules[2],
        SeverityRule::StateMap {
            default: Level::Warn,
            ..
        }
    ));
    assert!(matches!(rules[3], SeverityRule::Increase { min, .. } if min == 1.0));
}
