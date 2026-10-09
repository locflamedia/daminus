//! End to end through the app layer, without a webview: the same functions
//! the IPC commands call, a scripted transport, and the event pump that
//! feeds `scan://event`. Runs on any CI runner (no WebKit needed).

// Helpers outside `#[test]` fns unwrap too; this file is test code only.
#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use daminus_app::app::{AppCore, is_final, pump};
use daminus_core::domain::error::ErrorCode;
use daminus_core::domain::project::ProjectsFile;
use daminus_core::probe::fake::FakeProbe;
use daminus_core::scan::{ScanEvent, ScanEventBody, ScanScope};
use daminus_core::ssh::SshTools;
use daminus_core::ssh::fake::{FakeHost, FakeTransport, fixture_run};
use daminus_core::store::FsStore;
use serde_json::json;
use tempfile::TempDir;
use tokio::sync::oneshot;

fn projects() -> ProjectsFile {
    serde_json::from_value(json!({
        "version": 1,
        "projects": [{
            "id": "shop",
            "name": "Shop",
            "urls": ["https://shop.example"],
            "components": [
                {"role": "be", "host": "vps-a", "kind": "path", "path": "/srv/a"},
                {"role": "db", "host": "vps-b", "kind": "path", "path": "/srv/b"}
            ]
        }]
    }))
    .unwrap()
}

struct Rig {
    _dir: TempDir,
    core: AppCore,
    events: Arc<Mutex<Vec<ScanEvent>>>,
    ended: Option<oneshot::Receiver<()>>,
}

/// An app core over a temp config folder, with the pump collecting events
/// the way the app emits them to the webview.
fn rig(transport: FakeTransport) -> Rig {
    let dir = TempDir::new().unwrap();
    let store = FsStore::new(dir.path());
    store.save_projects(&projects(), None).unwrap();
    let (core, events) = AppCore::new(
        Arc::new(transport),
        SshTools::new(),
        Arc::new(FakeProbe::new()),
        store,
    );
    let rx = events.scan;
    let events = Arc::new(Mutex::new(Vec::new()));
    let (tx, ended) = oneshot::channel();
    let mut tx = Some(tx);
    let sink = Arc::clone(&events);
    tokio::spawn(pump(rx, move |event| {
        // Exactly what the app sends on `scan://event`.
        let wire = serde_json::to_value(&event).unwrap();
        assert!(wire["kind"].is_string() && wire["scan_id"].is_string());
        let last = is_final(&event);
        sink.lock().unwrap().push(event);
        if last && let Some(tx) = tx.take() {
            let _ = tx.send(());
        }
    }));
    Rig {
        _dir: dir,
        core,
        events,
        ended: Some(ended),
    }
}

impl Rig {
    async fn wait_end(&mut self) -> Vec<ScanEvent> {
        let ended = self.ended.take().unwrap();
        tokio::time::timeout(Duration::from_secs(10), ended)
            .await
            .expect("scan did not end")
            .unwrap();
        self.events.lock().unwrap().clone()
    }
}

fn healthy() -> FakeHost {
    FakeHost::output(fixture_run("ubuntu-24.04").unwrap())
}

#[tokio::test]
async fn scan_start_streams_events_saves_and_reports() {
    let mut r = rig(FakeTransport::new()
        .host("vps-a", healthy())
        .host("vps-b", healthy()));
    assert!(r.core.report_latest().unwrap().seq.is_none());

    let started = r.core.scan_start(&ScanScope::default()).unwrap();
    assert!(!started.joined);
    let events = r.wait_end().await;

    // One scan id, seq rising by one from 0, ending in Done.
    assert!(events.iter().all(|e| e.scan_id == started.scan_id));
    let seqs: Vec<u32> = events.iter().map(|e| e.seq).collect();
    assert_eq!(seqs, (0..events.len() as u32).collect::<Vec<_>>());
    assert!(matches!(
        events.last().unwrap().body,
        ScanEventBody::Done { snapshot_seq: 1 }
    ));
    let finished = events
        .iter()
        .filter(|e| matches!(e.body, ScanEventBody::HostFinished { .. }))
        .count();
    assert_eq!(finished, 3, "two hosts and @local for the URL");
    assert!(
        events
            .iter()
            .any(|e| matches!(e.body, ScanEventBody::Fact { .. }))
    );

    assert_eq!(r.core.scan_status(), None);
    let report = r.core.report_latest().unwrap();
    assert_eq!(report.seq, Some(1));
    assert!(!report.items.is_empty());
}

