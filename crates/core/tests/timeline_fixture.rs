//! The shared 12-scan timeline (kho-hang, tiemtra, booking; scan #12 is
//! current), used by the scan engine tests and the UI. It lives in
//! `fixtures/timeline/` and is generated here through `FsStore`, so the files
//! are exactly what the app writes. Regenerate with:
//!
//! ```sh
//! DAMINUS_BLESS=1 cargo test -p daminus-core --test timeline_fixture
//! ```

// Integration tests are their own crate; panicking on a broken fixture is the point.
#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use daminus_core::domain::datetime::{Day, Timestamp};
use daminus_core::domain::evaluate::{Config, Delta, Disposition, Owner, evaluate};
use daminus_core::domain::expected::{ExpectedReason, ExpectedRule};
use daminus_core::domain::fact::CheckFact;
use daminus_core::domain::host::{HostAlias, HostRef};
use daminus_core::domain::manifest::{CheckGroup, Manifest};
use daminus_core::domain::project::{
    Component, ComponentKind, DbEngine, HostSettings, Project, ProjectsFile, Role,
};
use daminus_core::domain::settings::Settings;
use daminus_core::domain::severity::Level;
use daminus_core::domain::snapshot::{HostOutcome, NetCause, Snapshot};
use daminus_core::store::FsStore;
use serde_json::json;
use time::macros::{date, datetime};

const SCANS: u32 = 12;
/// Day of September 2026 for each scan (two scans on the 17th, none on the 23rd).
const DAYS: [u8; 12] = [15, 16, 17, 17, 18, 19, 20, 21, 22, 24, 25, 26];
const DURATION_S: [i64; 12] = [52, 49, 55, 51, 58, 54, 61, 57, 63, 66, 59, 62];
/// legacy-shop stops answering from this scan on.
const LEGACY_DOWN_FROM: u32 = 7;

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/timeline")
}

fn alias(s: &str) -> HostAlias {
    HostAlias::parse(s).expect("valid alias")
}

fn host(s: &str) -> HostRef {
    HostRef::parse(s).expect("valid host")
}

fn component(role: Role, h: &str, kind: ComponentKind) -> Component {
    Component {
        role,
        host: alias(h),
        kind,
    }
}

fn path(p: &str) -> ComponentKind {
    ComponentKind::Path { path: p.into() }
}

fn projects() -> ProjectsFile {
    let project = |id: &str, color: &str, urls: &[&str], components| Project {
        id: id.into(),
        name: id.into(),
        color: Some(color.into()),
        urls: urls.iter().map(|u| (*u).to_owned()).collect(),
        components,
        overrides: vec![],
    };
    ProjectsFile {
        projects: vec![
            project(
                "kho-hang",
                "#4F6BED",
                &["https://khohang.vn"],
                vec![
                    component(Role::Fe, "vps-hn-3", path("/var/www/khohang/public")),
                    component(Role::Be, "vps-hn-3", path("/var/www/khohang")),
                ],
            ),
            project(
                "tiemtra",
                "#9F86E6",
                &["https://tiemtra.vn", "https://api.tiemtra.vn"],
                vec![
                    component(Role::Fe, "vps-sg-1", path("/srv/tiemtra-web")),
                    component(
                        Role::Worker,
                        "vps-sg-1",
                        ComponentKind::Pm2 {
                            app: "tiemtra-cron".into(),
                            pm2_home: None,
                        },
                    ),
                    component(
                        Role::Be,
                        "vps-sg-2",
                        ComponentKind::Compose {
                            project: "tiemtra".into(),
                        },
                    ),
                    component(
                        Role::Db,
                        "vps-sg-2",
                        ComponentKind::Db {
                            engine: DbEngine::Postgres,
                            database: Some("tiemtra".into()),
                            env_file: Some("/srv/tiemtra-api/.env".into()),
                            container: Some("tiemtra-api-db-1".into()),
                        },
                    ),
                ],
            ),
            project(
                "booking",
                "#E58FB2",
                &["https://booking.vn"],
                vec![
                    component(Role::Be, "vps-sg-2", path("/srv/booking")),
                    component(
                        Role::Worker,
                        "vps-sg-2",
                        ComponentKind::Pm2 {
                            app: "booking-queue".into(),
                            pm2_home: None,
                        },
                    ),
                    component(
                        Role::Db,
                        "db-main",
                        ComponentKind::Db {
                            engine: DbEngine::Mysql,
                            database: Some("booking".into()),
                            env_file: Some("/srv/booking/.env".into()),
                            container: None,
                        },
                    ),
                ],
            ),
        ],
        hosts: [("legacy-shop", true)]
            .into_iter()
            .map(|(h, include)| (alias(h), HostSettings { include }))
            .collect(),
        rules: vec![
            ExpectedRule {
                id: "exp-booking-silence-php".into(),
                host: host("vps-sg-2"),
                check: "sec.upload_php".into(),
                target: "/srv/booking/storage/app/public/uploads/index.php".into(),
                fp: Some("52:1710400000:9f3a1c".into()),
                reason: ExpectedReason::Intended,
                until: Some(Day::new(date!(2026 - 10 - 26))),
                note: "Laravel silence file, blocks dir listing.".into(),
            },
            ExpectedRule {
                id: "exp-booking-redis".into(),
                host: host("db-main"),
                check: "sec.ports".into(),
                target: "0.0.0.0:6379".into(),
                fp: None,
                reason: ExpectedReason::AcceptedRisk,
                until: Some(Day::new(date!(2026 - 12 - 25))),
                note: "Behind the provider firewall.".into(),
            },
        ],
        ..ProjectsFile::default()
    }
}

