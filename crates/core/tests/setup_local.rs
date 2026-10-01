//! The setup flow with the real scripts: `SetupService` runs the login test
//! and discover through a transport that feeds the bundle to a local `sh -s`
//! (as the SSH transport feeds it to the server's), over a temp folder that
//! looks like a server: an nginx config, a project folder with a `.env` full of
//! canary secrets, and the harness `docker` shim whose `inspect` would print
//! canary environments if discover ever asked for one.
//!
//! Nothing that was seen, said or saved may hold a canary: not one event, not
//! the result, not the suggested projects, not `projects.json`. The container
//! harness (`scripts/check-harness/run.sh`) and the fake-server run
//! (`scripts/fake-server/e2e.sh`) prove the same on real Linux userlands and
//! through a real sshd.

#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use daminus_core::discover::SetupRecord;
use daminus_core::domain::host::HostAlias;
use daminus_core::setup::{Saved, SetupEvent, SetupEventBody, SetupService, Step};
use daminus_core::ssh::{BoxFuture, RunEnd, RunRequest, RunSignal, SshTools, Transport};
use daminus_core::store::FsStore;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::process::Command;
use tokio::sync::mpsc;

/// Runs the bundle with the local `sh -s`, in its own process group (the
/// bundle's hang-up watcher signals its group), keeping stdin open until the
/// script is done, like the SSH transport.
struct LocalSh {
    env: Vec<(String, String)>,
}

impl Transport for LocalSh {
    fn run<'a>(
        &'a self,
        req: &'a RunRequest,
        out: mpsc::Sender<RunSignal>,
    ) -> BoxFuture<'a, RunEnd> {
        Box::pin(async move {
            let mut cmd = Command::new("sh");
            cmd.arg("-s")
                .envs(self.env.iter().map(|(k, v)| (k, v)))
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .kill_on_drop(true)
                .process_group(0);
            let mut child = cmd.spawn().expect("sh");
            let mut stdin = child.stdin.take().expect("stdin");
            let mut stdout = child.stdout.take().expect("stdout");
            let script = req.script.clone();
            let writer = tokio::spawn(async move {
                let _ = stdin.write_all(script.as_bytes()).await;
                let _ = stdin.flush().await;
                std::future::pending::<()>().await;
                drop(stdin);
            });
            let mut buf = vec![0u8; 16 * 1024];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if out
                            .send(RunSignal::Stdout(buf[..n].to_vec()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
            let status = child.wait().await.ok();
            writer.abort();
            RunEnd {
                exit: status.and_then(|s| s.code()),
                failure: None,
            }
        })
    }

    fn kill_all(&self) {}
}

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn alias(s: &str) -> HostAlias {
    HostAlias::parse(s).unwrap()
}

/// Every event until the run ends.
async fn drain(rx: &mut mpsc::Receiver<SetupEvent>) -> Vec<SetupEvent> {
    let mut out = Vec::new();
    while let Some(e) = rx.recv().await {
        let last = matches!(
            e.body,
            SetupEventBody::Done | SetupEventBody::Cancelled | SetupEventBody::Failed { .. }
        );
        out.push(e);
        if last {
            break;
        }
    }
    out
}

/// Whether `find` here is GNU find (the `.env` search needs `-printf`).
fn gnu_find() -> bool {
    std::process::Command::new("find")
        .args([
            "/",
            "-maxdepth",
            "0",
            "-perm",
            "/111",
            "-lname",
            "x",
            "-printf",
            "",
        ])
        .output()
        .is_ok_and(|o| o.status.success())
}

