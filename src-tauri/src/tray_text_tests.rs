use std::collections::BTreeMap;

use daminus_core::domain::evaluate::Counts;
use daminus_core::domain::host::HostRef;
use daminus_core::domain::snapshot::HostOutcome;
use daminus_core::scan::{HostProgress, HostState};
use serde_json::json;

use super::*;

const AT: i64 = 1_790_430_120; // 2026-09-26 13:42 UTC

fn projects() -> ProjectsFile {
    serde_json::from_value(json!({
        "version": 1,
        "projects": [
            {"id": "a", "name": "tiemtra", "urls": [], "components": []},
            {"id": "b", "name": "kho-hang", "urls": [], "components": []},
            {"id": "c", "name": "booking", "urls": [], "components": []}
        ]
    }))
    .unwrap()
}

fn rollup(id: &str, level: Level) -> ProjectRollup {
    ProjectRollup {
        id: id.into(),
        level,
        counts: Counts::default(),
        main_issue: None,
        unreachable_hosts: vec![],
        not_scanned_hosts: vec![],
    }
}

fn report(crit: u32, warn: u32) -> Report {
    let at = Timestamp::from_unix(AT);
    Report {
        seq: Some(12),
        scanned_at: Some(at),
        evaluated_at: at,
        items: vec![],
        projects: vec![
            rollup("a", Level::Warn),
            rollup("b", Level::Crit),
            rollup("c", Level::Ok),
        ],
        servers: vec![],
        disabled_groups: vec![],
        rules_due: vec![],
        counts: Counts {
            crit,
            warn,
            ..Counts::default()
        },
    }
}

fn inputs<'a>(report: Option<&'a Report>, projects: &'a ProjectsFile) -> Inputs<'a> {
    Inputs {
        report,
        report_error: None,
        projects: Ok(projects),
        scan: None,
        now: Timestamp::from_unix(AT + 600),
        offset: UtcOffset::UTC,
    }
}

fn labels(v: &TrayView) -> Vec<(&str, bool)> {
    v.items
        .iter()
        .map(|i| (i.label.as_str(), i.enabled))
        .collect()
}

fn en() -> Strings {
    Strings::new("en")
}

#[test]
fn needs_attention_shows_the_count_beside_the_mark() {
    let (r, p) = (report(2, 4), projects());
    let v = view(&inputs(Some(&r), &p), &en());
    assert_eq!(v.icon, TrayIcon::Mark);
    assert_eq!(v.title.as_deref(), Some("2"));
    assert_eq!(
        v.info,
        [
            "2 critical · 4 warnings",
            "Scan #12 · 13:42 · kho-hang needs you"
        ]
    );
    assert_eq!(
        labels(&v),
        [
            ("Scan now", true),
            ("Open Daminus", true),
            ("Open kho-hang", true),
            ("Quit Daminus", true)
        ]
    );
    assert_eq!(v.items[2].id, "open_project:b");
    assert_eq!(v.items[0].accelerator, Some("CmdOrCtrl+R"));
}

#[test]
fn warnings_count_when_there_is_no_critical() {
    let (r, p) = (report(0, 4), projects());
    let v = view(&inputs(Some(&r), &p), &en());
    assert_eq!(v.title.as_deref(), Some("4"));
}

#[test]
fn all_clear_has_no_count_and_names_the_projects() {
    let mut r = report(0, 0);
    r.projects = vec![
        rollup("a", Level::Ok),
        rollup("b", Level::Ok),
        rollup("c", Level::Ok),
    ];
    let p = projects();
    let v = view(&inputs(Some(&r), &p), &en());
    assert_eq!(v.title, None);
    assert_eq!(v.info, ["All clear · 3 projects", "Scan #12 · 13:42"]);
    assert_eq!(
        labels(&v),
        [
            ("Scan now", true),
            ("Open Daminus", true),
            ("Quit Daminus", true)
        ]
    );
    let vi = view(&inputs(Some(&r), &p), &Strings::new("vi"));
    assert_eq!(vi.info[0], "Mọi thứ ổn · 3 dự án");
}

#[test]
fn an_old_result_says_how_old() {
    let (r, p) = (report(2, 0), projects());
    let mut i = inputs(Some(&r), &p);
    i.now = Timestamp::from_unix(AT + 4 * 86_400 + 60);
    let v = view(&i, &en());
    assert_eq!(v.title.as_deref(), Some("2"));
    assert_eq!(v.info[1], "Scan #12 · 4 days ago · kho-hang needs you");
    let vi = view(&i, &Strings::new("vi"));
    assert_eq!(vi.info[1], "Lần quét #12 · 4 ngày trước · kho-hang cần xem");
}

#[test]
fn not_set_up_dims_scan_now_and_offers_setup() {
    let p: ProjectsFile = serde_json::from_value(json!({"version": 1, "projects": []})).unwrap();
    let v = view(&inputs(None, &p), &en());
    assert_eq!((v.icon, v.title.as_deref()), (TrayIcon::Mark, None));
    assert_eq!(v.info, ["No scans yet"]);
    assert_eq!(
        labels(&v),
        [
            ("Scan now", false),
            ("Set up Daminus…", true),
            ("Open Daminus", true),
            ("Quit Daminus", true)
        ]
    );
}