/// Seconds since boot at scan #1: scan #12 reads "up 41 d", as the board draws vps-sg-2.
const UPTIME_AT_SCAN_1: u32 = 30 * 86_400 + 3_600;

/// Server basics every reached host reports.
fn basics(s: u32, cores: u32, load: f64, mem_free: f64, disk_pct: u32) -> Vec<CheckFact> {
    let jitter = f64::from(s % 3) * 0.1;
    vec![
        CheckFact::new("sys.load", "")
            .with_value(load + jitter, "load")
            .with_data(json!({
                "cores": cores,
                "load1": load + jitter + 0.3,
                "load15": load * 0.7,
                "uptime": UPTIME_AT_SCAN_1 + (s - 1) * 86_400,
                "os": "Ubuntu 24.04",
            })),
        CheckFact::new("sys.mem", "")
            .with_value(mem_free - jitter, "%")
            .with_data(json!({ "total": gb(f64::from(cores) * 2.0) })),
        CheckFact::new("sys.swap", "").with_value(3.0, "%"),
        CheckFact::new("sys.oom", "").with_value(0.0, "count"),
        CheckFact::new("disk.fs", "/").with_data(json!({
            "pct": disk_pct,
            "ipct": 12,
            "size": DISK_SIZE,
            "used": disk_used(disk_pct),
            "avail": DISK_SIZE - disk_used(disk_pct),
            "fs": "ext4",
        })),
        CheckFact::new("sec.miner", "")
            .with_value(0.0, "count")
            .with_data(json!({ "seen": 64, "total": 64 })),
        CheckFact::new("sec.preload", "").with_value(0.0, "count"),
    ]
}

/// Every server's root disk: 95 GB (binary, as the app prints sizes), as the board draws vps-sg-2.
const DISK_SIZE: f64 = 95.0 * GIB;
const GIB: f64 = 1024.0 * 1024.0 * 1024.0;

/// Bytes used at `pct`, to 0.1 GB (87% reads "82.6 of 95 GB · 12.4 GB free").
fn disk_used(pct: u32) -> f64 {
    (DISK_SIZE * f64::from(pct) / 100.0 / (GIB / 10.0)).floor() * (GIB / 10.0)
}

/// A container's CPU in scan `s`: it moves from scan to scan like a real one, and scan #12
/// reads `now` (the board's value).
fn cpu(now: f64, s: u32) -> f64 {
    const WAVE: [f64; 12] = [0.6, 0.9, 0.7, 1.2, 1.0, 0.8, 1.3, 1.1, 0.7, 0.9, 1.2, 1.0];
    (now * WAVE[(s as usize - 1) % 12] * 10.0).round() / 10.0
}

fn mb(x: u32) -> f64 {
    f64::from(x) * 1024.0 * 1024.0
}

fn gb(x: f64) -> f64 {
    (x * 1024.0 * 1024.0 * 1024.0).round()
}

