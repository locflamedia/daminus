use std::collections::{BTreeMap, BTreeSet};

use serde_json::json;
use time::macros::{date, datetime};

use super::*;
use crate::domain::datetime::Day;
use crate::domain::expected::{ExpectedReason, ExpectedRule};
use crate::domain::fact::CheckFact;
use crate::domain::host::HostAlias;
use crate::domain::manifest::{CheckGroup, CheckSpec, Runs};
use crate::domain::project::{Component, ComponentKind, Project, Role};
use crate::domain::rule::{Cmp, SeverityRule, ThresholdOverride};
use crate::domain::severity::{Level, Severity, UnknownReason};
use crate::domain::snapshot::{HostOutcome, NetCause};

const ALL_GROUPS: [CheckGroup; 7] = [
    CheckGroup::System,
    CheckGroup::Disk,
    CheckGroup::Containers,
    CheckGroup::Databases,
    CheckGroup::Security,
    CheckGroup::Uptime,
    CheckGroup::CodeChanges,
];

fn manifest() -> Manifest {
    let spec = |id: &str, group, runs, rule| CheckSpec {
        id: id.into(),
        group,
        runs,
        script: None,
        needs: vec![],
        facts: Default::default(),
        fp: None,
        rule,
    };
    Manifest {
        checks: vec![
            spec(
                "disk.fs",
                CheckGroup::Disk,
                Runs::Remote,
                SeverityRule::Threshold {
                    field: "data.pct".into(),
                    warn: 80.0,
                    crit: Some(90.0),
                    cmp: Cmp::Gte,
                    scale: None,
                },
            ),
            spec(
                "sec.upload_php",
                CheckGroup::Security,
                Runs::Remote,
                SeverityRule::Present {
                    severity: Level::Crit,
                },
            ),
            spec(
                "sec.recent_change",
                CheckGroup::CodeChanges,
                Runs::Remote,
                SeverityRule::Info,
            ),
            spec(
                "pm2.app",
                CheckGroup::Containers,
                Runs::Remote,
                SeverityRule::Increase {
                    field: "data.restarts".into(),
                    severity: Level::Warn,
                    min: 1.0,
                },
            ),
            spec(
                "sys.mem",
                CheckGroup::System,
                Runs::Remote,
                SeverityRule::Threshold {
                    field: "value".into(),
                    warn: 15.0,
                    crit: Some(5.0),
                    cmp: Cmp::Lt,
                    scale: None,
                },
            ),
        ],
    }
}

fn alias(s: &str) -> HostAlias {
    HostAlias::parse(s).unwrap()
}

fn host(s: &str) -> HostRef {
    HostRef::parse(s).unwrap()
}

fn projects() -> ProjectsFile {
    let comp = |host: &str, kind| Component {
        role: Role::Fe,
        host: alias(host),
        kind,
    };
    ProjectsFile {
        projects: vec![
            Project {
                id: "shop".into(),
                name: "shop".into(),
                color: None,
                urls: vec!["https://shop.test".into()],
                components: vec![
                    comp(
                        "vps-a",
                        ComponentKind::Path {
                            path: "/srv/shop".into(),
                        },
                    ),
                    comp(
                        "vps-b",
                        ComponentKind::Pm2 {
                            app: "shop-queue".into(),
                            pm2_home: None,
                        },
                    ),
                ],
                overrides: vec![],
            },
            Project {
                id: "blog".into(),
                name: "blog".into(),
                color: None,
                urls: vec![],
                components: vec![comp(
                    "vps-b",
                    ComponentKind::Path {
                        path: "/srv/blog".into(),
                    },
                )],
                overrides: vec![],
            },
        ],
        ..ProjectsFile::default()
    }
}

/// One scan. `hosts`: (alias, outcome, facts). Reached hosts cover every group.
fn snap(seq: u32, hosts: Vec<(&str, HostOutcome, Vec<CheckFact>)>) -> Snapshot {
    let at = Timestamp::from_unix(1_790_000_000 + i64::from(seq) * 86_400);
    let mut s = Snapshot::new(at, at);
    s.seq = seq;
    for (h, outcome, facts) in hosts {
        if outcome.is_reached() {
            s.coverage.insert(host(h), ALL_GROUPS.into_iter().collect());
        }
        s.hosts.insert(host(h), outcome);
        s.facts.insert(host(h), facts);
    }
    s
}

fn disk(pct: u32) -> CheckFact {
    CheckFact::new("disk.fs", "/").with_data(json!({ "pct": pct }))
}

fn php(fp: &str) -> CheckFact {
    CheckFact::new("sec.upload_php", "/srv/shop/public/uploads/x.php").with_fp(fp)
}