#[tokio::test]
async fn second_start_joins_status_hydrates_and_stop_saves_nothing() {
    let slow = FakeHost::slow(
        &fixture_run("ubuntu-24.04").unwrap(),
        Duration::from_millis(200),
    );
    let mut r = rig(FakeTransport::new()
        .host("vps-a", slow.clone())
        .host("vps-b", slow));

    let first = r.core.scan_start(&ScanScope::default()).unwrap();
    // Tray and window pressing Scan at once: one scan.
    let second = r.core.scan_start(&ScanScope::default()).unwrap();
    assert!(second.joined);
    assert_eq!(second.scan_id, first.scan_id);

    // A reloaded webview reads the run so far.
    tokio::time::sleep(Duration::from_millis(50)).await;
    let status = r.core.scan_status().expect("scan running");
    assert_eq!(status.scan_id, first.scan_id);
    assert_eq!(status.hosts.len(), 3);

    assert!(r.core.scan_stop());
    let events = r.wait_end().await;
    assert!(matches!(
        events.last().unwrap().body,
        ScanEventBody::Cancelled
    ));
    assert!(!r.core.scan_stop(), "nothing left to stop");
    assert_eq!(r.core.report_latest().unwrap().seq, None);
}

#[tokio::test]
async fn errors_come_back_as_app_errors() {
    let r = rig(FakeTransport::new());
    let err = r
        .core
        .scan_start(&ScanScope {
            projects: vec!["nope".into()],
            hosts: vec![],
        })
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::NothingToScan);
    let wire = serde_json::to_value(&err).unwrap();
    assert_eq!(wire["code"]["kind"], "nothing_to_scan");
}

#[tokio::test]
async fn shutdown_cancels_and_kills_ssh() {
    let transport = Arc::new(FakeTransport::new().host("vps-a", FakeHost::AgentHang));
    let dir = TempDir::new().unwrap();
    let store = FsStore::new(dir.path());
    store.save_projects(&projects(), None).unwrap();
    let (core, events) = AppCore::new(
        transport.clone(),
        SshTools::new(),
        Arc::new(FakeProbe::new()),
        store,
    );
    let mut rx = events.scan;
    core.scan_start(&ScanScope::default()).unwrap();
    tokio::time::sleep(Duration::from_millis(50)).await;
    core.shutdown();
    let mut last = None;
    while let Ok(Some(e)) = tokio::time::timeout(Duration::from_secs(5), rx.recv()).await {
        let end = is_final(&e);
        last = Some(e);
        if end {
            break;
        }
    }
    assert!(matches!(last.unwrap().body, ScanEventBody::Cancelled));
    assert!(transport.kills() >= 1);
}

// --- Through the real `#[tauri::command]` functions, on Tauri's mock runtime.

mod ipc {
    use std::sync::mpsc;

    use daminus_app::app::SCAN_EVENT;
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{INVOKE_KEY, MockRuntime, mock_builder, mock_context, noop_assets};
    use tauri::webview::InvokeRequest;
    use tauri::{App, Listener as _, Manager as _, WebviewWindow, WebviewWindowBuilder};

    use super::*;

    struct MockApp {
        _dir: TempDir,
        _app: App<MockRuntime>,
        webview: WebviewWindow<MockRuntime>,
        events: mpsc::Receiver<serde_json::Value>,
    }

    /// The app's own command handler and event forwarding, over a fake transport.
    fn mock_app(transport: FakeTransport) -> MockApp {
        mock_app_with(transport, false)
    }