fn scan(s: u32) -> Snapshot {
    let i = usize::try_from(s - 1).expect("small");
    let started = Timestamp::new(
        datetime!(2026-09-01 06:41:00 UTC) + time::Duration::days(i64::from(DAYS[i]) - 1),
    );
    let finished = Timestamp::from_unix(started.unix() + DURATION_S[i]);
    let mut snap = Snapshot::new(started, finished);
    snap.bundle_hash = "b1f0c3d2".into();
    let groups: BTreeSet<CheckGroup> = [
        CheckGroup::System,
        CheckGroup::Disk,
        CheckGroup::Containers,
        CheckGroup::Databases,
        CheckGroup::Security,
    ]
    .into();
    let mut add = |h: &str, outcome: HostOutcome, facts: Vec<CheckFact>| {
        let r = host(h);
        if outcome.is_reached() {
            let g = if h == "@local" {
                [CheckGroup::Uptime, CheckGroup::Security].into()
            } else {
                groups.clone()
            };
            snap.coverage.insert(r.clone(), g);
        }
        if !facts.is_empty() {
            snap.facts.insert(r.clone(), facts);
        }
        snap.hosts.insert(r, outcome);
    };

    // vps-sg-2: tiemtra API + DB, booking app + worker. Disk climbs to 87%.
    let sg2_disk = [72, 73, 74, 75, 76, 77, 78, 79, 79, 81, 84, 87][i];
    let mut sg2 = basics(s, 4, 1.4, 24.0, sg2_disk);
    sg2.extend([
        CheckFact::new("docker.compose", "tiemtra").with_data(json!({
            "containers": 4, "running": 4, "not_running": 0,
            "restarts": if s >= 11 { 1 } else { 0 }, "mem_pct": 61,
            "services": [
                {"name": "tiemtra-api-api-1", "svc": "api", "state": "running", "restarts": 0,
                 "mem": mb(380 + s * 3), "limit": mb(512), "cpu": cpu(3.2, s), "oom": false, "exit": 0,
                 "started": "2026-09-20T09:12:03.412Z", "exited": "",
                 "port": "8000", "ports_more": 1, "image": "tiemtra-api:1.5.0"},
                {"name": "tiemtra-api-worker-1", "svc": "worker", "state": "running",
                 "restarts": if s >= 11 { 1 } else { 0 },
                 "mem": mb(120 + (s % 4) * 130), "limit": mb(512), "cpu": cpu(0.8, s),
                 "oom": s >= 11, "exit": if s >= 11 { 137 } else { 0 },
                 "started": "2026-09-26T06:19:51.007Z",
                 "exited": if s >= 11 { "2026-09-26T06:19:42.118Z" } else { "" },
                 "port": "", "ports_more": 0, "image": "tiemtra-api:1.5.0"},
                {"name": "tiemtra-api-db-1", "svc": "db", "state": "running", "restarts": 0,
                 "mem": mb(1200), "limit": mb(2048), "cpu": cpu(1.1, s), "oom": false, "exit": 0,
                 "started": "2026-09-20T09:12:01.002Z", "exited": "",
                 "port": "5432", "ports_more": 0, "image": "postgres:16.4"},
                {"name": "tiemtra-api-redis-1", "svc": "redis", "state": "running", "restarts": 0,
                 "mem": mb(38), "limit": mb(256), "cpu": cpu(0.2, s), "oom": false, "exit": 0,
                 "started": "2026-09-20T09:12:01.402Z", "exited": "",
                 "port": "", "ports_more": 0, "image": "redis:7.2"},
            ],
        })),
        CheckFact::new("db.size", "tiemtra")
            .with_value(gb(1.38 + f64::from(s) * 0.037), "bytes")
            .with_data(json!({
                "engine": "postgres", "tables": 42,
                "top": [["orders", gb(0.45 + f64::from(s) * 0.03)], ["order_items", gb(0.4)],
                        ["events", gb(0.28)], ["products", gb(0.09)], ["users", gb(0.06)]],
                "other": gb(0.1),
            })),
        CheckFact::new("docker.df", "")
            .with_value(gb(18.2), "bytes")
            .with_data(json!({
                "images": {"count": 9, "active": 5, "size": gb(7.1), "reclaimable": gb(3.2)},
                "containers": {"count": 7, "active": 7, "size": gb(0.4), "reclaimable": 0},
                "volumes": {"count": 6, "active": 6, "size": gb(4.3), "reclaimable": 0},
                "build_cache": {"count": 41, "active": 0, "size": gb(6.4), "reclaimable": gb(6.4)},
            })),
        CheckFact::new("disk.path", "/srv/booking")
            .with_value(gb(6.0 + f64::from(s) * 0.01), "bytes")
            .with_data(json!({
                "top": [["storage", gb(3.9)], ["public", gb(1.4)], [".git", gb(0.4)]],
                "other": gb(0.3),
                "files": [["storage/app/backups/db-2026-09-01.sql.gz", mb(78), 1_788_307_200_u32]],
                "partial": false,
            })),
        CheckFact::new("pm2.app", "booking-queue")
            .with_data(json!({ "status": "online", "restarts": 1, "mem_mb": 84 })),
        CheckFact::new(
            "sec.upload_php",
            "/srv/booking/storage/app/public/uploads/index.php",
        )
        .with_value(1.0, "count")
        .with_fp("52:1710400000:9f3a1c")
        .with_data(json!({ "size": 52, "owner": "www-data" })),
        CheckFact::new("sec.ports", "").with_value(0.0, "count"),
    ]);
    add("vps-sg-2", HostOutcome::Reached, sg2);

    // vps-sg-1: tiemtra web + cron worker, which restarts three times before #12.
    let mut sg1 = basics(s, 2, 0.4, 49.0, 64);
    sg1.extend([
        CheckFact::new("disk.path", "/srv/tiemtra-web")
            .with_value(gb(4.5 + f64::from(s) * 0.075), "bytes")
            .with_data(json!({
                "top": [
                    ["public/uploads", gb(2.6)],
                    ["storage/logs", gb(0.1 * f64::from(s))],
                    ["storage/app", gb(1.1)],
                    [".git", gb(0.4)],
                ],
                "other": gb(0.4),
                "files": [
                    ["storage/logs/laravel-2026-09-25.log", mb(640), 1_790_402_400_u32],
                    ["public/uploads/2026/07/promo-video.mov", mb(402), 1_784_006_400_u32],
                    ["public/uploads/2026/09/banner-4k.mp4", mb(96), 1_788_912_000_u32],
                ],
                "partial": false,
            })),
        CheckFact::new("pm2.app", "tiemtra-cron").with_data(json!({
            "status": "online", "restarts": if s >= 12 { 3 } else { 0 }, "mem_mb": 62,
        })),
        CheckFact::new("sec.ports", "").with_value(0.0, "count"),
    ]);
    add("vps-sg-1", HostOutcome::Reached, sg1);

    // vps-hn-3: kho-hang. MySQL open to the world from #5, a PHP file in uploads from #10.
    let mut hn3 = basics(s, 2, 0.9, 37.0, 52);
    hn3.push(
        CheckFact::new("disk.path", "/var/www/khohang")
            .with_value(gb(2.8 + f64::from(s) * 0.035), "bytes"),
    );
    hn3.push(if s >= 5 {
        CheckFact::new("sec.ports", "0.0.0.0:3306")
            .with_value(1.0, "count")
            .with_data(json!({ "port": 3306, "proc": "mariadbd" }))
    } else {
        CheckFact::new("sec.ports", "").with_value(0.0, "count")
    });
    hn3.push(if s >= 10 {
        CheckFact::new(
            "sec.upload_php",
            "/var/www/khohang/public/uploads/shell.php",
        )
        .with_value(1.0, "count")
        .with_fp("3481:1790200000:0b77e2")
        .with_data(json!({ "size": 3481, "mtime": 1_790_300_000, "total": 137 }))
    } else {
        CheckFact::new("sec.upload_php", "").with_value(0.0, "count")
    });
    add("vps-hn-3", HostOutcome::Reached, hn3);

    // db-main: booking database; Redis on 0.0.0.0:6379 is expected.
    let mut db = basics(s, 2, 0.2, 42.0, 41);
    db.extend([
        CheckFact::new("db.size", "booking")
            .with_value(gb(2.3 + f64::from(s) * 0.008), "bytes")
            .with_data(json!({ "engine": "mysql", "tables": 57 })),
        CheckFact::new("sec.ports", "0.0.0.0:6379")
            .with_value(1.0, "count")
            .with_data(json!({ "port": 6379, "proc": "redis-server" })),
    ]);
    add("db-main", HostOutcome::Reached, db);

    // legacy-shop: no project; unreachable from #7.
    if s < LEGACY_DOWN_FROM {
        add(
            "legacy-shop",
            HostOutcome::Reached,
            basics(s, 1, 0.3, 30.0, 58),
        );
    } else {
        add(
            "legacy-shop",
            HostOutcome::Unreachable {
                cause: NetCause::ConnectTimeout,
            },
            vec![],
        );
    }

    // Probes from this Mac.
    let http = |url: &str, ms: f64| {
        CheckFact::new("url.http", url)
            .with_value(ms, "ms")
            .with_data(json!({ "status": 200, "class": "2xx" }))
    };
    let tls = |url: &str, days: f64| CheckFact::new("url.tls", url).with_value(days, "days");
    let booking_tls = match s {
        10 => 7.0,
        11 => 6.0,
        12 => 90.0,
        _ => 20.0 - f64::from(s) * 0.5,
    };
    let local = vec![
        http("https://khohang.vn", 212.0),
        tls("https://khohang.vn", 61.0 - f64::from(s)),
        if s >= 8 {
            CheckFact::new("url.exposed", "https://khohang.vn/.env")
                .with_value(1.0, "count")
                .with_data(json!({
                    "exposed": true,
                    "matched_keys": ["/.env:APP_KEY", "/.env:DB_PASSWORD", "/.env:DB_USERNAME", "/.env:MAIL_PASSWORD"],
                }))
        } else {
            CheckFact::new("url.exposed", "https://khohang.vn").with_value(0.0, "count")
        },
        http("https://tiemtra.vn", 142.0),
        tls("https://tiemtra.vn", 80.0 - f64::from(s)),
        http("https://api.tiemtra.vn", 188.0),
        tls("https://api.tiemtra.vn", 86.0 - f64::from(s)),
        http("https://booking.vn", 180.0),
        tls("https://booking.vn", booking_tls),
    ];
    add("@local", HostOutcome::Reached, local);
    snap
}

