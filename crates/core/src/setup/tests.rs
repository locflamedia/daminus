//! The setup flow on a scripted transport. `ssh -G`, `ssh-keyscan` and
//! `ssh-keygen` are the real programs on a temp config (nothing connects:
//! the test hosts point at a closed local port), so the host list and the
//! host key lookups run for real; the login and discover output is scripted.

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tempfile::TempDir;
use tokio::sync::mpsc;

use super::*;
use crate::discover::{DockerAccess, PathState};
use crate::domain::project::{Component, HostSettings};
use crate::ssh::Failure;
use crate::ssh::fake::{FakeHost, FakeTransport};
use crate::ssh::hostkey::HostKeyState;

const BEGIN: &str = "{\"_\":\"begin\",\"v\":1,\"bundle\":\"{bundle}\"}\n";
const END: &str = "{\"_\":\"step\",\"group\":\"x\",\"ms\":3}\n{\"_\":\"end\"}\n";

fn alias(s: &str) -> HostAlias {
    HostAlias::parse(s).unwrap()
}

fn lines(items: &[serde_json::Value]) -> String {
    let mut out = String::from(BEGIN);
    for i in items {
        out.push_str(&i.to_string());
        out.push('\n');
    }
    out.push_str(END);
    out
}

fn login_output() -> String {
    lines(&[
        json!({"rec": "login", "os": "Linux", "kernel": "6.8.0", "arch": "x86_64",
               "distro": "Ubuntu 24.04", "user": "deploy", "uid": 1000, "root": false,
               "docker_group": false, "adm_group": true, "journal_group": false,
               "docker": "no_permission", "gnu_find": true}),
        json!({"rec": "path", "path": "/srv/shop", "state": "readable"}),
        json!({"rec": "path", "path": "/root", "state": "denied"}),
    ])
}

/// What a web server with a shop and its API in compose looks like.
fn web_output() -> String {
    lines(&[
        json!({"rec": "vhost", "file": "/etc/nginx/sites-enabled/shop",
               "names": ["shop-x.com", "www.shop-x.com"], "root": "/srv/shop/public",
               "ssl": true, "php": true, "listen": [80, 443]}),
        json!({"rec": "compose", "project": "shopapi", "dir": "/srv/shop", "services": ["api"],
               "running": 1, "total": 1, "ports": [8081]}),
        json!({"rec": "db", "engine": "mysql", "origin": "process", "name": "mysqld"}),
        json!({"rec": "env", "path": "/srv/shop/.env", "readable": true}),
        json!({"rec": "port", "port": 8081, "bind": "loopback"}),
    ])
}

/// A second server with a different site on it.
fn blog_output() -> String {
    lines(&[
        json!({"rec": "vhost", "file": "/etc/nginx/sites-enabled/blog",
                   "names": ["blog.example.org"], "root": "/srv/blog", "ssl": false,
                   "php": false, "listen": [80]}),
    ])
}

struct Rig {
    dir: TempDir,
    store: FsStore,
    service: SetupService,
    rx: mpsc::Receiver<SetupEvent>,
    transport: Arc<FakeTransport>,
}

fn write_config(dir: &TempDir, hosts: &[&str]) -> std::path::PathBuf {
    let mut text = String::new();
    for h in hosts {
        // Port 1 is closed: ssh-keyscan is refused at once, nothing is reached.
        text.push_str(&format!(
            "Host {h}\n    HostName 127.0.0.1\n    Port 1\n    User deploy\n"
        ));
    }
    let path = dir.path().join("ssh_config");
    std::fs::write(&path, text).unwrap();
    path
}

fn rig(transport: FakeTransport, hosts: &[&str]) -> Rig {
    rig_with(transport, hosts, SetupOptions::default())
}

fn rig_with(transport: FakeTransport, hosts: &[&str], options: SetupOptions) -> Rig {
    rig_built(transport, hosts, options, None)
}

