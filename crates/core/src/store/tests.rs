use std::fs;
use std::path::Path;

use serde_json::{Value, json};

use super::versioned::Doc;
use super::*;
use crate::domain::datetime::Timestamp;
use crate::domain::error::ErrorCode;
use crate::domain::fact::CheckFact;
use crate::domain::host::HostRef;
use crate::domain::project::{ComponentKind, DbEngine};
use crate::domain::settings::Theme;
use crate::domain::snapshot::HostOutcome;

const PROJECTS_V1: &str = include_str!("../../../../fixtures/config/projects.v1.json");
const SETTINGS_V1: &str = include_str!("../../../../fixtures/config/settings.v1.json");

fn store() -> (tempfile::TempDir, FsStore) {
    let dir = tempfile::tempdir().unwrap();
    let store = FsStore::new(dir.path());
    (dir, store)
}

fn names(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

#[test]
fn projects_v1_fixture_round_trips() {
    let (dir, store) = store();
    fs::write(dir.path().join(PROJECTS_FILE), PROJECTS_V1).unwrap();
    let loaded = store.load_projects().unwrap();
    assert!(!loaded.read_only);
    let p = &loaded.value;
    assert_eq!(p.projects[0].components.len(), 4);
    assert!(matches!(
        &p.projects[0].components[3].kind,
        ComponentKind::Db { engine: DbEngine::Mysql, container: Some(c), .. } if c == "shop-db-1"
    ));
    assert!(!p.host_included(&crate::domain::host::HostAlias::parse("legacy").unwrap()));
    assert_eq!(p.rules[0].fp.as_deref(), Some("52:1710400000:9f3a1c"));

    // Saving and reading back gives the same value, and the JSON matches the fixture.
    store.save_projects(p, loaded.stamp).unwrap();
    let again = store.load_projects().unwrap();
    assert_eq!(&again.value, p);
    let written: Value =
        serde_json::from_slice(&fs::read(dir.path().join(PROJECTS_FILE)).unwrap()).unwrap();
    let fixture: Value = serde_json::from_str(PROJECTS_V1).unwrap();
    assert_eq!(written, fixture);
}

#[test]
fn settings_v1_fixture_loads_with_defaults_for_missing_fields() {
    let (dir, store) = store();
    fs::write(dir.path().join(SETTINGS_FILE), SETTINGS_V1).unwrap();
    let s = store.load_settings().unwrap().value;
    assert_eq!(s.general.language, "vi");
    assert_eq!(s.appearance.theme, Theme::Dark);
    assert!(
        s.appearance.clear_sky,
        "missing field takes the board default"
    );
    assert_eq!(s.scan.connect_timeout_s, 30);
    assert_eq!(s.scan.skip_paths.len(), 6);
    assert_eq!(s.data.keep_scans, Some(50));
    assert_eq!(s.data.forget_ai_after_days, None);
}

#[test]
fn missing_files_give_defaults() {
    let (_dir, store) = store();
    let p = store.load_projects().unwrap();
    assert_eq!((p.value.version, p.stamp, p.read_only), (1, None, false));
    assert_eq!(
        store.load_settings().unwrap().value,
        crate::domain::settings::Settings::default()
    );
    assert!(store.load_history(None).unwrap().is_empty());
}

#[test]
fn settings_choices_and_nulls_survive_a_round_trip() {
    let (_dir, store) = store();
    let mut s = store.load_settings().unwrap();
    s.value.scan.hosts_at_once = Some(4);
    s.value.data.keep_scans = None;
    store.save_settings(&s.value, s.stamp).unwrap();
    let back = store.load_settings().unwrap().value;
    assert_eq!(
        (back.scan.hosts_at_once, back.data.keep_scans),
        (Some(4), None)
    );
}

#[test]
fn hand_edit_with_bad_host_is_set_aside_with_line() {
    let (dir, store) = store();
    let bad = PROJECTS_V1.replace(
        "\"host\": \"vps-b\", \"kind\": \"compose\"",
        "\"host\": \"-oProxyCommand=x\", \"kind\": \"compose\"",
    );
    assert_ne!(bad, PROJECTS_V1);
    fs::write(dir.path().join(PROJECTS_FILE), &bad).unwrap();
    let err = store.load_projects().unwrap_err();
    let ErrorCode::ConfigInvalid { path, line } = &err.code else {
        panic!("{err:?}")
    };
    assert!(path.ends_with("projects.json"));
    let line = line.expect("line number");
    // The bad component is on line 11 of the fixture.
    assert_eq!(line, 11);
    let files = names(dir.path());
    assert!(
        !files.contains(&PROJECTS_FILE.to_owned()),
        "never parsed over: moved aside"
    );
    let moved = files
        .iter()
        .find(|n| n.starts_with("projects.json.corrupt-"))
        .expect("set aside");
    assert_eq!(
        fs::read_to_string(dir.path().join(moved)).unwrap(),
        bad,
        "content kept"
    );
    assert_eq!(
        err.params
            .get("moved_to")
            .map(|p| p.ends_with(moved.as_str())),
        Some(true)
    );
}

#[test]
fn syntax_error_reports_its_line() {
    let (dir, store) = store();
    fs::write(
        dir.path().join(SETTINGS_FILE),
        "{\n  \"version\": 1,\n  \"general\": {,\n}\n",
    )
    .unwrap();
    let err = store.load_settings().unwrap_err();
    assert!(
        matches!(err.code, ErrorCode::ConfigInvalid { line: Some(3), .. }),
        "{err:?}"
    );
}

#[test]
fn version_zero_is_invalid_not_a_panic() {
    let (dir, store) = store();
    fs::write(dir.path().join(PROJECTS_FILE), r#"{"version":0}"#).unwrap();
    let err = store.load_projects().unwrap_err();
    assert!(
        matches!(err.code, ErrorCode::ConfigInvalid { .. }),
        "{err:?}"
    );
    assert!(
        !names(dir.path()).iter().any(|n| n.contains(".bak-v")),
        "no migration backup for an invalid version"
    );
}

#[test]
fn newer_version_is_read_only() {
    let (dir, store) = store();
    let newer = PROJECTS_V1.replacen("\"version\": 1", "\"version\": 7", 1);
    fs::write(dir.path().join(PROJECTS_FILE), &newer).unwrap();
    let loaded = store.load_projects().unwrap();
    assert!(loaded.read_only);
    assert_eq!(loaded.value.projects[0].id, "shop-x");
    let err = store
        .save_projects(&loaded.value, loaded.stamp)
        .unwrap_err();
    assert!(
        matches!(
            err.code,
            ErrorCode::ConfigFromNewerVersion { version: 7, .. }
        ),
        "{err:?}"
    );
    assert_eq!(
        fs::read_to_string(dir.path().join(PROJECTS_FILE)).unwrap(),
        newer,
        "untouched"
    );

    // Newer and not understood at all: an error, file untouched.
    fs::write(
        dir.path().join(PROJECTS_FILE),
        r#"{"version": 9, "projects": "moved"}"#,
    )
    .unwrap();
    let err = store.load_projects().unwrap_err();
    assert!(matches!(
        err.code,
        ErrorCode::ConfigFromNewerVersion { version: 9, .. }
    ));
    assert!(dir.path().join(PROJECTS_FILE).exists());
}

#[test]
fn hand_edit_between_load_and_save_is_not_overwritten() {
    let (dir, store) = store();
    fs::write(dir.path().join(PROJECTS_FILE), PROJECTS_V1).unwrap();
    let loaded = store.load_projects().unwrap();
    let edited = PROJECTS_V1.replace("shop-x.com", "shop-y.com");
    fs::write(dir.path().join(PROJECTS_FILE), &edited).unwrap();
    let err = store
        .save_projects(&loaded.value, loaded.stamp)
        .unwrap_err();
    assert!(matches!(err.code, ErrorCode::ConfigChangedOnDisk { .. }));
    assert_eq!(
        fs::read_to_string(dir.path().join(PROJECTS_FILE)).unwrap(),
        edited
    );

    // A file created after a "missing" load is also a conflict.
    let (dir2, store2) = self::store();
    let empty = store2.load_settings().unwrap();
    fs::write(dir2.path().join(SETTINGS_FILE), SETTINGS_V1).unwrap();
    assert!(matches!(
        store2
            .save_settings(&empty.value, empty.stamp)
            .unwrap_err()
            .code,
        ErrorCode::ConfigChangedOnDisk { .. }
    ));
}

#[test]
fn writes_are_pretty_and_atomic() {
    let (dir, store) = store();
    let p = store.load_projects().unwrap();
    store.save_projects(&p.value, p.stamp).unwrap();
    let text = fs::read_to_string(dir.path().join(PROJECTS_FILE)).unwrap();
    assert!(text.starts_with("{\n  \"version\": 1,"));
    assert!(text.ends_with("}\n"));
    assert!(
        names(dir.path()).iter().all(|n| !n.contains(".tmp-")),
        "no temp file left"
    );
}

fn v0_to_v1(mut doc: Value) -> Result<Value, String> {
    // Test step: v0 used `sites`; v1 calls them `projects`.
    let obj = doc.as_object_mut().ok_or("not an object")?;
    let sites = obj.remove("sites").ok_or("no sites")?;
    obj.insert("projects".into(), sites);
    Ok(doc)
}

#[test]
fn migration_chain_backs_up_then_upgrades() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("projects.json");
    // Pretend v2 is current and v1 stored projects under `sites`.
    let old = json!({"version": 1, "sites": [{"id": "a", "name": "a"}]});
    fs::write(&path, serde_json::to_vec(&old).unwrap()).unwrap();
    let steps: &[Migration] = &[v0_to_v1];
    let doc = Doc {
        path: &path,
        current: 2,
        migrations: steps,
    };
    let loaded: Stamped<Value> = doc.load().unwrap();
    assert_eq!(loaded.value["version"], 2);
    assert_eq!(loaded.value["projects"][0]["id"], "a");
    let backup: Value =
        serde_json::from_slice(&fs::read(dir.path().join("projects.json.bak-v1")).unwrap())
            .unwrap();
    assert_eq!(backup, old, "original kept as .bak-v1");
    let on_disk: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(on_disk, loaded.value, "migrated file written");

    // A failing step leaves the file set aside, not half-migrated.
    fs::write(&path, br#"{"version": 1, "nothing": true}"#).unwrap();
    let err = doc.load::<Value>().unwrap_err();
    assert!(matches!(err.code, ErrorCode::ConfigInvalid { .. }));
    assert!(!path.exists());
}

fn scan(host: &str, pct: u32) -> Snapshot {
    let at = Timestamp::from_unix(1_790_000_000);
    let mut s = Snapshot::new(at, at);
    let h = HostRef::parse(host).unwrap();
    s.hosts.insert(h.clone(), HostOutcome::Reached);
    s.facts.insert(
        h,
        vec![CheckFact::new("disk.fs", "/").with_data(json!({ "pct": pct }))],
    );
    s
}

#[test]
fn snapshots_numbered_pruned_and_read_newest_first() {
    let (dir, store) = store();
    for i in 1..=5 {
        assert_eq!(store.save_snapshot(scan("vps-a", i), Some(3)).unwrap(), i);
    }
    assert_eq!(store.snapshot_seqs().unwrap(), vec![3, 4, 5]);
    let snaps = dir.path().join(SNAPSHOTS_DIR);
    assert_eq!(
        names(&snaps),
        vec!["000003.json", "000004.json", "000005.json"]
    );

    // A damaged snapshot and a stray file are skipped.
    fs::write(snaps.join("000004.json"), "{ not json").unwrap();
    fs::write(snaps.join("notes.txt"), "x").unwrap();
    let history = store.load_history(None).unwrap();
    assert_eq!(
        history.iter().map(|s| s.seq).collect::<Vec<_>>(),
        vec![5, 3]
    );
    assert_eq!(store.load_history(Some(1)).unwrap().len(), 1);

    // Numbering continues after the highest file; `None` keeps everything.
    assert_eq!(store.save_snapshot(scan("vps-a", 1), None).unwrap(), 6);
    assert_eq!(store.snapshot_seqs().unwrap(), vec![3, 4, 5, 6]);
}

#[test]
fn snapshot_reading_is_lenient() {
    let (dir, store) = store();
    let snaps = dir.path().join(SNAPSHOTS_DIR);
    fs::create_dir_all(&snaps).unwrap();
    // Old or trimmed file: missing optional parts, unknown extra keys, seq from the file name.
    fs::write(
        snaps.join("000042.json"),
        r#"{"started_at":"2026-09-26T06:42:00Z","finished_at":"2026-09-26T06:43:00Z","extra":{"a":1}}"#,
    )
    .unwrap();
    let s = store.load_snapshot(42).unwrap();
    assert_eq!((s.seq, s.v, s.facts.len()), (42, 1, 0));
}

#[test]
fn state_is_lenient() {
    let (dir, store) = store();
    let mut st = store.load_state().unwrap();
    st.streak_weeks = 5;
    store.save_state(&st).unwrap();
    assert_eq!(store.load_state().unwrap().streak_weeks, 5);
    fs::write(dir.path().join(STATE_FILE), "garbage").unwrap();
    assert_eq!(
        store.load_state().unwrap(),
        crate::domain::app_state::AppState::default()
    );
    assert!(
        names(dir.path())
            .iter()
            .any(|n| n.starts_with("state.json.corrupt-"))
    );
}

#[test]
fn update_state_edits_under_one_lock_and_writes_nothing_on_a_failed_load() {
    let (dir, store) = store();
    let saved = store.update_state(|s| s.streak_weeks = 3).unwrap();
    assert_eq!(saved.streak_weeks, 3);
    assert_eq!(store.load_state().unwrap().streak_weeks, 3);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.path().join(STATE_FILE);
        fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
        if fs::read(&path).is_err() {
            let before = fs::metadata(&path).unwrap().modified().unwrap();
            assert!(store.update_state(|s| s.streak_weeks = 9).is_err());
            assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
            assert_eq!(store.load_state().unwrap().streak_weeks, 3);
        } else {
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        }
    }
}

#[test]
fn second_writer_waits_then_gets_store_busy() {
    let (dir, store) = store();
    let held = files::StoreLock::acquire(dir.path()).unwrap();
    let started = std::time::Instant::now();
    let err = store.save_state(&Default::default()).unwrap_err();
    assert_eq!(err.code, ErrorCode::StoreBusy);
    assert!(err.retryable);
    assert!(started.elapsed() >= std::time::Duration::from_secs(1));
    drop(held);
    store.save_state(&Default::default()).unwrap();
}

#[test]
fn update_settings_changes_one_section_and_keeps_the_rest() {
    let (dir, store) = store();
    fs::write(dir.path().join(SETTINGS_FILE), SETTINGS_V1).unwrap();
    let before = store.load_settings().unwrap().value;
    let saved = store
        .update_settings(|s| {
            s.appearance.theme = Theme::Light;
            s.general.ai_language = Some("en".into());
        })
        .unwrap();
    assert_eq!(saved.appearance.theme, Theme::Light);
    assert_eq!(saved.scan, before.scan);
    assert_eq!(saved.data, before.data);
    assert_eq!(store.load_settings().unwrap().value, saved);
}

#[test]
fn update_settings_refuses_a_scan_section_the_scan_could_misread() {
    let (dir, store) = store();
    fs::write(dir.path().join(SETTINGS_FILE), SETTINGS_V1).unwrap();
    let on_disk = fs::read(dir.path().join(SETTINGS_FILE)).unwrap();
    let changes: [fn(&mut crate::domain::settings::Settings); 7] = [
        |s| s.scan.connect_timeout_s = 7,
        |s| s.scan.hosts_at_once = Some(0),
        |s| s.scan.hosts_at_once = Some(9),
        |s| s.scan.large_file_mb = 0,
        |s| s.scan.skip_paths = vec!["--help".into()],
        |s| s.scan.skip_paths = vec!["a\nb".into()],
        |s| {
            s.scan.thresholds = vec![crate::domain::rule::ThresholdOverride {
                check: "disk.fs".into(),
                field: None,
                warn: Some(f64::NAN),
                crit: None,
                min: None,
            }]
        },
    ];
    for change in changes {
        let err = store.update_settings(change).unwrap_err();
        assert_eq!(err.code, ErrorCode::SchemaInvalid);
    }
    assert_eq!(fs::read(dir.path().join(SETTINGS_FILE)).unwrap(), on_disk);
}

#[test]
fn update_settings_keeps_a_valid_scan_section() {
    let (_dir, store) = store();
    let saved = store
        .update_settings(|s| {
            s.scan.connect_timeout_s = 30;
            s.scan.hosts_at_once = Some(2);
            s.scan.skip_paths.push("storage/logs".into());
            s.scan.thresholds = vec![crate::domain::rule::ThresholdOverride {
                check: "disk.fs".into(),
                field: None,
                warn: Some(70.0),
                crit: Some(85.0),
                min: None,
            }];
        })
        .unwrap();
    assert_eq!(store.load_settings().unwrap().value.scan, saved.scan);
}

#[test]
fn update_settings_refuses_an_unknown_language_and_writes_nothing() {
    let (dir, store) = store();
    fs::write(dir.path().join(SETTINGS_FILE), SETTINGS_V1).unwrap();
    let on_disk = fs::read(dir.path().join(SETTINGS_FILE)).unwrap();
    for change in [
        (|s: &mut crate::domain::settings::Settings| s.general.language = "xx".into())
            as fn(&mut crate::domain::settings::Settings),
        |s| s.general.language = "--help".into(),
        |s| s.general.ai_language = Some("fr".into()),
    ] {
        let err = store.update_settings(change).unwrap_err();
        assert_eq!(err.code, ErrorCode::SchemaInvalid);
    }
    assert_eq!(fs::read(dir.path().join(SETTINGS_FILE)).unwrap(), on_disk);
}

#[test]
fn update_settings_never_writes_over_a_newer_file() {
    let (dir, store) = store();
    let text = r#"{"version": 99, "general": {"language": "vi"}}"#;
    fs::write(dir.path().join(SETTINGS_FILE), text).unwrap();
    assert!(
        store
            .update_settings(|s| s.appearance.clear_sky = false)
            .is_err()
    );
    assert_eq!(
        fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap(),
        text
    );
}