/// Writes the fixture into `dir` through the store.
fn write_fixture(dir: &Path) {
    let store = FsStore::new(dir);
    store.save_projects(&projects(), None).expect("projects");
    store
        .save_settings(&Settings::default(), None)
        .expect("settings");
    for s in 1..=SCANS {
        assert_eq!(store.save_snapshot(scan(s), Some(20)).expect("snapshot"), s);
    }
}

fn files_under(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).expect("read dir").flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            out.extend(files_under(&p));
        } else {
            out.push(p);
        }
    }
    out.sort();
    out
}

#[test]
fn committed_fixture_matches_the_generator() {
    let fixture = fixture_dir();
    if std::env::var_os("DAMINUS_BLESS").is_some() {
        for f in files_under(&fixture) {
            fs::remove_file(f).expect("clean");
        }
        write_fixture(&fixture);
        let _ = fs::remove_file(fixture.join(".lock"));
    }
    let tmp = tempfile::tempdir().expect("tmp");
    write_fixture(tmp.path());
    let want: Vec<PathBuf> = files_under(tmp.path());
    let have: Vec<PathBuf> = files_under(&fixture);
    let rel = |base: &Path, v: &[PathBuf]| -> Vec<PathBuf> {
        v.iter()
            .map(|p| p.strip_prefix(base).expect("under base").to_path_buf())
            .collect()
    };
    assert_eq!(
        rel(&fixture, &have),
        rel(tmp.path(), &want),
        "file list; run with DAMINUS_BLESS=1"
    );
    for (h, w) in have.iter().zip(&want) {
        assert!(
            fs::read(h).expect("read") == fs::read(w).expect("read"),
            "{} differs; run with DAMINUS_BLESS=1",
            h.display()
        );
    }
}