/// `keyscan_body`: a shell body to run in place of `ssh-keyscan`.
fn rig_built(
    transport: FakeTransport,
    hosts: &[&str],
    options: SetupOptions,
    keyscan_body: Option<&str>,
) -> Rig {
    let dir = TempDir::new().unwrap();
    let cfg = write_config(&dir, hosts);
    let home = dir.path().join("home");
    std::fs::create_dir_all(home.join(".ssh")).unwrap();
    let mut tools = SshTools::new()
        .with_config(cfg)
        .with_env([("HOME", home.as_os_str())]);
    if let Some(body) = keyscan_body {
        use std::os::unix::fs::PermissionsExt as _;
        let scan = dir.path().join("fake-keyscan");
        std::fs::write(&scan, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&scan, std::fs::Permissions::from_mode(0o755)).unwrap();
        tools = tools.with_programs("ssh", "ssh-keygen", scan);
    }
    let store = FsStore::new(dir.path().join("config"));
    let (tx, rx) = mpsc::channel(4096);
    let transport = Arc::new(transport);
    let service = SetupService::with_options(transport.clone(), tools, store.clone(), tx, options);
    Rig {
        dir,
        store,
        service,
        rx,
        transport,
    }
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

fn kinds(events: &[SetupEvent], host: &str) -> Vec<&'static str> {
    events
        .iter()
        .filter_map(|e| match &e.body {
            SetupEventBody::HostStarted { host: h } if h.as_str() == host => Some("started"),
            SetupEventBody::AgentWait { host: h } if h.as_str() == host => Some("agent_wait"),
            SetupEventBody::HostRunning { host: h } if h.as_str() == host => Some("running"),
            SetupEventBody::Item { host: h, .. } if h.as_str() == host => Some("item"),
            SetupEventBody::HostKey { host: h, .. } if h.as_str() == host => Some("host_key"),
            SetupEventBody::HostFinished { host: h, .. } if h.as_str() == host => Some("finished"),
            _ => None,
        })
        .collect()
}

fn finished(events: &[SetupEvent], host: &str) -> HostOutcome {
    events
        .iter()
        .find_map(|e| match &e.body {
            SetupEventBody::HostFinished {
                host: h, outcome, ..
            } if h.as_str() == host => Some(outcome.clone()),
            _ => None,
        })
        .unwrap_or_else(|| panic!("no HostFinished for {host}"))
}

#[tokio::test]
async fn the_login_test_reports_who_the_user_is_and_what_it_may_do() {
    let mut r = rig(
        FakeTransport::new().host("vps-a", FakeHost::output(login_output())),
        &["vps-a"],
    );
    let started = r
        .service
        .start(
            Step::Test,
            &[alias("vps-a")],
            &["/srv/shop".into(), "/root".into()],
        )
        .unwrap();
    assert!(!started.joined);
    let events = drain(&mut r.rx).await;
    assert_eq!(
        kinds(&events, "vps-a"),
        ["started", "running", "item", "item", "item", "finished"]
    );
    assert_eq!(finished(&events, "vps-a"), HostOutcome::Reached);
    assert!(matches!(events.last().unwrap().body, SetupEventBody::Done));
    // seq rises by one from 0, and every event carries the run's id.
    for (i, e) in events.iter().enumerate() {
        assert_eq!(e.seq, u32::try_from(i).unwrap());
        assert_eq!(e.setup_id, started.setup_id);
    }

    let result = r.service.result();
    let host = &result.hosts[0];
    assert_eq!(host.outcome, Some(HostOutcome::Reached));
    let login = host.login.as_ref().unwrap();
    let report = login.login.as_ref().unwrap();
    assert_eq!(report.user, "deploy");
    assert!(report.adm_group && !report.docker_group);
    assert_eq!(report.docker, DockerAccess::NoPermission);
    assert_eq!(login.paths.len(), 2);
    assert_eq!(login.paths[1].state, PathState::Denied);
    // `ssh -G` was asked for the connection details.
    let resolved = host.resolved.as_ref().unwrap();
    assert_eq!(resolved.hostname, "127.0.0.1");
    assert_eq!(resolved.port, 1);
    assert!(result.proposal.is_none(), "a test finds no projects");
    // The script that was sent is the login script, with the folders and
    // the hang-up watcher (a transport keeps stdin open).
    let sent = r.transport.scripts();
    assert!(sent[0].contains("c_login() ("));
    assert!(sent[0].contains("DAMINUS_PATHS='/srv/shop\n/root'"));
    assert!(sent[0].contains("DAMINUS_HANGUP='1'"));
    assert!(r.service.status().is_none());
}

