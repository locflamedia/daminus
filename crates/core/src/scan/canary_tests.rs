//! A scan of a host with real database components, run through the whole
//! pipeline (bundle, shell, NDJSON parser, events, snapshot, report) with
//! canary secrets in the `.env` files and the process environment. None of
//! them may appear in any event, saved file or report. The shell is a local
//! `sh -s`, with the harness' recorded `docker`, `mysql` and `psql` on PATH
//! (which refuse a login that is not the one in the `.env`).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::json;
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;

use super::*;
use crate::domain::host::{HostAlias, HostRef};
use crate::domain::manifest::CheckGroup;
use crate::domain::project::ProjectsFile;
use crate::domain::settings::Settings;
use crate::domain::snapshot::HostOutcome;
use crate::probe::fake::FakeProbe;
use crate::ssh::{BoxFuture, RunEnd, RunRequest, RunSignal, Transport};
use crate::store::FsStore;

fn harness() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../scripts/check-harness")
}

/// Runs the bundle in a local `sh -s`, as the host's shell would.
struct ShellTransport {
    home: PathBuf,
}

impl Transport for ShellTransport {
    fn run<'a>(
        &'a self,
        req: &'a RunRequest,
        out: mpsc::Sender<RunSignal>,
    ) -> BoxFuture<'a, RunEnd> {
        Box::pin(async move {
            let path = format!(
                "{}:{}",
                harness().join("bin").display(),
                std::env::var("PATH").unwrap_or_default()
            );
            let mut child = tokio::process::Command::new("sh")
                .arg("-s")
                .env("PATH", path)
                .env("HARNESS_OUT", harness().join("out"))
                .env("HOME", &self.home)
                // Secrets in the process environment, like a server's profile.
                .env("CANARY_ENV_TOKEN", "CANARY_process_env_7f3a")
                .env("DB_PASSWORD", "CANARY_process_db_password_91c2")
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true)
                .spawn()
                .expect("sh");
            let mut stdin = child.stdin.take().expect("stdin");
            stdin
                .write_all(req.script.as_bytes())
                .await
                .expect("write bundle");
            let mut stdout = child.stdout.take().expect("stdout");
            let mut buf = vec![0_u8; 8192];
            loop {
                let n = stdout.read(&mut buf).await.expect("read");
                if n == 0 {
                    break;
                }
                let _ = out.send(RunSignal::Stdout(buf[..n].to_vec())).await;
            }
            let status = child.wait().await.expect("wait");
            drop(stdin);
            RunEnd {
                exit: status.code(),
                failure: None,
            }
        })
    }

    fn kill_all(&self) {}
}

fn files_under(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            files_under(&p, out);
        } else {
            out.push(p);
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn database_logins_never_reach_events_snapshots_or_the_report() {
    let app = harness().join("home/app");
    let projects: ProjectsFile = serde_json::from_value(json!({
        "version": 1,
        "projects": [{"id": "shop", "name": "Shop", "components": [
            {"role": "db", "host": "harness", "kind": "db", "engine": "mysql",
             "database": "shop", "env_file": app.join("env.canary")},
            {"role": "db", "host": "harness", "kind": "db", "engine": "postgres",
             "database": "analytics", "env_file": app.join("env-pg.canary")},
            {"role": "db", "host": "harness", "kind": "db", "engine": "mysql",
             "database": "billing", "env_file": app.join("env-billing.canary"),
             "container": "shop-db-1"}
        ]}]
    }))
    .unwrap();
    let mut settings = Settings::default();
    // Only the database group (and the system one, which cannot be switched off).
    settings.scan.disabled_groups = [
        CheckGroup::Disk,
        CheckGroup::Containers,
        CheckGroup::Security,
        CheckGroup::Uptime,
        CheckGroup::CodeChanges,
    ]
    .into();

    let dir = TempDir::new().unwrap();
    let home = TempDir::new().unwrap();
    let store = FsStore::new(dir.path());
    store.save_projects(&projects, None).unwrap();
    store.save_settings(&settings, None).unwrap();
    let (tx, mut rx) = mpsc::channel(4096);
    let service = ScanService::new(
        Arc::new(ShellTransport {
            home: home.path().to_owned(),
        }),
        Arc::new(FakeProbe::new()),
        store.clone(),
        tx,
    );
    service.start(&ScanScope::default()).unwrap();
    let mut events = Vec::new();
    while let Some(e) = rx.recv().await {
        let last = matches!(
            e.body,
            ScanEventBody::Done { .. } | ScanEventBody::Cancelled | ScanEventBody::Failed { .. }
        );
        events.push(e);
        if last {
            break;
        }
    }
    let Some(ScanEventBody::Done { snapshot_seq }) = events.last().map(|e| &e.body) else {
        panic!("scan did not finish: {:?}", events.last());
    };

    let host = HostAlias::parse("harness").unwrap();
    let snap = store.load_snapshot(*snapshot_seq).unwrap();
    assert!(snap.covered(&HostRef::Alias(host.clone()), CheckGroup::Databases));
    let dbs: Vec<_> = snap.facts[&HostRef::Alias(host)]
        .iter()
        .filter(|f| f.check == "db.size")
        .collect();
    let mut names: Vec<_> = dbs.iter().map(|f| f.target.as_str()).collect();
    names.sort_unstable();
    assert_eq!(names, ["analytics", "billing", "shop"]);
    assert!(
        dbs.iter().all(|f| f.unknown.is_none() && f.value.is_some()),
        "a login was refused: {dbs:?}"
    );
    assert!(matches!(
        events.iter().find_map(|e| match &e.body {
            ScanEventBody::HostFinished { outcome, .. } => Some(outcome.clone()),
            _ => None,
        }),
        Some(HostOutcome::Reached)
    ));

    let mut seen = vec![
        format!("{events:?}"),
        serde_json::to_string(&events).unwrap(),
    ];
    let report = latest_report(&store, snap.finished_at).unwrap();
    seen.push(serde_json::to_string(&report).unwrap());
    seen.push(format!("{report:?}"));
    let mut files = Vec::new();
    files_under(dir.path(), &mut files);
    assert!(
        files
            .iter()
            .any(|f| f.to_string_lossy().contains("snapshots"))
    );
    for f in &files {
        seen.push(String::from_utf8_lossy(&std::fs::read(f).unwrap()).into_owned());
    }
    // The text really holds the results, so a clean search means something.
    assert!(
        seen.iter()
            .any(|t| t.contains("db.size") && t.contains("3650722202"))
    );
    for text in &seen {
        assert!(!text.contains("CANARY"), "a canary leaked");
    }
}
