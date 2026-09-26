//! Severity case tables for the server and component checks: facts shaped
//! exactly as their scripts print them, graded with the shipped manifest
//! rule. The golden fixtures are graded too, so a script whose fields drift
//! away from its rule shows up as `Unknown(Missing)` here.

#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::path::Path;

use daminus_core::checks::{manifest, ndjson};
use daminus_core::domain::fact::CheckFact;
use daminus_core::domain::severity::{Severity, UnknownReason};
use serde_json::{Value, json};

fn fact(check: &str, value: Option<f64>, data: Value) -> CheckFact {
    let mut f = CheckFact::new(check, "").with_data(data);
    f.value = value;
    f
}

fn grade(f: &CheckFact, prev: Option<&CheckFact>) -> Severity {
    let m = manifest().unwrap();
    m.get(&f.check)
        .unwrap_or_else(|| panic!("{} not in manifest", f.check))
        .rule
        .grade(f, prev)
}

fn table(cases: Vec<(CheckFact, Severity)>) {
    for (i, (f, want)) in cases.into_iter().enumerate() {
        assert_eq!(grade(&f, None), want, "case {i}: {f:?}");
    }
}

use Severity::{Crit, Info, Ok, Warn};

#[test]
fn sys_mem_available_share() {
    let d = json!({"total": 8_000_000_000_u64, "available": 1});
    table(vec![
        (fact("sys.mem", Some(41.9), d.clone()), Ok),
        (fact("sys.mem", Some(15.0), d.clone()), Ok),
        (fact("sys.mem", Some(14.9), d.clone()), Warn),
        (fact("sys.mem", Some(5.0), d.clone()), Warn),
        (fact("sys.mem", Some(4.9), d.clone()), Crit),
    ]);
}

#[test]
fn sys_swap_used_share() {
    table(vec![
        (
            fact("sys.swap", Some(0.0), json!({"total": 0, "used": 0})),
            Ok,
        ),
        (fact("sys.swap", Some(50.0), json!({})), Ok),
        (fact("sys.swap", Some(50.1), json!({})), Warn),
        (fact("sys.swap", Some(80.1), json!({})), Crit),
    ]);
}

#[test]
fn sys_psi_worst_resource() {
    table(vec![
        (
            fact(
                "sys.psi",
                None,
                json!({"cpu": 1.48, "memory": 0.0, "io": 0.24}),
            ),
            Ok,
        ),
        (
            fact(
                "sys.psi",
                None,
                json!({"cpu": 1.0, "memory": 10.5, "io": 0.0}),
            ),
            Warn,
        ),
        (
            fact(
                "sys.psi",
                None,
                json!({"cpu": 1.0, "memory": 0.0, "io": 25.5}),
            ),
            Crit,
        ),
    ]);
}

#[test]
fn sys_oom_kill_count() {
    let procs = json!({"procs": []});
    table(vec![
        (fact("sys.oom", Some(0.0), procs.clone()), Ok),
        (fact("sys.oom", Some(1.0), procs.clone()), Warn),
        (fact("sys.oom", Some(4.0), procs.clone()), Warn),
        (fact("sys.oom", Some(5.0), procs.clone()), Crit),
    ]);
    let no_journal = fact("sys.oom", None, Value::Null).with_unknown(UnknownReason::NeedsPerm);
    assert_eq!(
        grade(&no_journal, None),
        Severity::Unknown(UnknownReason::NeedsPerm)
    );
}

#[test]
fn logs_big_is_a_warning_when_found() {
    let none = CheckFact::new("logs.big", "").with_value(0.0, "bytes");
    let big = CheckFact::new("logs.big", "/var/log/syslog.1")
        .with_value(629_145_600.0, "bytes")
        .with_data(json!({"mtime": 1_790_437_585}));
    table(vec![(none, Ok), (big, Warn)]);
}

#[test]
fn sizes_are_info() {
    let path = CheckFact::new("disk.path", "/srv/shop")
        .with_value(4_177_920.0, "bytes")
        .with_data(json!({"top": [], "other": 0, "files": [], "partial": false}));
    let df = fact("docker.df", Some(5_922_400_000.0), json!({"images": {}}));
    table(vec![(path, Info), (df, Info)]);
}

fn compose(not_running: u32, restarts: u32, mem_pct: f64) -> CheckFact {
    fact(
        "docker.compose",
        None,
        json!({"containers": 3, "running": 3 - not_running, "not_running": not_running,
               "restarts": restarts, "mem_pct": mem_pct, "services": []}),
    )
}

#[test]
fn compose_down_is_crit_restarts_and_memory_warn() {
    table(vec![
        (compose(0, 0, 41.29), Ok),
        (compose(0, 3, 41.29), Warn),
        (compose(0, 0, 90.0), Warn),
        (compose(1, 0, 10.0), Crit),
        (compose(1, 3, 95.0), Crit),
    ]);
}

fn pm2(status: &str, restarts: u32) -> CheckFact {
    fact(
        "pm2.app",
        None,
        json!({"status": status, "daemon": true, "instances": 1, "restarts": restarts,
               "mem_mb": 84, "started": 1_790_380_500, "ids": [0]}),
    )
}

#[test]
fn pm2_status_and_restart_growth() {
    table(vec![
        (pm2("online", 0), Ok),
        (pm2("stopped", 0), Crit),
        (pm2("errored", 15), Crit),
        (pm2("launching", 0), Warn),
    ]);
    // No daemon under that PM2_HOME: the app is down.
    let no_daemon = fact(
        "pm2.app",
        None,
        json!({"status": "stopped", "daemon": false, "instances": 0, "restarts": 0, "mem_mb": 0}),
    );
    assert_eq!(grade(&no_daemon, None), Crit);
    // Restarts: warn when they grew by 2 or more since the previous scan.
    let before = pm2("online", 3);
    assert_eq!(grade(&pm2("online", 4), Some(&before)), Ok);
    assert_eq!(grade(&pm2("online", 5), Some(&before)), Warn);
    assert_eq!(grade(&pm2("online", 5), None), Ok);
}

/// Every fact the scripts printed in the harness grades to a real level (or
/// the unknown reason the script itself gave): no rule field is missing.
#[test]
fn golden_fixtures_grade_without_missing_fields() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/ndjson");
    for distro in ["ubuntu-24.04", "debian-12"] {
        for entry in std::fs::read_dir(dir.join(distro)).unwrap() {
            let path = entry.unwrap().path();
            let out = ndjson::parse(&std::fs::read(&path).unwrap());
            for f in &out.facts {
                let got = grade(f, None);
                let want_unknown = f.unknown.map(Severity::Unknown);
                if let Some(u) = want_unknown {
                    assert_eq!(got, u, "{}: {f:?}", path.display());
                } else {
                    assert!(
                        !matches!(got, Severity::Unknown(_)),
                        "{}: {f:?} graded {got:?}",
                        path.display()
                    );
                }
            }
        }
    }
}