#[tokio::test]
async fn discover_streams_what_it_finds_and_suggests_projects() {
    let mut r = rig(
        FakeTransport::new().host("vps-a", FakeHost::output(web_output())),
        &["vps-a"],
    );
    r.service
        .start(Step::Discover, &[alias("vps-a")], &[])
        .unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(
        kinds(&events, "vps-a"),
        [
            "started", "running", "item", "item", "item", "item", "item", "finished"
        ]
    );
    let result = r.service.result();
    let found = result.hosts[0].discovery.as_ref().unwrap();
    assert_eq!(found.vhosts.len(), 1);
    assert_eq!(found.envs[0].path, "/srv/shop/.env");

    let proposal = result.proposal.unwrap();
    assert_eq!(proposal.projects.len(), 1);
    let p = &proposal.projects[0];
    assert_eq!(p.id, "shop-x");
    assert_eq!(p.urls, ["https://shop-x.com"]);
    // The path and the compose project (linked through the folder), and a
    // database component waiting for its name.
    assert_eq!(p.components.len(), 3);
    assert!(proposal.unassigned.is_empty());
    assert!(r.transport.scripts()[0].contains("c_discover() ("));
}

#[tokio::test]
async fn an_agent_waiting_for_approval_is_shown_before_the_host_answers() {
    let mut r = rig(
        FakeTransport::new().host(
            "vps-a",
            FakeHost::AgentThen {
                wait: Duration::from_millis(50),
                text: login_output(),
            },
        ),
        &["vps-a"],
    );
    r.service.start(Step::Test, &[alias("vps-a")], &[]).unwrap();
    let events = drain(&mut r.rx).await;
    let k = kinds(&events, "vps-a");
    assert_eq!(&k[..3], ["started", "agent_wait", "running"]);
    assert_eq!(finished(&events, "vps-a"), HostOutcome::Reached);
}

#[tokio::test]
async fn the_status_follows_the_events() {
    let mut r = rig(
        FakeTransport::new()
            .host("vps-a", FakeHost::AgentHang)
            .host("vps-b", FakeHost::output(login_output())),
        &["vps-a", "vps-b"],
    );
    r.service
        .start(Step::Test, &[alias("vps-a"), alias("vps-b")], &[])
        .unwrap();
    // Wait until vps-b is done and vps-a waits on its agent.
    let mut seen_finish = false;
    let mut seen_wait = false;
    while !(seen_finish && seen_wait) {
        let e = r.rx.recv().await.unwrap();
        match e.body {
            SetupEventBody::HostFinished { .. } => seen_finish = true,
            SetupEventBody::AgentWait { .. } => seen_wait = true,
            _ => {}
        }
    }
    let run = r.service.status().unwrap();
    assert_eq!(run.step, Step::Test);
    assert_eq!(
        run.hosts[&alias("vps-a")].state,
        crate::scan::HostState::AgentWait
    );
    assert!(matches!(
        run.hosts[&alias("vps-b")].state,
        crate::scan::HostState::Finished {
            outcome: HostOutcome::Reached
        }
    ));
    assert_eq!(run.hosts[&alias("vps-b")].items, 3);
    // A second start joins this run.
    let again = r
        .service
        .start(Step::Discover, &[alias("vps-b")], &[])
        .unwrap();
    assert!(again.joined);
    assert_eq!(again.setup_id, run.setup_id);
    // Stop it: the host that never answered ends the run as cancelled.
    assert!(r.service.cancel());
    let events = drain(&mut r.rx).await;
    assert!(matches!(
        events.last().unwrap().body,
        SetupEventBody::Cancelled
    ));
    assert!(r.service.status().is_none());
    assert!(!r.service.cancel());
    // What vps-b reported stays.
    assert!(r.service.result().hosts[1].login.is_some());
}

#[tokio::test]
async fn a_wrong_key_is_an_auth_failure_and_a_closed_port_unreachable() {
    let mut r = rig(
        FakeTransport::new()
            .host("vps-a", FakeHost::fail(Failure::Auth))
            .host(
                "vps-b",
                FakeHost::fail(Failure::Unreachable(
                    crate::domain::snapshot::NetCause::Refused,
                )),
            ),
        &["vps-a", "vps-b"],
    );
    r.service
        .start(Step::Test, &[alias("vps-a"), alias("vps-b")], &[])
        .unwrap();
    let events = drain(&mut r.rx).await;
    let a = finished(&events, "vps-a");
    assert_eq!(a, HostOutcome::AuthFailed);
    assert_eq!(
        crate::ssh::outcome_error(&a),
        Some(ErrorCode::SshAuth),
        "a key the server refuses reads as SshAuth"
    );
    assert!(matches!(
        finished(&events, "vps-b"),
        HostOutcome::Unreachable { .. }
    ));
    // The run itself finished: failures are per host.
    assert!(matches!(events.last().unwrap().body, SetupEventBody::Done));
    let result = r.service.result();
    assert!(result.hosts.iter().all(|h| h.login.is_none()));
    assert_eq!(result.hosts[0].outcome, Some(HostOutcome::AuthFailed));
}