fn now() -> Timestamp {
    Timestamp::new(datetime!(2026-09-26 06:42 UTC))
}

/// Evaluates scans given oldest first.
fn eval_with(scans: Vec<Snapshot>, projects: &ProjectsFile, settings: &Settings) -> Report {
    let history: Vec<Snapshot> = scans.into_iter().rev().collect();
    evaluate(&history, Config { projects, settings }, &manifest(), now())
}

fn eval(scans: Vec<Snapshot>) -> Report {
    eval_with(scans, &projects(), &Settings::default())
}

fn item<'r>(r: &'r Report, h: &str, check: &str) -> &'r Item {
    r.items
        .iter()
        .find(|i| i.key.host == host(h) && i.key.check == check)
        .unwrap_or_else(|| panic!("no item {h} {check} in {:#?}", r.items))
}

const R: HostOutcome = HostOutcome::Reached;

#[test]
fn empty_history_gives_an_empty_report() {
    let r = eval(vec![]);
    assert_eq!(r.seq, None);
    assert!(r.items.is_empty());
    assert_eq!(r.projects.len(), 2);
    assert!(
        r.projects
            .iter()
            .all(|p| p.level == Level::Ok && p.not_scanned_hosts.is_empty())
    );
}

#[test]
fn new_still_changed_fixed() {
    let scans = [
        snap(1, vec![("vps-a", R, vec![disk(50)])]),
        snap(2, vec![("vps-a", R, vec![disk(85)])]),
        snap(3, vec![("vps-a", R, vec![disk(86)])]),
        snap(4, vec![("vps-a", R, vec![disk(95)])]),
        snap(5, vec![("vps-a", R, vec![disk(60)])]),
    ];
    let cases = [
        (2, Severity::Warn, Some(Delta::New)),
        (3, Severity::Warn, Some(Delta::Still { scans_open: 2 })),
        (
            4,
            Severity::Crit,
            Some(Delta::Changed {
                from: Severity::Warn,
                to: Severity::Crit,
            }),
        ),
        (5, Severity::Ok, Some(Delta::Fixed)),
        (1, Severity::Ok, None),
    ];
    for (upto, sev, delta) in cases {
        let r = eval(scans[..upto].to_vec());
        let i = item(&r, "vps-a", "disk.fs");
        assert_eq!(
            (i.severity, i.delta.clone()),
            (sev, delta),
            "after scan {upto}"
        );
        assert_eq!(i.disposition, Disposition::Active);
        assert_eq!(r.seq, Some(scans[upto - 1].seq));
    }
}

#[test]
fn old_crit_stays_red_while_host_is_missed_once_then_twice() {
    let unreachable = HostOutcome::Unreachable {
        cause: NetCause::ConnectTimeout,
    };
    let scans = [
        snap(1, vec![("vps-a", R, vec![disk(95)])]),
        snap(2, vec![("vps-a", R, vec![disk(96)])]),
        snap(3, vec![("vps-a", unreachable.clone(), vec![])]),
        snap(4, vec![("vps-a", HostOutcome::Timeout, vec![])]),
    ];
    for (upto, open) in [(3, 3), (4, 4)] {
        let r = eval(scans[..upto].to_vec());
        let i = item(&r, "vps-a", "disk.fs");
        assert_eq!(i.severity, Severity::Crit, "after scan {upto}");
        assert_eq!(
            i.disposition,
            Disposition::Stale { since_seq: 2 },
            "not re-checked since #2"
        );
        assert_eq!(i.delta, Some(Delta::Still { scans_open: open }));
        assert_eq!(i.checked_seq, Some(2));
        assert_eq!(
            i.fact
                .as_ref()
                .and_then(|f| f.data.get("pct"))
                .and_then(|v| v.as_u64()),
            Some(96)
        );
        let shop = r.projects.iter().find(|p| p.id == "shop").unwrap();
        assert_eq!(shop.level, Level::Crit, "stale crit still colours the card");
        assert_eq!(shop.unreachable_hosts, vec![alias("vps-a")]);
        assert_eq!(shop.counts.stale, 1);
    }
}

#[test]
fn partial_host_never_reports_fixed_for_missing_results() {
    let mut partial = snap(2, vec![("vps-a", HostOutcome::Partial, vec![])]);
    partial
        .coverage
        .insert(host("vps-a"), BTreeSet::from([CheckGroup::Disk]));
    let r = eval(vec![snap(1, vec![("vps-a", R, vec![disk(95)])]), partial]);
    let i = item(&r, "vps-a", "disk.fs");
    assert_eq!(i.severity, Severity::Crit);
    assert_eq!(i.disposition, Disposition::Stale { since_seq: 1 });
}

