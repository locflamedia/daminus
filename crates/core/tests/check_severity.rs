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

#[test]
fn database_size_is_info_and_unknowns_keep_their_reason() {
    let mysql = CheckFact::new("db.size", "shop")
        .with_value(3_650_722_202.0, "bytes")
        .with_data(
            json!({"engine": "mysql", "tables": 14, "top": [["orders", 2_576_980_378_u64]],
                          "other": 1_073_741_824_u64}),
        );
    let empty = CheckFact::new("db.size", "scratch")
        .with_value(0.0, "bytes")
        .with_data(json!({"engine": "postgres", "tables": 0, "top": [], "other": 0}));
    table(vec![(mysql, Info), (empty, Info)]);
    // A size growing fast is a delta for the reader, not a severity.
    let before = CheckFact::new("db.size", "shop").with_value(1.0, "bytes");
    let after = CheckFact::new("db.size", "shop").with_value(1.0e12, "bytes");
    assert_eq!(grade(&after, Some(&before)), Info);
    for reason in [
        UnknownReason::NeedsPerm,
        UnknownReason::Missing,
        UnknownReason::Unsupported,
        UnknownReason::Timeout,
    ] {
        let f = CheckFact::new("db.size", "shop").with_unknown(reason);
        assert_eq!(grade(&f, None), Severity::Unknown(reason));
    }
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

#[test]
fn compose_with_no_container_left_is_crit_finished_jobs_are_ok() {
    let gone = json!({"containers": 0, "running": 0, "not_running": 0,
                      "restarts": 0, "mem_pct": 0, "services": []});
    // One-shot services that exited 0 with restart policy "no" are done, not down.
    let jobs_done = json!({"containers": 2, "running": 0, "not_running": 0,
                           "restarts": 0, "mem_pct": 0, "services": []});
    table(vec![
        (fact("docker.compose", None, gone), Crit),
        (fact("docker.compose", None, jobs_done), Ok),
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

/// A finding of a security check: no value, so `present` cannot read it as
/// "looked, found none" (a zero-byte PHP file is still a finding).
fn finding(check: &str, target: &str, data: Value) -> CheckFact {
    CheckFact::new(check, target).with_data(data)
}

fn none_found(check: &str) -> CheckFact {
    CheckFact::new(check, "").with_value(0.0, "count")
}

#[test]
fn security_findings_grade_by_check_and_none_found_is_ok() {
    let file = json!({"size": 0, "mtime": 1_790_000_000, "total": 1});
    table(vec![
        (
            finding(
                "sec.miner",
                "xmrig",
                json!({"seen": 212, "total": 212, "count": 1, "exe": "/tmp/xmrig", "deleted": false, "why": "name"}),
            ),
            Crit,
        ),
        (none_found("sec.miner"), Ok),
        // An empty PHP file in uploads is a finding all the same.
        (
            finding(
                "sec.upload_php",
                "/srv/shop/public/uploads/a.php",
                file.clone(),
            ),
            Crit,
        ),
        (none_found("sec.upload_php"), Ok),
        (finding("sec.tmp_exec", "/tmp/.x/run", file.clone()), Warn),
        (none_found("sec.tmp_exec"), Ok),
        (
            finding(
                "sec.preload",
                "/etc/ld.so.preload",
                json!({"entries": 1, "libs": ["/lib/libevil.so"], "size": 17}),
            ),
            Crit,
        ),
        (none_found("sec.preload"), Ok),
        (
            finding(
                "sec.ports",
                "6379",
                json!({"port": 6379, "proc": "redis-server"}),
            ),
            Warn,
        ),
        (
            finding("sec.ports", "3306", json!({"port": 3306, "proc": ""})),
            Warn,
        ),
        (none_found("sec.ports"), Ok),
        (
            CheckFact::new("sec.recent_change", "/srv/shop")
                .with_value(14.0, "files")
                .with_data(json!({"newest": 1_790_000_000, "files": []})),
            Info,
        ),
        (
            CheckFact::new("sec.recent_change", "/srv/shop")
                .with_value(0.0, "files")
                .with_data(json!({"newest": 0, "files": []})),
            Info,
        ),
    ]);
}

/// Seeing only some of the processes is never "ok": it is a missing
/// permission, and still says how far the check got.
#[test]
fn a_partial_miner_scan_is_needs_perm_with_its_coverage() {
    let partial = CheckFact::new("sec.miner", "")
        .with_unknown(UnknownReason::NeedsPerm)
        .with_data(json!({"seen": 41, "total": 212}));
    assert_eq!(
        grade(&partial, None),
        Severity::Unknown(UnknownReason::NeedsPerm)
    );
    assert_eq!(partial.data["seen"], 41);
    for check in [
        "sec.miner",
        "sec.upload_php",
        "sec.tmp_exec",
        "sec.preload",
        "sec.ports",
    ] {
        for reason in [
            UnknownReason::NeedsPerm,
            UnknownReason::Timeout,
            UnknownReason::Unsupported,
        ] {
            let f = CheckFact::new(check, "").with_unknown(reason);
            assert_eq!(grade(&f, None), Severity::Unknown(reason), "{check}");
        }
    }
}

fn tls(days: f64, expired: bool, untrusted: bool, mismatch: bool) -> CheckFact {
    CheckFact::new("url.tls", "https://shop.example")
        .with_value(days, "days")
        .with_data(json!({"not_after": 1_800_000_000, "expired": expired,
                          "untrusted": untrusted, "mismatch": mismatch}))
}

#[test]
fn certificate_days_left_and_trust_flags() {
    table(vec![
        (tls(80.0, false, false, false), Ok),
        (tls(14.0, false, false, false), Ok),
        (tls(13.99, false, false, false), Warn),
        (tls(3.0, false, false, false), Warn),
        (tls(2.99, false, false, false), Crit),
        (tls(0.0, false, false, false), Crit),
        // Expired or untrusted is critical whatever the date says.
        (tls(-5.0, true, false, false), Crit),
        (tls(30.0, false, true, false), Crit),
        (tls(30.0, false, false, true), Crit),
        (tls(-2.0, true, true, false), Crit),
    ]);
    let unreachable = CheckFact::new("url.tls", "https://shop.example")
        .with_unknown(UnknownReason::Unreachable)
        .with_data(json!({"error": "refused"}));
    assert_eq!(
        grade(&unreachable, None),
        Severity::Unknown(UnknownReason::Unreachable)
    );
}

#[test]
fn exposed_files_are_crit_and_clean_is_ok() {
    let exposed = CheckFact::new("url.exposed", "https://shop.example")
        .with_value(2.0, "count")
        .with_data(
            json!({"exposed": true, "matched_keys": ["/.env:DB_PASSWORD", "/.git/HEAD:ref"]}),
        );
    let clean = CheckFact::new("url.exposed", "https://shop.example")
        .with_value(0.0, "count")
        .with_data(json!({"exposed": false, "matched_keys": []}));
    let down = CheckFact::new("url.exposed", "https://shop.example")
        .with_unknown(UnknownReason::Timeout)
        .with_data(json!({"error": "timeout"}));
    table(vec![(exposed, Crit), (clean, Ok)]);
    assert_eq!(
        grade(&down, None),
        Severity::Unknown(UnknownReason::Timeout)
    );
}

/// The planted container's findings (`fixtures/ndjson/<distro>/infected/`)
/// grade as the manifest says: each check's finding at its severity, each
/// finding with an evidence fingerprint.
#[test]
fn planted_findings_grade_and_carry_a_fingerprint() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/ndjson");
    for distro in ["ubuntu-24.04", "debian-12"] {
        let want = [
            ("sec_miner", "sec.miner", Crit),
            ("sec_upload_php", "sec.upload_php", Crit),
            ("sec_tmp_exec", "sec.tmp_exec", Warn),
            ("sec_preload", "sec.preload", Crit),
            ("sec_ports", "sec.ports", Warn),
        ];
        for (file, check, level) in want {
            let path = dir
                .join(distro)
                .join("infected")
                .join(format!("{file}.ndjson"));
            let out = ndjson::parse(&std::fs::read(&path).unwrap());
            let found: Vec<_> = out.facts.iter().filter(|f| f.check == check).collect();
            assert!(!found.is_empty(), "{}: nothing found", path.display());
            for f in found {
                assert_eq!(grade(f, None), level, "{}: {f:?}", path.display());
                assert!(f.fp.as_deref().is_some_and(|fp| !fp.is_empty()), "{f:?}");
            }
        }
        let path = dir.join(distro).join("infected/sec_recent_change.ndjson");
        let out = ndjson::parse(&std::fs::read(&path).unwrap());
        assert!(out.facts.iter().all(|f| grade(f, None) == Info));
    }
}

/// Every fact the scripts printed in the harness grades to a real level (or
/// the unknown reason the script itself gave): no rule field is missing.
#[test]
fn golden_fixtures_grade_without_missing_fields() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/ndjson");
    for distro in ["ubuntu-24.04", "debian-12"] {
        let mut files: Vec<_> = ["", "infected"]
            .iter()
            .flat_map(|sub| std::fs::read_dir(dir.join(distro).join(sub)).unwrap())
            .map(|e| e.unwrap().path())
            .filter(|p| p.extension().is_some_and(|x| x == "ndjson"))
            .collect();
        files.sort();
        for path in files {
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