#[tokio::test]
async fn an_unknown_host_key_shows_its_fingerprint_and_does_not_stick() {
    let mut r = rig(
        FakeTransport::new().host(
            "vps-a",
            FakeHost::fail(Failure::HostKeyUnknown {
                fp: Some("ED25519 SHA256:abc".into()),
            }),
        ),
        &["vps-a"],
    );
    r.service.start(Step::Test, &[alias("vps-a")], &[]).unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(kinds(&events, "vps-a"), ["started", "host_key", "finished"]);
    assert_eq!(
        finished(&events, "vps-a"),
        HostOutcome::HostKeyUnknown {
            fp: "ED25519 SHA256:abc".into()
        }
    );
    assert!(matches!(events.last().unwrap().body, SetupEventBody::Done));
    let host = &r.service.result().hosts[0];
    let key = host.host_key.as_ref().unwrap();
    assert_eq!(key.state, HostKeyState::Unknown);
    assert_eq!(key.offered.as_deref(), Some("ED25519 SHA256:abc"));
    assert!(key.known.is_empty());
    // Nothing was written anywhere near the user's known-hosts.
    assert!(!r.dir.path().join("home/.ssh/known_hosts").exists());

    // Retry after the user accepted it in Terminal: a new run starts at once.
    assert!(r.service.start(Step::Test, &[alias("vps-a")], &[]).is_ok());
}

#[tokio::test]
async fn a_cancel_does_not_wait_for_the_host_key_lookup() {
    // `ssh-keyscan` hangs for a minute; the lookup alone may take 12 s.
    let mut r = rig_built(
        FakeTransport::new().host(
            "vps-a",
            FakeHost::fail(Failure::HostKeyUnknown { fp: None }),
        ),
        &["vps-a"],
        SetupOptions::default(),
        Some("sleep 60"),
    );
    r.service.start(Step::Test, &[alias("vps-a")], &[]).unwrap();
    // Let the run reach the lookup: the host answered at once.
    tokio::time::sleep(Duration::from_millis(1500)).await;
    let t = std::time::Instant::now();
    assert!(r.service.cancel());
    let events = tokio::time::timeout(Duration::from_secs(5), drain(&mut r.rx))
        .await
        .expect("the cancel waited for the lookup");
    assert!(t.elapsed() < Duration::from_secs(5));
    assert!(matches!(
        events.last().unwrap().body,
        SetupEventBody::Cancelled
    ));
    assert!(r.service.status().is_none());
}

#[tokio::test]
async fn a_host_task_that_dies_ends_the_run_as_failed_and_keeps_the_others() {
    let mut r = rig(
        FakeTransport::new()
            .host("vps-a", FakeHost::output(web_output()))
            .host("vps-b", FakeHost::Reply(|_| panic!("broken host task"))),
        &["vps-a", "vps-b"],
    );
    r.service
        .start(Step::Discover, &[alias("vps-a"), alias("vps-b")], &[])
        .unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(finished(&events, "vps-a"), HostOutcome::Reached);
    let SetupEventBody::Failed { error } = &events.last().unwrap().body else {
        panic!("the run did not fail: {:?}", events.last());
    };
    assert_eq!(error.code, ErrorCode::Internal);
    // The run is over, and what vps-a found is still suggested.
    assert!(r.service.status().is_none());
    assert!(r.service.result().proposal.is_some());
}

#[tokio::test]
async fn a_changed_host_key_is_reported_as_changed() {
    let mut r = rig(
        FakeTransport::new().host(
            "vps-a",
            FakeHost::fail(Failure::HostKeyChanged { fp: None }),
        ),
        &["vps-a"],
    );
    r.service.start(Step::Test, &[alias("vps-a")], &[]).unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(
        finished(&events, "vps-a"),
        HostOutcome::HostKeyChanged { fp: String::new() }
    );
    let key = r.service.result().hosts[0].host_key.clone().unwrap();
    assert_eq!(key.state, HostKeyState::Changed);
    assert_eq!(key.offered, None);
}