#[test]
fn reached_host_with_unfinished_group_keeps_stale() {
    let mut s2 = snap(2, vec![("vps-a", R, vec![])]);
    s2.coverage
        .insert(host("vps-a"), BTreeSet::from([CheckGroup::System]));
    let r = eval(vec![snap(1, vec![("vps-a", R, vec![php("52:1:aa")])]), s2]);
    let i = item(&r, "vps-a", "sec.upload_php");
    assert_eq!(
        (i.severity, i.disposition.clone()),
        (Severity::Crit, Disposition::Stale { since_seq: 1 })
    );
}

#[test]
fn gone_after_full_coverage_is_fixed_once() {
    let scans = vec![
        snap(1, vec![("vps-a", R, vec![php("52:1:aa")])]),
        snap(2, vec![("vps-a", R, vec![])]),
        snap(3, vec![("vps-a", R, vec![])]),
    ];
    let r = eval(scans[..2].to_vec());
    let i = item(&r, "vps-a", "sec.upload_php");
    assert_eq!(
        (i.severity, i.delta.clone()),
        (Severity::Ok, Some(Delta::Fixed))
    );
    let r = eval(scans.clone());
    assert!(
        r.items.iter().all(|i| i.key.check != "sec.upload_php"),
        "reported fixed only once"
    );
    // Host unreachable after the fix: nothing comes back.
    let mut more = scans;
    more.push(snap(4, vec![("vps-a", HostOutcome::AuthFailed, vec![])]));
    assert!(
        eval(more)
            .items
            .iter()
            .all(|i| i.key.check != "sec.upload_php")
    );
}

#[test]
fn timeout_and_unreachable_without_history_are_unknown() {
    let r = eval(vec![snap(
        1,
        vec![
            (
                "vps-a",
                R,
                vec![CheckFact::new("pm2.app", "shop-queue").with_unknown(UnknownReason::Timeout)],
            ),
            (
                "vps-b",
                R,
                vec![
                    CheckFact::new("pm2.app", "shop-queue").with_unknown(UnknownReason::NeedsPerm),
                ],
            ),
        ],
    )]);
    assert_eq!(
        item(&r, "vps-a", "pm2.app").severity,
        Severity::Unknown(UnknownReason::Timeout)
    );
    assert_eq!(
        item(&r, "vps-b", "pm2.app").severity,
        Severity::Unknown(UnknownReason::NeedsPerm)
    );
    assert_eq!(r.counts.needs_perm, 1);
    assert_eq!(r.counts.unknown, 1);
    let shop = r.projects.iter().find(|p| p.id == "shop").unwrap();
    assert_eq!(
        shop.level,
        Level::Ok,
        "unknown and needs-permission never colour the card"
    );
}

#[test]
fn unknown_fact_after_an_issue_keeps_the_old_severity() {
    let scans = vec![
        snap(1, vec![("vps-a", R, vec![disk(95)])]),
        snap(
            2,
            vec![(
                "vps-a",
                R,
                vec![disk(95).with_unknown(UnknownReason::Timeout)],
            )],
        ),
    ];
    let i = eval(scans).items.remove(0);
    assert_eq!(
        (i.severity, i.disposition),
        (Severity::Crit, Disposition::Stale { since_seq: 1 })
    );
}

#[test]
fn disabled_group_is_not_evaluated() {
    let recent = CheckFact::new("sec.recent_change", "/srv/shop").with_value(12.0, "files");
    let scans = vec![snap(1, vec![("vps-a", R, vec![recent, disk(95)])])];
    let r = eval(scans.clone());
    assert!(
        r.items.iter().all(|i| i.key.check != "sec.recent_change"),
        "code_changes off by default"
    );
    assert_eq!(r.disabled_groups, vec![CheckGroup::CodeChanges]);

    let mut settings = Settings::default();
    settings.scan.disabled_groups = BTreeSet::from([CheckGroup::Disk, CheckGroup::System]);
    let r = eval_with(scans, &projects(), &settings);
    assert!(r.items.iter().any(|i| i.key.check == "sec.recent_change"));
    assert!(r.items.iter().all(|i| i.key.check != "disk.fs"));
    assert_eq!(
        r.disabled_groups,
        vec![CheckGroup::Disk],
        "system cannot be switched off"
    );
}

#[test]
fn unknown_check_ids_are_ignored() {
    let r = eval(vec![snap(
        1,
        vec![("vps-a", R, vec![CheckFact::new("future.check", "")])],
    )]);
    assert!(r.items.is_empty());
}