    /// Like [`mock_app`]; with `fake_programs` the ssh tools are scripts in a
    /// temp folder (`ssh-add` lists two keys, `ssh -V` answers on stderr) and
    /// the log file holds a credential-looking line.
    fn mock_app_with(transport: FakeTransport, fake_programs: bool) -> MockApp {
        let dir = TempDir::new().unwrap();
        let store = FsStore::new(dir.path());
        store.save_projects(&projects(), None).unwrap();
        let app = mock_builder()
            .invoke_handler(daminus_app::handler())
            .build(mock_context(noop_assets()))
            .unwrap();
        let ssh_config = dir.path().join("ssh_config");
        std::fs::write(
            &ssh_config,
            "Host vps-a\n  HostName 203.0.113.14\n  User deploy\nHost *\n  ServerAliveInterval 30\n",
        )
        .unwrap();
        let mut env = vec![("HOME", dir.path().as_os_str().to_owned())];
        let mut log = None;
        if fake_programs {
            let bin = dir.path().join("bin");
            std::fs::create_dir(&bin).unwrap();
            write_script(
                &bin.join("ssh-add"),
                "echo '256 SHA256:CanaryFp me@mac (ED25519)'\necho '3072 SHA256:CanaryFp2 me@mac (RSA)'",
            );
            write_script(&bin.join("ssh"), "echo 'OpenSSH_9.9p1 fake' >&2");
            env.push(("PATH", format!("{}:/usr/bin:/bin", bin.display()).into()));
            let file = dir.path().join("daminus.log");
            std::fs::write(
                &file,
                format!("INFO started\nERROR provider said {CANARY}\n"),
            )
            .unwrap();
            log = Some(file);
        }
        let (core, events) = AppCore::new(
            Arc::new(transport),
            SshTools::new().with_config(&ssh_config).with_env(env),
            Arc::new(FakeProbe::new().status("https://shop.example", 200, 42.0)),
            store,
        );
        let core = match log {
            Some(file) => core.with_log_file(file),
            None => core,
        };
        app.manage(core);
        // `forward_events` spawns on Tauri's runtime.
        let handle = app.handle().clone();
        tauri::async_runtime::block_on(async move { daminus_app::forward_events(&handle, events) });
        let (tx, events) = mpsc::channel();
        app.listen(SCAN_EVENT, move |e| {
            let _ = tx.send(serde_json::from_str(e.payload()).unwrap());
        });
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        MockApp {
            _dir: dir,
            _app: app,
            webview,
            events,
        }
    }

    const CANARY: &str = "sk-ant-api03-CanaryCanaryCanary0123456789abcdef";