#[tokio::test]
async fn a_host_that_never_answers_times_out_with_the_budget() {
    let mut r = rig_with(
        FakeTransport::new().host("vps-a", FakeHost::AgentHang),
        &["vps-a"],
        SetupOptions {
            test_budget: Duration::from_millis(300),
            discover_budget: Duration::from_millis(300),
        },
    );
    r.service.start(Step::Test, &[alias("vps-a")], &[]).unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(finished(&events, "vps-a"), HostOutcome::Timeout);
    assert!(matches!(events.last().unwrap().body, SetupEventBody::Done));
}

#[tokio::test]
async fn a_server_that_lies_costs_it_the_lines_not_the_run() {
    let text = format!(
        "{BEGIN}{}\n{}\n{}\nnot json\n{}{END}",
        json!({"rec": "env", "path": "/srv/shop/.env", "readable": true}),
        json!({"rec": "env", "path": "relative/.env", "readable": true}),
        json!({"rec": "pm2", "app": "$(reboot)", "home": "/h/.pm2", "default": true,
               "instances": 1, "status": "online"}),
        json!({"rec": "shell", "cmd": "id"}),
    );
    let mut r = rig(
        FakeTransport::new().host("vps-a", FakeHost::output(text)),
        &["vps-a"],
    );
    r.service
        .start(Step::Discover, &[alias("vps-a")], &[])
        .unwrap();
    let events = drain(&mut r.rx).await;
    let dropped = events
        .iter()
        .find_map(|e| match &e.body {
            SetupEventBody::HostFinished { dropped, items, .. } => Some((*dropped, *items)),
            _ => None,
        })
        .unwrap();
    assert_eq!(dropped, (4, 1));
    assert_eq!(finished(&events, "vps-a"), HostOutcome::Reached);
}

#[tokio::test]
async fn a_run_that_stops_before_its_end_line_is_partial_and_keeps_what_arrived() {
    let text = format!(
        "{BEGIN}{}\n",
        json!({"rec": "env", "path": "/srv/shop/.env", "readable": true})
    );
    let mut r = rig(
        FakeTransport::new().host("vps-a", FakeHost::output(text)),
        &["vps-a"],
    );
    r.service
        .start(Step::Discover, &[alias("vps-a")], &[])
        .unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(finished(&events, "vps-a"), HostOutcome::Partial);
    assert_eq!(
        r.service.result().hosts[0]
            .discovery
            .as_ref()
            .unwrap()
            .envs
            .len(),
        1
    );
}

#[tokio::test]
async fn nothing_to_do_without_hosts_and_a_new_run_starts_from_its_own_hosts() {
    let mut r = rig(
        FakeTransport::new()
            .host("vps-a", FakeHost::output(web_output()))
            .host("vps-b", FakeHost::output(blog_output())),
        &["vps-a", "vps-b"],
    );
    assert_eq!(
        r.service.start(Step::Test, &[], &[]).unwrap_err().code,
        ErrorCode::NothingToScan
    );
    r.service
        .start(
            Step::Discover,
            &[alias("vps-a"), alias("vps-b"), alias("vps-a")],
            &[],
        )
        .unwrap();
    drain(&mut r.rx).await;
    assert_eq!(r.service.result().hosts.len(), 2);
    assert_eq!(r.service.result().proposal.unwrap().projects.len(), 2);
    // Only vps-b now: vps-a's findings no longer feed the suggestions.
    r.service
        .start(Step::Discover, &[alias("vps-b")], &[])
        .unwrap();
    drain(&mut r.rx).await;
    let result = r.service.result();
    assert_eq!(result.hosts.len(), 1);
    assert_eq!(result.proposal.unwrap().projects.len(), 1);
}

#[tokio::test]
async fn test_then_discover_keeps_the_login_result_of_the_same_hosts() {
    let mut r = rig(
        FakeTransport::new().host(
            "vps-a",
            FakeHost::Reply(|script| {
                if script.contains("c_login() (") {
                    login_output()
                } else {
                    web_output()
                }
            }),
        ),
        &["vps-a"],
    );
    r.service.start(Step::Test, &[alias("vps-a")], &[]).unwrap();
    drain(&mut r.rx).await;
    r.service
        .start(Step::Discover, &[alias("vps-a")], &[])
        .unwrap();
    drain(&mut r.rx).await;
    let host = &r.service.result().hosts[0];
    assert_eq!(
        host.login.as_ref().unwrap().login.as_ref().unwrap().user,
        "deploy"
    );
    assert_eq!(host.discovery.as_ref().unwrap().vhosts.len(), 1);
    assert_eq!(host.outcome, Some(HostOutcome::Reached));
}