#[test]
fn settings_and_project_overrides_apply_without_rescan() {
    let scans = vec![snap(
        1,
        vec![("vps-a", R, vec![disk(85)]), ("vps-b", R, vec![disk(85)])],
    )];
    assert_eq!(
        item(&eval(scans.clone()), "vps-a", "disk.fs").severity,
        Severity::Warn
    );

    let mut settings = Settings::default();
    settings.scan.thresholds.push(ThresholdOverride {
        check: "disk.fs".into(),
        field: None,
        warn: Some(90.0),
        crit: Some(95.0),
        min: None,
    });
    let r = eval_with(scans.clone(), &projects(), &settings);
    assert_eq!(item(&r, "vps-a", "disk.fs").severity, Severity::Ok);

    // Project override: vps-a is used only by shop, so its disk result is shop's.
    let mut p = projects();
    p.projects[0].overrides.push(ThresholdOverride {
        check: "disk.fs".into(),
        field: None,
        warn: Some(70.0),
        crit: Some(80.0),
        min: None,
    });
    let r = eval_with(scans, &p, &Settings::default());
    assert_eq!(item(&r, "vps-a", "disk.fs").severity, Severity::Crit);
    assert_eq!(
        item(&r, "vps-b", "disk.fs").severity,
        Severity::Warn,
        "shared host keeps the global rule"
    );
}

#[test]
fn increase_uses_the_previous_checked_value() {
    let pm2 = |n: u32| CheckFact::new("pm2.app", "shop-queue").with_data(json!({ "restarts": n }));
    let scans = vec![
        snap(1, vec![("vps-b", R, vec![pm2(3)])]),
        snap(2, vec![("vps-b", HostOutcome::Timeout, vec![])]),
        snap(3, vec![("vps-b", R, vec![pm2(5)])]),
    ];
    let i = item(&eval(scans), "vps-b", "pm2.app").clone();
    assert_eq!((i.severity, i.delta), (Severity::Warn, Some(Delta::New)));
    assert_eq!(
        i.owner,
        Owner::Project { id: "shop".into() },
        "pm2 app belongs to its component"
    );
}

fn rule(fp: Option<&str>, until: Option<Day>) -> ExpectedRule {
    ExpectedRule {
        id: "r-php".into(),
        host: host("vps-a"),
        check: "sec.upload_php".into(),
        target: "/srv/shop/public/uploads/x.php".into(),
        fp: fp.map(Into::into),
        reason: ExpectedReason::Intended,
        until,
        note: "silence file".into(),
    }
}

#[test]
fn expected_rule_holds_expires_and_breaks_on_new_evidence() {
    let scans = vec![snap(1, vec![("vps-a", R, vec![php("52:1:aa")])])];
    let with = |r: ExpectedRule| {
        let mut p = projects();
        p.rules.push(r);
        eval_with(scans.clone(), &p, &Settings::default())
    };

    let r = with(rule(Some("52:1:aa"), Some(Day::new(date!(2026 - 10 - 26)))));
    let i = item(&r, "vps-a", "sec.upload_php");
    assert_eq!(
        i.disposition,
        Disposition::Expected {
            rule: "r-php".into(),
            stale_since: None,
        }
    );
    assert_eq!(
        i.severity,
        Severity::Crit,
        "severity is kept, only the disposition changes"
    );
    let shop = r.projects.iter().find(|p| p.id == "shop").unwrap();
    assert_eq!(
        (shop.level, shop.counts.expected, shop.counts.crit),
        (Level::Ok, 1, 0)
    );
    assert!(shop.main_issue.is_none());
    assert!(r.rules_due.is_empty());

    let r = with(rule(Some("52:1:aa"), Some(Day::new(date!(2026 - 09 - 25)))));
    let i = item(&r, "vps-a", "sec.upload_php");
    assert_eq!(
        i.disposition,
        Disposition::Active,
        "expired rule no longer applies"
    );
    assert_eq!(r.rules_due, vec!["r-php".to_owned()]);

    let r = with(rule(Some("3481:9:bb"), None));
    let i = item(&r, "vps-a", "sec.upload_php");
    assert_eq!(i.disposition, Disposition::Active);
    assert_eq!(
        i.rule_broken.as_deref(),
        Some("r-php"),
        "evidence changed: report again"
    );
    assert_eq!(
        r.projects.iter().find(|p| p.id == "shop").unwrap().level,
        Level::Crit
    );

    let r = with(rule(None, None));
    assert_eq!(
        item(&r, "vps-a", "sec.upload_php").disposition,
        Disposition::Expected {
            rule: "r-php".into(),
            stale_since: None,
        }
    );
}