/// Copies `from` into `to` (the store takes a lock file, so tests read a copy).
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("mkdir");
    for entry in fs::read_dir(from).expect("read dir").flatten() {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("copy");
        }
    }
}

fn load() -> (ProjectsFile, Settings, Manifest, Vec<Snapshot>) {
    let tmp = tempfile::tempdir().expect("tmp");
    copy_dir(&fixture_dir(), tmp.path());
    let store = FsStore::new(tmp.path());
    // The shipped manifest, so the timeline always grades with today's rules.
    let manifest: Manifest = daminus_core::checks::manifest().expect("manifest");
    let projects = store.load_projects().expect("projects").value;
    let settings = store.load_settings().expect("settings").value;
    let history = store.load_history(None).expect("history");
    (projects, settings, manifest, history)
}

#[test]
fn scan_12_matches_the_overview_board() {
    let (projects, settings, manifest, history) = load();
    assert_eq!(history.len(), 12);
    let now = Timestamp::new(datetime!(2026-09-26 06:50 UTC));
    let r = evaluate(
        &history,
        Config {
            projects: &projects,
            settings: &settings,
        },
        &manifest,
        now,
    );
    assert_eq!(r.seq, Some(12));

    // "6 issues across 3 projects and 5 servers: 2 critical, 3 warnings, 1 server · disk 87%".
    assert_eq!((r.counts.crit, r.counts.warn), (2, 4));
    let project = |id: &str| r.projects.iter().find(|p| p.id == id).expect("project");
    let kho = project("kho-hang");
    assert_eq!(
        (kho.level, kho.counts.crit, kho.counts.warn),
        (Level::Crit, 2, 1)
    );
    let tiemtra = project("tiemtra");
    assert_eq!(
        (tiemtra.level, tiemtra.counts.crit, tiemtra.counts.warn),
        (Level::Warn, 0, 2)
    );
    let booking = project("booking");
    assert_eq!(
        (booking.level, booking.counts.expected),
        (Level::Ok, 2),
        "all clear, 2 expected"
    );
    let server_issues: Vec<_> = r
        .items
        .iter()
        .filter(|i| i.is_open_issue() && matches!(i.owner, Owner::Server { .. }))
        .collect();
    assert_eq!(server_issues.len(), 1);
    assert_eq!(
        (
            server_issues[0].key.host.as_str(),
            server_issues[0].key.check.as_str()
        ),
        ("vps-sg-2", "disk.fs")
    );

    // Compare #12 vs #11 and the scans each issue has survived.
    let delta = |h: &str, check: &str, target: &str| {
        r.items
            .iter()
            .find(|i| i.key.host.as_str() == h && i.key.check == check && i.key.target == target)
            .and_then(|i| i.delta.clone())
    };
    let upload = "/var/www/khohang/public/uploads/shell.php";
    assert_eq!(
        delta("vps-sg-1", "pm2.app", "tiemtra-cron"),
        Some(Delta::New),
        "worker restarted 3 times"
    );
    assert_eq!(
        delta("vps-sg-2", "docker.compose", "tiemtra"),
        Some(Delta::Still { scans_open: 2 })
    );
    assert_eq!(
        delta("vps-hn-3", "sec.upload_php", upload),
        Some(Delta::Still { scans_open: 3 })
    );
    assert_eq!(
        delta("@local", "url.exposed", "https://khohang.vn/.env"),
        Some(Delta::Still { scans_open: 5 })
    );
    assert_eq!(
        delta("vps-hn-3", "sec.ports", "0.0.0.0:3306"),
        Some(Delta::Still { scans_open: 8 })
    );
    assert_eq!(
        delta("@local", "url.tls", "https://booking.vn"),
        Some(Delta::Fixed),
        "certificate renewed"
    );
    assert_eq!(
        delta("vps-sg-2", "disk.fs", "/"),
        Some(Delta::Still { scans_open: 3 })
    );

    // legacy-shop: unreachable since #7, last reached in #6, its results stale.
    let legacy = r
        .servers
        .iter()
        .find(|s| s.host.as_str() == "legacy-shop")
        .expect("legacy");
    assert!(matches!(
        legacy.outcome,
        Some(HostOutcome::Unreachable { .. })
    ));
    assert_eq!(legacy.last_reached_seq, Some(6));
    assert!(
        r.items
            .iter()
            .filter(|i| i.key.host.as_str() == "legacy-shop")
            .all(|i| i.disposition == Disposition::Stale { since_seq: 6 })
    );
    assert_eq!(r.servers.len(), 5);
    assert!(r.rules_due.is_empty());
}