#[tokio::test]
async fn the_host_list_comes_from_the_ssh_config_with_reasons() {
    let r = rig(FakeTransport::new(), &["vps-a", "vps-b"]);
    let list = r.service.list_hosts().unwrap();
    assert!(list.config_found);
    let names: Vec<&str> = list.hosts.iter().map(|h| h.alias.as_str()).collect();
    assert_eq!(names, ["vps-a", "vps-b"]);
    let entries = r.service.list_resolved().await.unwrap().entries;
    assert_eq!(
        entries[0].resolved.as_ref().unwrap().user.as_deref(),
        Some("deploy")
    );
}

#[tokio::test]
async fn no_ssh_config_is_the_empty_state() {
    let dir = TempDir::new().unwrap();
    let tools = SshTools::new()
        .with_config(dir.path().join("missing"))
        .with_env([("HOME", dir.path().as_os_str())]);
    let (tx, _rx) = mpsc::channel(8);
    let service = SetupService::new(
        Arc::new(FakeTransport::new()),
        tools,
        FsStore::new(dir.path().join("config")),
        tx,
    );
    let list = service.list_hosts().unwrap();
    assert!(!list.config_found);
    assert_eq!(list.empty, Some(crate::ssh::config::EmptyReason::NoConfig));
}

#[tokio::test]
async fn the_host_key_can_be_looked_at_without_logging_in() {
    let r = rig(FakeTransport::new(), &["vps-a"]);
    let info = r.service.host_key(&alias("vps-a")).await.unwrap();
    // Nothing recorded, and the closed port offers nothing.
    assert_eq!(info.state, HostKeyState::Unknown);
    assert_eq!(info.offered, None);
    assert_eq!(r.transport.runs(), 0, "no login was attempted");
}

fn proj(id: &str, urls: &[&str], host: &str) -> Project {
    Project {
        id: id.into(),
        name: id.into(),
        color: None,
        urls: urls.iter().map(|u| (*u).to_owned()).collect(),
        components: vec![Component {
            role: crate::domain::project::Role::Fe,
            host: alias(host),
            kind: crate::domain::project::ComponentKind::Path {
                path: format!("/srv/{id}"),
            },
        }],
        overrides: Vec::new(),
    }
}

#[tokio::test]
async fn saving_writes_projects_json_and_keeps_everything_else() {
    let r = rig(FakeTransport::new(), &["vps-a", "vps-b"]);
    // A file with a project, a rule, and a host excluded in Settings › Hosts.
    let mut existing = ProjectsFile::default();
    existing
        .projects
        .push(proj("old", &["https://old.example.com"], "vps-a"));
    existing
        .hosts
        .insert(alias("vps-b"), HostSettings { include: false });
    existing.rules = serde_json::from_value(json!([{
        "id": "r-1", "host": "vps-a", "check": "sec.ports", "target": "3306",
        "fp": "3306/mysqld", "reason": "accepted_risk", "until": "2026-12-01", "note": "firewalled"
    }]))
    .unwrap();
    r.store.save_projects(&existing, None).unwrap();

    let saved = r
        .service
        .save(
            vec![
                proj(
                    "shop",
                    &["  https://shop-x.com ", "https://shop-x.com"],
                    "vps-a",
                ),
                proj("old", &["https://new.example.com"], "vps-a"),
            ],
            &[alias("vps-b"), alias("vps-a")],
        )
        .unwrap();
    // The repeated URL and the replaced project are only warnings; the URL is saved once.
    let Saved::Saved { issues, projects } = saved else {
        panic!("not saved: {saved:?}");
    };
    assert_eq!(projects, 2);
    assert_eq!(
        issues.iter().map(|i| i.code).collect::<Vec<_>>(),
        [IssueCode::UrlDuplicate, IssueCode::ReplacesExisting]
    );
    let file = r.store.load_projects().unwrap().value;
    let ids: Vec<&str> = file.projects.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["old", "shop"]);
    // `old` was replaced, `shop` is added with its URLs cleaned.
    assert_eq!(file.projects[0].urls, ["https://new.example.com"]);
    assert_eq!(file.projects[1].urls, ["https://shop-x.com"]);
    // The rule survived, vps-b stays excluded, vps-a is now listed.
    assert_eq!(file.rules.len(), 1);
    assert!(!file.hosts[&alias("vps-b")].include);
    assert!(file.hosts[&alias("vps-a")].include);
}