    fn write_script(path: &std::path::Path, body: &str) {
        use std::os::unix::fs::PermissionsExt as _;
        std::fs::write(path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    impl MockApp {
        /// What `invoke(cmd, args)` in the webview gets back.
        fn invoke(
            &self,
            cmd: &str,
            args: serde_json::Value,
        ) -> Result<serde_json::Value, serde_json::Value> {
            tauri::test::get_ipc_response(
                &self.webview,
                InvokeRequest {
                    cmd: cmd.into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(),
                    body: InvokeBody::Json(args),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.to_string(),
                },
            )
            .map(|b| b.deserialize::<serde_json::Value>().unwrap())
        }

        /// Events on `scan://event` until the final one.
        fn events_until_end(&self) -> Vec<serde_json::Value> {
            let mut got = Vec::new();
            loop {
                let e = self
                    .events
                    .recv_timeout(Duration::from_secs(10))
                    .expect("scan did not end");
                let kind = e["kind"].as_str().unwrap_or_default().to_owned();
                got.push(e);
                if matches!(kind.as_str(), "done" | "cancelled" | "failed") {
                    return got;
                }
            }
        }
    }

    #[test]
    fn scan_start_with_null_scope_streams_tagged_events_and_reports() {
        let app = mock_app(
            FakeTransport::new()
                .host("vps-a", healthy())
                .host("vps-b", healthy()),
        );
        assert_eq!(
            app.invoke("report_latest", json!({})).unwrap()["seq"],
            json!(null)
        );

        let started = app.invoke("scan_start", json!({ "scope": null })).unwrap();
        assert_eq!(started["joined"], json!(false));
        let scan_id = started["scan_id"].as_str().unwrap().to_owned();

        let events = app.events_until_end();
        assert!(events.iter().all(|e| e["scan_id"] == json!(scan_id)));
        let seqs: Vec<u64> = events.iter().map(|e| e["seq"].as_u64().unwrap()).collect();
        assert_eq!(seqs, (0..events.len() as u64).collect::<Vec<_>>());
        assert_eq!(events.last().unwrap()["kind"], json!("done"));
        assert!(events.iter().any(|e| e["kind"] == json!("fact")));

        assert_eq!(app.invoke("scan_status", json!({})).unwrap(), json!(null));
        assert_eq!(
            app.invoke("report_latest", json!({})).unwrap()["seq"],
            json!(1)
        );
    }

    #[test]
    fn projects_list_returns_the_projects_without_host_settings_or_rules() {
        let app = mock_app(FakeTransport::new());
        let list = app.invoke("projects_list", json!({})).unwrap();
        assert_eq!(list.as_array().map(Vec::len), Some(1));
        assert_eq!(list[0]["id"], json!("shop"));
        assert_eq!(list[0]["name"], json!("Shop"));
        assert!(list[0]["components"].is_array());
    }

    #[test]
    fn scope_object_errors_reject_with_the_app_error_shape() {
        let app = mock_app(FakeTransport::new());
        let err = app
            .invoke(
                "scan_start",
                json!({ "scope": { "projects": ["nope"], "hosts": [] } }),
            )
            .unwrap_err();
        assert_eq!(err["code"]["kind"], json!("nothing_to_scan"));
        assert_eq!(err["retryable"], json!(false));
        // A misnamed argument is rejected, not silently treated as "scan all".
        assert!(app.invoke("scan_start", json!({ "scope": 5 })).is_err());
    }

    #[test]
    fn scan_stop_answers_after_the_scan_ended() {
        let slow = FakeHost::slow(
            &fixture_run("ubuntu-24.04").unwrap(),
            Duration::from_millis(300),
        );
        let app = mock_app(
            FakeTransport::new()
                .host("vps-a", slow.clone())
                .host("vps-b", slow),
        );
        let started = app.invoke("scan_start", json!({})).unwrap();
        let joined = app.invoke("scan_start", json!({ "scope": null })).unwrap();
        assert_eq!(joined["joined"], json!(true));
        assert_eq!(joined["scan_id"], started["scan_id"]);
        let status = app.invoke("scan_status", json!({})).unwrap();
        assert_eq!(status["scan_id"], started["scan_id"]);
        assert!(status["next_seq"].is_u64());

        assert_eq!(app.invoke("scan_stop", json!({})).unwrap(), json!(true));
        // Gone by the time the stop answers: a re-hydrate right after sees it.
        assert_eq!(app.invoke("scan_status", json!({})).unwrap(), json!(null));
        assert_eq!(
            app.events_until_end().last().unwrap()["kind"],
            json!("cancelled")
        );
        assert_eq!(app.invoke("scan_stop", json!({})).unwrap(), json!(false));
    }

    #[test]
    fn hosts_list_gives_the_hosts_and_what_was_left_out() {
        let app = mock_app(FakeTransport::new());
        let got = app.invoke("hosts_list", json!({})).unwrap();
        assert_eq!(got["list"]["config_found"], json!(true));
        assert_eq!(got["list"]["hosts"][0]["alias"], json!("vps-a"));
        assert_eq!(got["list"]["skipped"][0]["reason"], json!("wildcard"));
        assert_eq!(got["entries"][0]["resolved"]["user"], json!("deploy"));
    }

    #[test]
    fn setup_start_without_hosts_rejects_with_nothing_to_scan() {
        let app = mock_app(FakeTransport::new());
        let err = app
            .invoke("setup_start", json!({ "step": "test", "hosts": [] }))
            .unwrap_err();
        assert_eq!(err["code"]["kind"], json!("nothing_to_scan"));
        assert_eq!(app.invoke("setup_status", json!({})).unwrap(), json!(null));
        assert_eq!(app.invoke("setup_stop", json!({})).unwrap(), json!(false));
        assert_eq!(
            app.invoke("setup_result", json!({})).unwrap()["hosts"],
            json!([])
        );
    }

    fn sheet_project(id: &str, urls: &[&str]) -> serde_json::Value {
        json!({
            "id": id, "name": id, "urls": urls,
            "components": [{"role": "fe", "host": "vps-a", "kind": "path", "path": "/srv/x"}]
        })
    }

    #[test]
    fn projects_save_checks_again_and_remove_takes_a_project_out() {
        let app = mock_app(FakeTransport::new());
        // An error stops the write, and says which field.
        let rejected = app
            .invoke(
                "projects_save",
                json!({ "projects": [sheet_project("Tiem Tra!", &[])], "hosts": [] }),
            )
            .unwrap();
        assert_eq!(rejected["status"], json!("rejected"));
        assert_eq!(rejected["issues"][0]["code"]["kind"], json!("bad_id"));
        assert_eq!(
            app.invoke("projects_list", json!({}))
                .unwrap()
                .as_array()
                .map(Vec::len),
            Some(1)
        );

        // A name that could be read as an option never gets as far as the file.
        let bad = json!({
            "id": "x", "name": "x", "urls": [],
            "components": [{"role": "fe", "host": "vps-a", "kind": "path", "path": "relative"}]
        });
        let err = app
            .invoke("projects_validate", json!({ "projects": [bad] }))
            .unwrap_err();
        assert_eq!(err["code"]["kind"], json!("schema_invalid"));

        let saved = app
            .invoke(
                "projects_save",
                json!({ "projects": [sheet_project("blog", &["http://localhost:3000"])], "hosts": ["vps-a"] }),
            )
            .unwrap();
        assert_eq!(saved["status"], json!("saved"));
        assert_eq!(saved["projects"], json!(2));
        assert_eq!(saved["issues"][0]["code"]["kind"], json!("url_local_only"));

        assert_eq!(
            app.invoke("projects_remove", json!({ "id": "blog" }))
                .unwrap(),
            json!(true)
        );
        assert_eq!(
            app.invoke("projects_remove", json!({ "id": "blog" }))
                .unwrap(),
            json!(false)
        );
    }

    #[test]
    fn url_check_answers_from_the_probe_and_refuses_other_schemes() {
        let app = mock_app(FakeTransport::new());
        let ok = app
            .invoke("url_check", json!({ "url": "https://shop.example" }))
            .unwrap();
        assert_eq!(ok["status"], json!(200));
        assert_eq!(ok["failure"], json!(null));
        let bad = app
            .invoke("url_check", json!({ "url": "ftp://shop.example" }))
            .unwrap();
        assert_eq!(bad["failure"], json!("invalid"));
    }

    #[test]
    fn app_launch_picks_the_journey_and_records_the_launch() {
        let app = mock_app(FakeTransport::new());
        let first = app.invoke("app_launch", json!({})).unwrap();
        assert_eq!(first, json!({ "kind": "first", "previous": null }));
        let second = app.invoke("app_launch", json!({})).unwrap();
        assert_eq!(second["kind"], json!("daily"));
        assert!(second["previous"].is_string());

        std::fs::write(
            app._dir.path().join("state.json"),
            r#"{ "last_opened_at": "2020-01-01T00:00:00Z" }"#,
        )
        .unwrap();
        let back = app.invoke("app_launch", json!({})).unwrap();
        assert_eq!(back["kind"], json!("returning"));
        assert_eq!(back["previous"], json!("2020-01-01T00:00:00Z"));
        assert_eq!(
            app.invoke("app_launch", json!({})).unwrap()["kind"],
            json!("daily")
        );
    }

    #[test]
    fn streak_get_reads_the_saved_weeks() {
        let app = mock_app(FakeTransport::new());
        assert_eq!(
            app.invoke("streak_get", json!({})).unwrap(),
            json!({ "weeks": 0 })
        );
        std::fs::write(
            app._dir.path().join("state.json"),
            r#"{ "streak_weeks": 6 }"#,
        )
        .unwrap();
        assert_eq!(
            app.invoke("streak_get", json!({})).unwrap(),
            json!({ "weeks": 6 })
        );
    }

    #[cfg(unix)]
    #[test]
    fn app_launch_with_an_unreadable_state_is_daily_and_leaves_the_file() {
        use std::os::unix::fs::PermissionsExt;
        let app = mock_app(FakeTransport::new());
        let path = app._dir.path().join("state.json");
        let body = r#"{ "last_opened_at": "2020-01-01T00:00:00Z" }"#;
        std::fs::write(&path, body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::read(&path).is_err() {
            let got = app.invoke("app_launch", json!({})).unwrap();
            assert_eq!(got, json!({ "kind": "daily", "previous": null }));
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
            assert_eq!(std::fs::read_to_string(&path).unwrap(), body);
        } else {
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        }
    }

    #[test]
    fn settings_sections_are_saved_checked_and_kept_apart() {
        let app = mock_app(FakeTransport::new());
        let first = app.invoke("settings_get", json!({})).unwrap();
        assert_eq!(first["general"]["language"], json!("en"));
        assert_eq!(first["appearance"]["theme"], json!("system"));

        let mut general = first["general"].clone();
        general["language"] = json!("vi");
        general["scan_on_open"] = json!(true);
        let saved = app
            .invoke("settings_set_general", json!({ "general": general }))
            .unwrap();
        assert_eq!(saved["general"]["language"], json!("vi"));
        assert_eq!(saved["appearance"], first["appearance"]);

        let mut appearance = first["appearance"].clone();
        appearance["theme"] = json!("dark");
        appearance["completion_chime"] = json!(true);
        let saved = app
            .invoke(
                "settings_set_appearance",
                json!({ "appearance": appearance }),
            )
            .unwrap();
        assert_eq!(saved["appearance"]["theme"], json!("dark"));
        assert_eq!(saved["general"]["language"], json!("vi"));
        assert_eq!(app.invoke("settings_get", json!({})).unwrap(), saved);

        let mut bad = saved["general"].clone();
        bad["language"] = json!("--help");
        assert!(
            app.invoke("settings_set_general", json!({ "general": bad }))
                .is_err()
        );
        let mut unknown_theme = saved["appearance"].clone();
        unknown_theme["theme"] = json!("neon");
        assert!(
            app.invoke(
                "settings_set_appearance",
                json!({ "appearance": unknown_theme })
            )
            .is_err()
        );
        assert_eq!(app.invoke("settings_get", json!({})).unwrap(), saved);
    }

    #[test]
    fn data_settings_are_saved_checked_and_reset() {
        let app = mock_app(FakeTransport::new());
        let saved = app
            .invoke(
                "settings_set_data",
                json!({ "data": { "keep_scans": 50, "forget_ai_after_days": null } }),
            )
            .unwrap();
        assert_eq!(saved["data"]["keep_scans"], json!(50));
        assert_eq!(saved["data"]["forget_ai_after_days"], json!(null));
        assert_eq!(app.invoke("settings_get", json!({})).unwrap(), saved);

        let refused = app.invoke(
            "settings_set_data",
            json!({ "data": { "keep_scans": 0, "forget_ai_after_days": 30 } }),
        );
        assert!(refused.is_err());
        assert_eq!(app.invoke("settings_get", json!({})).unwrap(), saved);

        let reset = app.invoke("settings_reset", json!({})).unwrap();
        assert_eq!(reset["data"]["keep_scans"], json!(20));
        assert_eq!(reset["general"]["language"], json!("en"));
    }

    #[test]
    fn data_usage_counts_the_folder_and_clear_empties_the_history() {
        let app = mock_app(FakeTransport::new());
        let usage = app.invoke("data_usage", json!({})).unwrap();
        assert_eq!(usage["scans"], json!(0));
        assert!(usage["path"].as_str().is_some());
        assert_eq!(app.invoke("data_clear", json!({})).unwrap(), json!(0));
    }

    #[test]
    fn scan_settings_are_saved_checked_and_read_back() {
        let app = mock_app(FakeTransport::new());
        let first = app.invoke("settings_get", json!({})).unwrap();
        let mut scan = first["scan"].clone();
        scan["connect_timeout_s"] = json!(30);
        scan["thresholds"] = json!([{ "check": "disk.fs", "warn": 70.0, "crit": 85.0 }]);
        let saved = app
            .invoke("settings_set_scan", json!({ "scan": scan }))
            .unwrap();
        assert_eq!(saved["scan"]["connect_timeout_s"], json!(30));
        assert_eq!(app.invoke("settings_get", json!({})).unwrap(), saved);

        let mut bad = saved["scan"].clone();
        bad["skip_paths"] = json!(["--help"]);
        assert!(
            app.invoke("settings_set_scan", json!({ "scan": bad }))
                .is_err()
        );
        assert_eq!(app.invoke("settings_get", json!({})).unwrap(), saved);
    }

    #[test]
    fn a_host_can_be_left_out_of_scans_and_put_back() {
        let app = mock_app(FakeTransport::new());
        assert_eq!(app.invoke("hosts_excluded", json!({})).unwrap(), json!([]));
        let off = app
            .invoke(
                "hosts_set_include",
                json!({ "host": "vps-a", "include": false }),
            )
            .unwrap();
        assert_eq!(off, json!(["vps-a"]));
        assert_eq!(app.invoke("hosts_excluded", json!({})).unwrap(), off);
        assert!(
            app.invoke(
                "hosts_set_include",
                json!({ "host": "-oProxyCommand=x", "include": false })
            )
            .is_err()
        );
        let on = app
            .invoke(
                "hosts_set_include",
                json!({ "host": "vps-a", "include": true }),
            )
            .unwrap();
        assert_eq!(on, json!([]));
    }

    #[test]
    fn ssh_environment_has_the_agent_and_termius_but_no_key_material() {
        let app = mock_app(FakeTransport::new());
        let env = app.invoke("ssh_environment", json!({})).unwrap();
        assert!(env["agent"].is_string());
        assert!(env["keys"].is_u64());
        assert!(env["termius_installed"].is_boolean());
        assert_eq!(env.as_object().map(serde_json::Map::len), Some(3));
    }

    #[test]
    fn agent_status_is_presence_and_a_key_count_only() {
        let app = mock_app_with(FakeTransport::new(), true);
        let status = app.invoke("agent_status", json!({})).unwrap();
        assert_eq!(
            status,
            json!({ "present": true, "has_keys": true, "keys": 2 })
        );
        assert!(!status.to_string().contains("Canary"));
    }

    #[test]
    fn agent_status_without_ssh_add_says_no_agent() {
        let app = mock_app(FakeTransport::new());
        let status = app.invoke("agent_status", json!({})).unwrap();
        assert_eq!(status.as_object().map(serde_json::Map::len), Some(3));
        assert!(status["present"].is_boolean() && status["has_keys"].is_boolean());
    }

    #[test]
    fn diagnostics_collect_returns_redacted_text_and_nothing_else() {
        let app = mock_app_with(FakeTransport::new().host("vps-a", healthy()), true);
        app.invoke("scan_start", json!({ "scope": null })).unwrap();
        app.events_until_end();
        let got = app.invoke("diagnostics_collect", json!({})).unwrap();
        assert_eq!(got.as_object().map(serde_json::Map::len), Some(1));
        let text = got["text"].as_str().unwrap();
        assert!(text.contains("OpenSSH_9.9p1 fake"), "{text}");
        assert!(text.contains("/bin:/usr/bin:/bin"), "{text}");
        assert!(text.contains("\"language\": \"en\""), "{text}");
        assert!(text.contains("vps-a: reached"), "{text}");
        assert!(text.contains("ERROR provider said"), "{text}");
        assert!(!text.contains("CanaryCanary"), "{text}");
    }

    #[test]
    fn diagnostics_collect_works_without_a_log_or_scans() {
        let app = mock_app(FakeTransport::new());
        let got = app.invoke("diagnostics_collect", json!({})).unwrap();
        let text = got["text"].as_str().unwrap();
        assert!(text.starts_with("Daminus "));
        assert!(text.contains("## Log"));
    }

    #[test]
    fn reveal_ssh_dir_without_a_ssh_folder_is_an_io_error_and_creates_nothing() {
        let app = mock_app(FakeTransport::new());
        let err = app.invoke("reveal_ssh_dir", json!({})).unwrap_err();
        assert_eq!(err["code"]["kind"], json!("io"));
        assert_eq!(err["code"]["path"], json!("~/.ssh"));
        assert!(!app._dir.path().join(".ssh").exists());
    }

    fn draft(check: &str) -> serde_json::Value {
        json!({
            "host": "vps-a", "check": check, "target": "/srv/shop/uploads/index.php",
            "reason": "intended", "covers": "as_it_is", "review_days": 30, "note": "",
        })
    }

    #[test]
    fn rules_add_refuses_a_result_the_latest_report_does_not_have() {
        let app = mock_app(FakeTransport::new());
        let err = app
            .invoke("rules_add", json!({ "draft": draft("sec.upload_php") }))
            .unwrap_err();
        assert_eq!(err["code"]["kind"], json!("schema_invalid"));
        assert_eq!(err["params"]["detail"], json!("rule_no_result"));
        assert_eq!(app.invoke("rules_list", json!({})).unwrap(), json!([]));
    }

    #[test]
    fn rules_remove_says_false_for_a_rule_that_is_not_there() {
        let app = mock_app(FakeTransport::new());
        let got = app.invoke("rules_remove", json!({ "id": "r1-0" })).unwrap();
        assert_eq!(got, json!(false));
    }
}