#[test]
fn expected_issue_on_unreached_host_stays_stale() {
    let scans = vec![
        snap(1, vec![("vps-a", R, vec![php("52:1:aa")])]),
        snap(2, vec![("vps-a", HostOutcome::Timeout, vec![])]),
    ];
    let mut p = projects();
    p.rules.push(rule(Some("52:1:aa"), None));
    let r = eval_with(scans, &p, &Settings::default());
    let i = item(&r, "vps-a", "sec.upload_php");
    assert_eq!(
        i.disposition,
        Disposition::Expected {
            rule: "r-php".into(),
            stale_since: Some(1),
        }
    );
    assert_eq!(
        (r.counts.expected, r.counts.stale, r.counts.crit),
        (1, 1, 0)
    );
}

#[test]
fn ownership_counts_each_issue_once() {
    let r = eval(vec![snap(
        1,
        vec![
            ("vps-a", R, vec![disk(95)]),
            (
                "vps-b",
                R,
                vec![
                    disk(85),
                    CheckFact::new("sec.upload_php", "/srv/blog/up/a.php"),
                ],
            ),
        ],
    )]);
    assert_eq!(
        item(&r, "vps-a", "disk.fs").owner,
        Owner::Project { id: "shop".into() }
    );
    assert_eq!(
        item(&r, "vps-b", "disk.fs").owner,
        Owner::Server {
            host: host("vps-b")
        }
    );
    assert_eq!(
        item(&r, "vps-b", "sec.upload_php").owner,
        Owner::Project { id: "blog".into() }
    );
    assert_eq!((r.counts.crit, r.counts.warn), (2, 1));

    let vps_b = r.servers.iter().find(|s| s.host == alias("vps-b")).unwrap();
    assert_eq!(
        (vps_b.level, vps_b.counts.crit, vps_b.counts.warn),
        (Level::Crit, 1, 1)
    );
    assert_eq!(vps_b.used_by, vec!["shop".to_owned(), "blog".to_owned()]);
    assert_eq!(vps_b.last_reached_seq, Some(1));

    let shop = r.projects.iter().find(|p| p.id == "shop").unwrap();
    let main = shop.main_issue.as_ref().unwrap();
    assert_eq!(
        (main.key.check.as_str(), main.severity),
        ("disk.fs", Severity::Crit)
    );
    assert_eq!(main.params.get("target"), Some(&json!("/")));
}

#[test]
fn main_issue_prefers_worst_then_longest_open() {
    let scans = vec![
        snap(1, vec![("vps-a", R, vec![disk(85)])]),
        snap(
            2,
            vec![(
                "vps-a",
                R,
                vec![
                    disk(85),
                    CheckFact::new("sys.mem", "").with_value(10.0, "%"),
                ],
            )],
        ),
    ];
    let shop = eval(scans)
        .projects
        .into_iter()
        .find(|p| p.id == "shop")
        .unwrap();
    let main = shop.main_issue.unwrap();
    assert_eq!(
        main.key.check, "disk.fs",
        "both warn: the one open for 2 scans leads"
    );
    assert_eq!(main.params.get("scans_open"), Some(&json!(2)));
}

#[test]
fn not_scanned_and_excluded_hosts() {
    let mut p = projects();
    p.hosts = BTreeMap::from([(
        alias("vps-b"),
        crate::domain::project::HostSettings { include: false },
    )]);
    let r = eval_with(
        vec![snap(1, vec![("vps-a", R, vec![disk(50)])])],
        &p,
        &Settings::default(),
    );
    let shop = r.projects.iter().find(|p| p.id == "shop").unwrap();
    assert_eq!(shop.not_scanned_hosts, vec![alias("vps-b")]);
    let b = r.servers.iter().find(|s| s.host == alias("vps-b")).unwrap();
    assert!(!b.included);
    assert_eq!(b.outcome, None);
}

#[test]
fn url_results_belong_to_the_project_listing_the_url() {
    let url = CheckFact::new("disk.fs", "https://shop.test").with_data(json!({"pct": 99}));
    let mut s = snap(1, vec![]);
    s.hosts.insert(HostRef::Local, R);
    s.coverage
        .insert(HostRef::Local, BTreeSet::from([CheckGroup::Disk]));
    s.facts.insert(HostRef::Local, vec![url]);
    let r = eval(vec![s]);
    assert_eq!(
        item(&r, "@local", "disk.fs").owner,
        Owner::Project { id: "shop".into() }
    );
    assert!(r.servers.iter().all(|s| s.host.as_str() != "@local"));
}