#[test]
fn a_config_error_says_what_and_where_and_never_offers_a_dead_scan() {
    let (r, p) = (report(2, 4), projects());
    let err = AppError::from(ErrorCode::ConfigInvalid {
        path: "/Users/x/Library/Application Support/dev.daminus.app/projects.json".into(),
        line: Some(14),
    });
    let i = Inputs {
        projects: Err(&err),
        ..inputs(Some(&r), &p)
    };
    let v = view(&i, &en());
    assert_eq!(v.title, None);
    assert_eq!(v.info, ["Can’t scan", "projects.json line 14 is not valid"]);
    assert_eq!(
        labels(&v),
        [
            ("Open Daminus to fix…", true),
            ("Scan now", false),
            ("Quit Daminus", true)
        ]
    );
    let vi = view(&i, &Strings::new("vi"));
    assert_eq!(
        vi.info,
        ["Không quét được", "projects.json dòng 14 không hợp lệ"]
    );
}

#[test]
fn scanning_counts_hosts_and_offers_stop() {
    let (r, p) = (report(2, 0), projects());
    let finished = HostProgress {
        state: HostState::Finished {
            outcome: HostOutcome::Reached,
        },
        step: None,
        facts: 0,
        dropped: 0,
    };
    let running = HostProgress {
        state: HostState::Running,
        ..finished.clone()
    };
    let mut hosts = BTreeMap::new();
    for (h, done) in [
        ("a", true),
        ("b", true),
        ("c", true),
        ("d", false),
        ("e", false),
    ] {
        let p = if done {
            finished.clone()
        } else {
            running.clone()
        };
        hosts.insert(HostRef::parse(h).unwrap(), p);
    }
    // URL probes run as `@local`; they are not a host.
    hosts.insert(HostRef::Local, finished.clone());
    let run = ScanRun {
        scan_id: "s".into(),
        started_at: Timestamp::from_unix(AT + 960),
        next_seq: 0,
        hosts,
    };
    let i = Inputs {
        scan: Some(&run),
        ..inputs(Some(&r), &p)
    };
    let v = view(&i, &en());
    assert_eq!((v.icon, v.title.as_deref()), (TrayIcon::Scanning, None));
    // The count shown before the scan must be cleared, not left in place.
    assert_eq!(v.title_text(), "");
    assert_eq!(v.info, ["Scanning 3 of 5 hosts…", "Started 13:58"]);
    assert_eq!(
        labels(&v),
        [
            ("Stop scanning", true),
            ("Open Daminus", true),
            ("Quit Daminus", true)
        ]
    );
    let vi = view(&i, &Strings::new("vi"));
    assert_eq!(vi.info[0], "Đang quét 3/5 host…");
}

#[test]
fn unreadable_results_never_look_clean() {
    let p = projects();
    let damaged = AppError::from(ErrorCode::ConfigInvalid {
        path: "settings.json".into(),
        line: None,
    });
    let i = Inputs {
        report_error: Some(&damaged),
        ..inputs(None, &p)
    };
    let v = view(&i, &en());
    assert_eq!(v.title.as_deref(), Some("!"));
    assert_eq!(
        v.info,
        ["Can’t read saved results", "settings.json is damaged"]
    );
    assert_eq!(
        labels(&v),
        [
            ("Open Daminus to fix…", true),
            ("Scan now", false),
            ("Quit Daminus", true)
        ]
    );

    // A passing failure offers Try again instead of a dimmed Scan now.
    let busy = AppError::from(ErrorCode::StoreBusy);
    let i = Inputs {
        report_error: Some(&busy),
        ..inputs(None, &p)
    };
    let v = view(&i, &en());
    assert_eq!(v.items[1].id, TRY_AGAIN);
    assert_eq!(v.items[1].label, "Try again");
}

#[test]
fn an_older_readable_result_keeps_its_icon_and_says_newer_ones_failed() {
    let (r, p) = (report(2, 4), projects());
    let damaged = AppError::from(ErrorCode::Io {
        path: "snapshots/000013.json".into(),
    });
    let i = Inputs {
        report_error: Some(&damaged),
        ..inputs(Some(&r), &p)
    };
    let v = view(&i, &en());
    assert_eq!(v.title.as_deref(), Some("2"));
    assert_eq!(v.info[2], "Showing scan #12 · newer results can’t be read");
    assert!(v.items.iter().any(|it| it.id == OPEN_TO_FIX));
    assert!(!v.items.iter().any(|it| it.id == OPEN));
}

#[test]
fn reduce_motion_follows_either_switch() {
    assert!(!reduce_motion(true, false));
    assert!(reduce_motion(false, false));
    assert!(reduce_motion(true, true));
}

#[test]
fn every_tray_key_is_in_both_languages() {
    let keys = |src: &str| {
        let v: Value = serde_json::from_str(src).unwrap();
        let mut k: Vec<String> = v["tray"].as_object().unwrap().keys().cloned().collect();
        k.sort();
        k
    };
    assert_eq!(keys(EN), keys(VI));
}

#[test]
fn among_critical_projects_the_one_with_most_criticals_needs_you() {
    let mut r = report(5, 1);
    let with = |id: &str, crit, warn| ProjectRollup {
        counts: Counts {
            crit,
            warn,
            ..Counts::default()
        },
        ..rollup(id, Level::Crit)
    };
    // In report order the first critical project has the fewest issues.
    r.projects = vec![with("c", 1, 0), with("a", 2, 0), with("b", 2, 1)];
    let p = projects();
    let v = view(&inputs(Some(&r), &p), &en());
    assert_eq!(v.info[1], "Scan #12 · 13:42 · kho-hang needs you");
}