#[tokio::test]
async fn saving_over_a_project_says_so_and_keeps_its_color_and_overrides() {
    let r = rig(FakeTransport::new(), &["vps-a"]);
    let mut old = proj("shop", &["https://old.example.com"], "vps-a");
    old.color = Some("#336699".into());
    old.overrides = serde_json::from_value(json!([{"check": "disk.root", "warn": 70.0}])).unwrap();
    let mut existing = ProjectsFile::default();
    existing.projects.push(old);
    r.store.save_projects(&existing, None).unwrap();

    let fresh = proj("shop", &["https://shop-x.com"], "vps-a");
    let issues = r.service.validate(std::slice::from_ref(&fresh));
    assert_eq!(
        issues.iter().map(|i| (i.field, i.code)).collect::<Vec<_>>(),
        [(IssueField::Id, IssueCode::ReplacesExisting)]
    );
    let saved = r.service.save(vec![fresh], &[]).unwrap();
    assert!(matches!(saved, Saved::Saved { projects: 1, .. }));

    let file = r.store.load_projects().unwrap().value;
    let shop = &file.projects[0];
    assert_eq!(shop.urls, ["https://shop-x.com"]);
    assert_eq!(shop.color.as_deref(), Some("#336699"));
    assert_eq!(shop.overrides.len(), 1);

    // A color the new project sets wins.
    let mut recolored = proj("shop", &["https://shop-x.com"], "vps-a");
    recolored.color = Some("#aa0000".into());
    r.service.save(vec![recolored], &[]).unwrap();
    let file = r.store.load_projects().unwrap().value;
    assert_eq!(file.projects[0].color.as_deref(), Some("#aa0000"));
    assert_eq!(file.projects[0].overrides.len(), 1);
}

#[tokio::test]
async fn saving_with_an_error_writes_nothing() {
    let r = rig(FakeTransport::new(), &["vps-a"]);
    let mut bad = proj("shop", &["not a url"], "vps-a");
    bad.name = String::new();
    let saved = r.service.save(vec![bad], &[]).unwrap();
    let Saved::Rejected { issues } = saved else {
        panic!("saved: {saved:?}");
    };
    assert_eq!(issues.len(), 2);
    assert!(!r.dir.path().join("config/projects.json").exists());
}

#[tokio::test]
async fn saving_a_local_only_url_keeps_it_and_says_so() {
    let r = rig(FakeTransport::new(), &["vps-a"]);
    let saved = r
        .service
        .save(vec![proj("dev", &["http://localhost:3000"], "vps-a")], &[])
        .unwrap();
    let Saved::Saved { issues, projects } = saved else {
        panic!("not saved: {saved:?}");
    };
    assert_eq!(projects, 1);
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].level, IssueLevel::Warning);
    assert!(matches!(
        issues[0].code,
        IssueCode::UrlLocalOnly {
            warning: crate::probe::UrlWarning::Loopback
        }
    ));
    let file = r.store.load_projects().unwrap().value;
    assert_eq!(file.projects[0].urls, ["http://localhost:3000"]);
}

#[tokio::test]
async fn a_component_on_a_host_missing_from_the_config_is_a_warning() {
    let r = rig(FakeTransport::new(), &["vps-a"]);
    let issues = r.service.validate(&[proj("shop", &[], "vps-zzz")]);
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].code, IssueCode::UnknownHost);
    // Saved anyway: the config may be about to change.
    assert!(matches!(
        r.service
            .save(vec![proj("shop", &[], "vps-zzz")], &[])
            .unwrap(),
        Saved::Saved { .. }
    ));
}

#[tokio::test]
async fn a_file_from_a_newer_version_is_never_saved_over() {
    let r = rig(FakeTransport::new(), &["vps-a"]);
    std::fs::create_dir_all(r.dir.path().join("config")).unwrap();
    std::fs::write(
        r.dir.path().join("config/projects.json"),
        r#"{"version": 99, "projects": []}"#,
    )
    .unwrap();
    let err = r
        .service
        .save(vec![proj("shop", &["https://shop-x.com"], "vps-a")], &[])
        .unwrap_err();
    assert!(matches!(
        err.code,
        ErrorCode::ConfigFromNewerVersion { version: 99, .. }
    ));
}