#[tokio::test]
async fn setup_never_lets_a_server_secret_out() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let project = root.join("srv/shop");
    std::fs::create_dir_all(project.join("public")).unwrap();
    std::fs::write(project.join("public/index.php"), "<?php echo 1;").unwrap();
    std::fs::write(
        project.join(".env"),
        "APP_KEY=CANARY_app_key_1a1a\nDB_PASSWORD=CANARY_db_password_2b2b\nDB_USERNAME=CANARY_user_3c3c\n",
    )
    .unwrap();
    std::fs::write(project.join(".env.production"), "TOKEN=CANARY_token_4d4d\n").unwrap();
    std::fs::write(project.join(".env.example"), "TOKEN=CANARY_example_5e5e\n").unwrap();

    let nginx = root.join("nginx");
    std::fs::create_dir_all(nginx.join("sites-enabled")).unwrap();
    std::fs::write(
        nginx.join("nginx.conf"),
        format!("http {{ include {}/sites-enabled/*; }}\n", nginx.display()),
    )
    .unwrap();
    std::fs::write(
        nginx.join("sites-enabled/shop"),
        format!(
            "server {{ listen 443 ssl; server_name shop-x.test www.shop-x.test; root {}/public; \
             location ~ \\.php$ {{ fastcgi_pass unix:/run/php.sock; }} }}\n",
            project.display()
        ),
    )
    .unwrap();

    let home = root.join("home");
    std::fs::create_dir_all(home.join(".ssh")).unwrap();
    let ssh_config = root.join("ssh_config");
    std::fs::write(
        &ssh_config,
        "Host vps-a\n    HostName 127.0.0.1\n    Port 1\n    User deploy\n",
    )
    .unwrap();

    let shims = repo().join("scripts/check-harness/bin");
    let path = format!(
        "{}:{}",
        shims.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let transport = LocalSh {
        env: vec![
            ("PATH".into(), path),
            ("HOME".into(), home.display().to_string()),
            (
                "HARNESS_OUT".into(),
                repo()
                    .join("scripts/check-harness/out")
                    .display()
                    .to_string(),
            ),
            (
                "DAMINUS_NGINX_CONF".into(),
                nginx.join("nginx.conf").display().to_string(),
            ),
            // The process environment of a server holds secrets too.
            (
                "CANARY_PROCESS_ENV".into(),
                "CANARY_process_env_6f6f".into(),
            ),
            ("DB_PASSWORD".into(), "CANARY_process_db_7a7a".into()),
        ],
    };
    let tools = SshTools::new()
        .with_config(&ssh_config)
        .with_env([("HOME", home.as_os_str())]);
    let store = FsStore::new(root.join("config"));
    let (tx, mut rx) = mpsc::channel(4096);
    let service = SetupService::new(Arc::new(transport), tools, store.clone(), tx);

    let host = alias("vps-a");
    let folder = project.display().to_string();
    service
        .start(Step::Test, std::slice::from_ref(&host), &[folder])
        .unwrap();
    let mut events = drain(&mut rx).await;
    service
        .start(Step::Discover, std::slice::from_ref(&host), &[])
        .unwrap();
    events.extend(drain(&mut rx).await);
    assert!(
        events
            .iter()
            .filter(|e| matches!(e.body, SetupEventBody::Done))
            .count()
            == 2,
        "both runs finish: {events:?}"
    );

    let result = service.result();
    let proposal = result.proposal.clone().expect("a proposal");
    // The site from the nginx config, and the compose project the docker shim lists.
    let ids: Vec<&str> = proposal.projects.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["shop-x", "shop"], "{proposal:#?}");
    let suggested = &proposal.projects[0];
    assert_eq!(suggested.urls, ["https://shop-x.test"]);
    let (shop, _) = suggested.to_project(Some("shop"));
    let saved = service
        .save(vec![shop], std::slice::from_ref(&host))
        .unwrap();
    assert!(
        matches!(saved, Saved::Saved { projects: 1, .. }),
        "{saved:?}"
    );

    // With GNU find (Linux) the `.env` search ran: the two real files are
    // listed by path and the example file is not.
    let found = result.hosts[0].discovery.as_ref().unwrap();
    if gnu_find() {
        let mut envs: Vec<String> = found.envs.iter().map(|e| e.path.clone()).collect();
        envs.sort();
        assert_eq!(
            envs,
            [
                format!("{}/.env", project.display()),
                format!("{}/.env.production", project.display())
            ]
        );
    }

    // Nothing carries a canary: events, the result and the suggestions as the
    // UI would receive them, and the file on disk.
    let mut everything = serde_json::to_string(&events).unwrap();
    everything.push_str(&serde_json::to_string(&result).unwrap());
    everything.push_str(&std::fs::read_to_string(root.join("config/projects.json")).unwrap());
    assert!(
        !everything.contains("CANARY"),
        "a canary got out:\n{everything}"
    );
    // The records name the files and nothing else about them.
    assert!(events.iter().all(|e| match &e.body {
        SetupEventBody::Item {
            item: SetupRecord::Env(env),
            ..
        } => env.path.starts_with('/') && !env.path.contains('='),
        _ => true,
    }));
    // The app never wrote a known-hosts file.
    assert!(!home.join(".ssh/known_hosts").exists());
}