#[tokio::test]
async fn what_discover_suggests_scans_without_any_further_edit() {
    // The proposal, saved as it is (the database component needs a name, so
    // it waits), is a project file a scan can resolve.
    let mut r = rig(
        FakeTransport::new().host("vps-a", FakeHost::output(web_output())),
        &["vps-a"],
    );
    r.service
        .start(Step::Discover, &[alias("vps-a")], &[])
        .unwrap();
    drain(&mut r.rx).await;
    let proposal = r.service.result().proposal.unwrap();
    let (project, needs_name) = proposal.projects[0].to_project(None);
    assert_eq!(needs_name, 1);
    let saved = r.service.save(vec![project], &[alias("vps-a")]).unwrap();
    assert!(matches!(saved, Saved::Saved { projects: 1, .. }));
    let file = r.store.load_projects().unwrap().value;
    let targets = crate::scan::resolve(&file, &crate::scan::ScanScope::default()).unwrap();
    assert_eq!(targets.hosts, [alias("vps-a")]);
    assert_eq!(targets.urls, ["https://shop-x.com"]);
}

#[tokio::test]
async fn removing_a_project_keeps_the_others_the_rules_and_the_hosts() {
    let r = rig(FakeTransport::new(), &["vps-a"]);
    let mut existing = ProjectsFile::default();
    existing
        .projects
        .push(proj("one", &["https://one.example"], "vps-a"));
    existing
        .projects
        .push(proj("two", &["https://two.example"], "vps-a"));
    existing
        .hosts
        .insert(alias("vps-a"), HostSettings { include: false });
    r.store.save_projects(&existing, None).unwrap();

    assert!(r.service.remove("one").unwrap());
    let file = r.store.load_projects().unwrap().value;
    let ids: Vec<&str> = file.projects.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["two"]);
    assert!(!file.hosts[&alias("vps-a")].include);
    assert!(!r.service.remove("one").unwrap(), "already gone");
}

#[tokio::test]
async fn a_removed_project_comes_back_whole_when_it_is_saved_again() {
    let r = rig(FakeTransport::new(), &["vps-a"]);
    let mut project = proj("one", &["https://one.example"], "vps-a");
    project.color = Some("#3A55D6".into());
    r.service.save(vec![project.clone()], &[]).unwrap();
    r.service.remove("one").unwrap();
    r.service.save(vec![project.clone()], &[]).unwrap();
    let file = r.store.load_projects().unwrap().value;
    assert_eq!(file.projects, vec![project]);
}

#[tokio::test]
async fn the_environment_says_the_agent_is_unavailable_without_one() {
    let dir = TempDir::new().unwrap();
    let tools = SshTools::new().with_env([
        ("HOME", dir.path().as_os_str()),
        ("SSH_AUTH_SOCK", dir.path().join("none").as_os_str()),
    ]);
    let (tx, _rx) = mpsc::channel(8);
    let service = SetupService::new(
        Arc::new(FakeTransport::new()),
        tools,
        FsStore::new(dir.path().join("config")),
        tx,
    );
    let env = service.environment().await;
    assert_ne!(env.agent, crate::setup::AgentState::Keys);
    assert_eq!(env.keys, 0);
}

#[tokio::test]
async fn suggestions_are_there_as_soon_as_the_first_host_has_finished() {
    let mut r = rig(
        FakeTransport::new()
            .host("vps-a", FakeHost::output(web_output()))
            .host(
                "vps-b",
                FakeHost::slow(&web_output(), Duration::from_secs(30)),
            ),
        &["vps-a", "vps-b"],
    );
    r.service
        .start(Step::Discover, &[alias("vps-a"), alias("vps-b")], &[])
        .unwrap();
    // Wait for vps-a to finish; vps-b is still running.
    loop {
        let event = tokio::time::timeout(Duration::from_secs(10), r.rx.recv())
            .await
            .unwrap()
            .unwrap();
        if matches!(&event.body, SetupEventBody::HostFinished { host, .. } if host.as_str() == "vps-a")
        {
            break;
        }
    }
    let proposal = r.service.result().proposal.unwrap();
    assert_eq!(proposal.projects.len(), 1);
    assert!(r.service.status().is_some(), "the run is still going");
    r.service.cancel();
}
