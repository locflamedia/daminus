//! Orchestrator tests on `FakeTransport` + `FakeProbe`, with Tokio's paused
//! clock so budgets of 90 s run instantly.

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tempfile::TempDir;
use tokio::sync::mpsc;

use super::*;
use crate::domain::error::ErrorCode;
use crate::domain::evaluate::{Config, Delta, Disposition, evaluate};
use crate::domain::host::{HostAlias, HostRef};
use crate::domain::manifest::CheckGroup;
use crate::domain::project::ProjectsFile;
use crate::domain::settings::Settings;
use crate::domain::severity::{Severity, UnknownReason};
use crate::domain::snapshot::{HostOutcome, NetCause};
use crate::probe::ProbeError;
use crate::probe::fake::FakeProbe;
use crate::ssh::Failure;
use crate::ssh::fake::{FakeHost, FakeTransport, HASH, fixture_run};
use crate::store::FsStore;

const BEGIN: &str = "{\"_\":\"begin\",\"v\":1,\"bundle\":\"{bundle}\"}\n";
const END: &str = "{\"_\":\"end\"}\n";

fn projects(hosts: &[&str], urls: &[&str]) -> ProjectsFile {
    let components: Vec<_> = hosts
        .iter()
        .map(|h| json!({"role": "be", "host": h, "kind": "path", "path": format!("/srv/{h}")}))
        .collect();
    serde_json::from_value(json!({
        "version": 1,
        "projects": [{"id": "shop", "name": "Shop", "urls": urls, "components": components}]
    }))
    .unwrap()
}

struct Rig {
    _dir: TempDir,
    store: FsStore,
    service: ScanService,
    rx: mpsc::Receiver<ScanEvent>,
    transport: Arc<FakeTransport>,
}

fn rig_with(
    transport: FakeTransport,
    probe: FakeProbe,
    projects: ProjectsFile,
    settings: Settings,
) -> Rig {
    rig_cap(transport, probe, projects, settings, 4096)
}

fn rig_cap(
    transport: FakeTransport,
    probe: FakeProbe,
    projects: ProjectsFile,
    settings: Settings,
    capacity: usize,
) -> Rig {
    rig_opts(
        transport,
        probe,
        projects,
        settings,
        capacity,
        ServiceOptions::default(),
    )
}

fn rig_opts(
    transport: FakeTransport,
    probe: FakeProbe,
    projects: ProjectsFile,
    settings: Settings,
    capacity: usize,
    options: ServiceOptions,
) -> Rig {
    let dir = TempDir::new().unwrap();
    let store = FsStore::new(dir.path());
    store.save_projects(&projects, None).unwrap();
    store.save_settings(&settings, None).unwrap();
    let (tx, rx) = mpsc::channel(capacity);
    let transport = Arc::new(transport);
    let service = ScanService::with_options(
        transport.clone(),
        Arc::new(probe),
        store.clone(),
        tx,
        options,
    );
    Rig {
        _dir: dir,
        store,
        service,
        rx,
        transport,
    }
}

fn rig(transport: FakeTransport, probe: FakeProbe, projects: ProjectsFile) -> Rig {
    rig_with(transport, probe, projects, Settings::default())
}

/// Every event until the scan ends.
async fn drain(rx: &mut mpsc::Receiver<ScanEvent>) -> Vec<ScanEvent> {
    let mut out = Vec::new();
    while let Some(e) = rx.recv().await {
        let last = matches!(
            e.body,
            ScanEventBody::Done { .. } | ScanEventBody::Cancelled | ScanEventBody::Failed { .. }
        );
        out.push(e);
        if last {
            break;
        }
    }
    out
}

fn finished(events: &[ScanEvent], host: &str) -> HostOutcome {
    let h = HostRef::parse(host).unwrap();
    events
        .iter()
        .find_map(|e| match &e.body {
            ScanEventBody::HostFinished { host, outcome, .. } if *host == h => {
                Some(outcome.clone())
            }
            _ => None,
        })
        .unwrap_or_else(|| panic!("no HostFinished for {host}"))
}

fn alias(s: &str) -> HostRef {
    HostRef::Alias(HostAlias::parse(s).unwrap())
}

fn healthy() -> FakeHost {
    FakeHost::from_fixtures("ubuntu-24.04").unwrap()
}

/// A run with one crit `disk.fs` and a finished system group.
fn run_text(disk_pct: u32, with_disk_step: bool, with_end: bool) -> String {
    let mut s = String::from(BEGIN);
    s.push_str("{\"check\":\"sys.load\",\"value\":0.2,\"unit\":\"load\",\"data\":{\"cores\":2}}\n");
    s.push_str("{\"_\":\"step\",\"group\":\"system\",\"ms\":3}\n");
    if with_disk_step {
        s.push_str(&format!(
            "{{\"check\":\"disk.fs\",\"target\":\"/\",\"data\":{{\"pct\":{disk_pct},\"ipct\":1,\"size\":1,\"used\":1,\"avail\":1,\"fs\":\"ext4\"}}}}\n"
        ));
        s.push_str("{\"_\":\"step\",\"group\":\"disk\",\"ms\":7}\n");
    }
    if with_end {
        s.push_str(END);
    }
    s
}

#[tokio::test(start_paused = true)]
async fn healthy_scan_saves_snapshot_with_coverage_timing_and_ordered_events() {
    let mut r = rig(
        FakeTransport::new()
            .host("vps-a", healthy())
            .host("vps-b", FakeHost::from_fixtures("debian-12").unwrap()),
        FakeProbe::new().status("https://shop.example", 200, 120.0),
        projects(&["vps-a", "vps-b"], &["https://shop.example"]),
    );
    let started = r.service.start(&ScanScope::default()).unwrap();
    assert!(!started.joined);
    let events = drain(&mut r.rx).await;

    for (i, e) in events.iter().enumerate() {
        assert_eq!(e.seq, u32::try_from(i).unwrap(), "seq rises by one");
        assert_eq!(e.scan_id, started.scan_id);
    }
    let Some(ScanEventBody::Done { snapshot_seq }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    assert_eq!(finished(&events, "vps-a"), HostOutcome::Reached);
    assert_eq!(finished(&events, "@local"), HostOutcome::Reached);
    assert!(events.iter().any(|e| matches!(
        &e.body,
        ScanEventBody::Step { host, group: CheckGroup::Disk, .. } if *host == alias("vps-b")
    )));

    let snap = r.store.load_snapshot(*snapshot_seq).unwrap();
    assert_eq!(snap.hosts.len(), 3);
    let hash = crate::ssh::fake::bundle_hash(&r.transport.scripts()[0])
        .unwrap()
        .to_owned();
    assert_eq!(snap.bundle_hash, hash);
    assert!(snap.covered(&alias("vps-a"), CheckGroup::System));
    assert!(snap.covered(&alias("vps-a"), CheckGroup::Disk));
    assert!(snap.covered(&HostRef::Local, CheckGroup::Uptime));
    assert!(
        snap.timing[&alias("vps-a")]
            .steps
            .contains_key(&CheckGroup::Disk)
    );
    assert_eq!(snap.facts[&HostRef::Local][0].check, "url.http");
    assert!(r.service.status().is_none(), "status clears when done");
}

#[tokio::test(start_paused = true)]
async fn slow_host_does_not_hold_back_a_fast_one() {
    // Every fixture line 1 s apart (about a minute in all): slow, yet inside
    // the 90 s budget.
    let slow = FakeHost::slow(
        &fixture_run("ubuntu-24.04").unwrap(),
        Duration::from_secs(1),
    );
    let mut r = rig(
        FakeTransport::new()
            .host("slow", slow)
            .host("fast", healthy()),
        FakeProbe::new(),
        projects(&["slow", "fast"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let pos = |h: &str| {
        events
            .iter()
            .position(|e| matches!(&e.body, ScanEventBody::HostFinished { host, .. } if *host == alias(h)))
            .unwrap()
    };
    assert!(pos("fast") < pos("slow"));
    assert_eq!(finished(&events, "slow"), HostOutcome::Reached);
}

#[tokio::test(start_paused = true)]
async fn failing_hosts_get_their_outcome_and_others_still_save() {
    let mut r = rig(
        FakeTransport::new()
            .host("ok", healthy())
            .host("badkey", FakeHost::fail(Failure::Auth))
            .host(
                "newhost",
                FakeHost::fail(Failure::HostKeyUnknown {
                    fp: Some("ED25519 SHA256:abc".into()),
                }),
            )
            .host(
                "down",
                FakeHost::fail(Failure::Unreachable(NetCause::Refused)),
            ),
        FakeProbe::new(),
        projects(&["ok", "badkey", "newhost", "down"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(finished(&events, "badkey"), HostOutcome::AuthFailed);
    assert_eq!(
        finished(&events, "newhost"),
        HostOutcome::HostKeyUnknown {
            fp: "ED25519 SHA256:abc".into()
        }
    );
    assert_eq!(
        finished(&events, "down"),
        HostOutcome::Unreachable {
            cause: NetCause::Refused
        }
    );
    assert!(matches!(
        events.last().unwrap().body,
        ScanEventBody::Done { .. }
    ));
    let snap = r.store.load_history(None).unwrap().remove(0);
    assert!(!snap.facts.contains_key(&alias("badkey")));
    assert!(!snap.coverage.contains_key(&alias("down")));
}

#[tokio::test(start_paused = true)]
async fn timeout_midway_keeps_received_lines_as_timeout() {
    let text = run_text(50, true, true);
    let mut r = rig(
        FakeTransport::new().host("stuck", FakeHost::slow(&text, Duration::from_secs(40))),
        FakeProbe::new(),
        projects(&["stuck"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(finished(&events, "stuck"), HostOutcome::Timeout);
    let snap = r.store.load_history(None).unwrap().remove(0);
    let facts = &snap.facts[&alias("stuck")];
    assert!(
        facts.iter().any(|f| f.check == "sys.load"),
        "lines before the budget are kept"
    );
    assert!(
        !snap.covered(&alias("stuck"), CheckGroup::System),
        "timeout never counts as covered"
    );
    let ms = snap.timing[&alias("stuck")].ms;
    // First line after 40 s, then the 90 s budget.
    assert!(
        (130_000..135_000).contains(&ms),
        "budget from first output: {ms}"
    );
}

#[tokio::test(start_paused = true)]
async fn remote_timeout_exit_is_timeout() {
    let host = FakeHost::Output {
        chunks: vec![(Duration::ZERO, run_text(10, false, false))],
        exit: 124,
    };
    let mut r = rig(
        FakeTransport::new().host("vps", host),
        FakeProbe::new(),
        projects(&["vps"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    assert_eq!(
        finished(&drain(&mut r.rx).await, "vps"),
        HostOutcome::Timeout
    );
}

#[tokio::test(start_paused = true)]
async fn cancel_saves_nothing_and_frees_the_service() {
    let slow = FakeHost::slow(
        &fixture_run("ubuntu-24.04").unwrap(),
        Duration::from_secs(20),
    );
    let mut r = rig(
        FakeTransport::new().host("vps", slow),
        FakeProbe::new().slow("https://shop.example", Duration::from_secs(60)),
        projects(&["vps"], &["https://shop.example"]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    // Wait until the host is running, then cancel.
    loop {
        let e = r.rx.recv().await.unwrap();
        if matches!(e.body, ScanEventBody::Fact { .. }) {
            break;
        }
    }
    assert!(r.service.status().is_some());
    assert!(r.service.cancel());
    let events = drain(&mut r.rx).await;
    assert!(matches!(
        events.last().unwrap().body,
        ScanEventBody::Cancelled
    ));
    assert!(
        r.store.snapshot_seqs().unwrap().is_empty(),
        "cancelled scan is not saved"
    );
    assert!(r.service.status().is_none());
    assert!(!r.service.cancel());
    // A new scan can start right away; shutdown kills processes.
    r.service.start(&ScanScope::default()).unwrap();
    r.service.shutdown();
    let events = drain(&mut r.rx).await;
    assert!(matches!(
        events.last().unwrap().body,
        ScanEventBody::Cancelled
    ));
    assert_eq!(r.transport.kills(), 1);
}

#[tokio::test(start_paused = true)]
async fn broken_lines_are_dropped_and_counted() {
    let text = format!(
        "{BEGIN}not json\n{{\"check\":\"no.such\"}}\n{{\"_\":\"begin\",\"v\":1,\"bundle\":\"{HASH}\"}}\n\x1b[31m{}{END}",
        run_text(10, true, false).trim_start_matches(BEGIN)
    );
    let mut r = rig(
        FakeTransport::new().host("vps", FakeHost::output(text)),
        FakeProbe::new(),
        projects(&["vps"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let dropped = events
        .iter()
        .find_map(|e| match e.body {
            ScanEventBody::HostFinished { dropped, .. } => Some(dropped),
            _ => None,
        })
        .unwrap();
    assert_eq!(dropped, 3);
    assert_eq!(finished(&events, "vps"), HostOutcome::Reached);
}

#[tokio::test(start_paused = true)]
async fn missing_end_is_partial_and_wrong_hash_counts_nothing() {
    let wrong = run_text(10, true, true).replace(HASH, "0000000000000000");
    let mut r = rig(
        FakeTransport::new()
            .host("cut", FakeHost::output(run_text(10, true, false)))
            .host("other", FakeHost::output(wrong)),
        FakeProbe::new(),
        projects(&["cut", "other"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    assert_eq!(finished(&events, "cut"), HostOutcome::Partial);
    assert_eq!(finished(&events, "other"), HostOutcome::Partial);
    let snap = r.store.load_history(None).unwrap().remove(0);
    assert!(!snap.facts.contains_key(&alias("other")));
}

#[tokio::test(start_paused = true)]
async fn starting_during_a_scan_joins_it() {
    let slow = FakeHost::slow(
        &fixture_run("ubuntu-24.04").unwrap(),
        Duration::from_secs(5),
    );
    let mut r = rig(
        FakeTransport::new().host("vps", slow),
        FakeProbe::new(),
        projects(&["vps"], &[]),
    );
    let first = r.service.start(&ScanScope::default()).unwrap();
    let second = r.service.start(&ScanScope::default()).unwrap();
    assert_eq!(second.scan_id, first.scan_id);
    assert!(second.joined);
    let status = r.service.status().unwrap();
    assert_eq!(status.scan_id, first.scan_id);
    assert!(status.hosts.contains_key(&alias("vps")));
    drain(&mut r.rx).await;
    assert_eq!(r.transport.runs(), 1);
    assert_eq!(r.store.snapshot_seqs().unwrap(), vec![1]);
}

#[tokio::test(start_paused = true)]
async fn everything_failing_at_network_level_is_local_network_down() {
    let mut r = rig(
        FakeTransport::new()
            .host("a", FakeHost::fail(Failure::Unreachable(NetCause::Dns)))
            .host("b", FakeHost::fail(Failure::Unreachable(NetCause::NoRoute))),
        FakeProbe::new().error("https://shop.example", ProbeError::Dns),
        projects(&["a", "b"], &["https://shop.example"]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let Some(ScanEventBody::Failed { error }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    assert_eq!(error.code, ErrorCode::LocalNetworkDown);
    assert!(r.store.snapshot_seqs().unwrap().is_empty());
}

/// A service whose ssh config defines only `b`.
fn rig_knowing_b(transport: FakeTransport, probe: FakeProbe, aliases: &[&str]) -> Rig {
    rig_knowing(transport, probe, aliases, &[], true)
}

/// A service whose ssh config defines only `b` (`found`), or that has no config file.
fn rig_knowing(
    transport: FakeTransport,
    probe: FakeProbe,
    aliases: &[&str],
    urls: &[&str],
    found: bool,
) -> Rig {
    use crate::ssh::config::{ConfigHost, HostList, KnownAliases};
    let hosts = if found {
        vec![ConfigHost {
            alias: HostAlias::parse("b").unwrap(),
            file: "config".into(),
            line: 1,
        }]
    } else {
        Vec::new()
    };
    let list = HostList {
        config_found: found,
        host_name_for_all: false,
        hosts,
        skipped: Vec::new(),
        empty: None,
    };
    let known = KnownAliases::of(&list).unwrap();
    let options = ServiceOptions {
        config_hosts: Some(Arc::new(move || Some(known.clone()))),
        ..ServiceOptions::default()
    };
    rig_opts(
        transport,
        probe,
        projects(aliases, urls),
        Settings::default(),
        4096,
        options,
    )
}

/// `a` is not in the config and its alias failed as a DNS name: it is saved as
/// not in the config, not as unreachable.
#[tokio::test(start_paused = true)]
async fn a_host_gone_from_the_ssh_config_reads_not_in_config() {
    let mut r = rig_knowing_b(
        FakeTransport::new()
            .host("a", FakeHost::fail(Failure::Unreachable(NetCause::Dns)))
            .host("b", healthy()),
        FakeProbe::new(),
        &["a", "b"],
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let Some(ScanEventBody::Done { snapshot_seq }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    assert_eq!(r.transport.runs(), 2);
    let snap = r.store.load_snapshot(*snapshot_seq).unwrap();
    assert_eq!(snap.hosts.get(&alias("a")), Some(&HostOutcome::NotInConfig));
}

/// ssh reaches hosts the config does not name (a DNS name, `Host *`, the
/// system config): such a host is still run, and whatever ssh says stands.
#[tokio::test(start_paused = true)]
async fn a_host_outside_the_ssh_config_is_still_run() {
    let mut r = rig_knowing_b(
        FakeTransport::new()
            .host("a", healthy())
            .host("c", FakeHost::fail(Failure::Unreachable(NetCause::NoRoute)))
            .host("b", healthy()),
        FakeProbe::new(),
        &["a", "b", "c"],
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let Some(ScanEventBody::Done { snapshot_seq }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    assert_eq!(r.transport.runs(), 3);
    let snap = r.store.load_snapshot(*snapshot_seq).unwrap();
    assert_eq!(snap.hosts.get(&alias("a")), Some(&HostOutcome::Reached));
    assert_eq!(
        snap.hosts.get(&alias("c")),
        Some(&HostOutcome::Unreachable {
            cause: NetCause::NoRoute
        })
    );
}

/// An alias gone from the config failed on DNS like everything else: with the
/// Mac offline the scan is still "local network down".
#[tokio::test(start_paused = true)]
async fn a_host_gone_from_the_config_does_not_hide_an_offline_mac() {
    let mut r = rig_knowing(
        FakeTransport::new()
            .host("a", FakeHost::fail(Failure::Unreachable(NetCause::Dns)))
            .host("b", FakeHost::fail(Failure::Unreachable(NetCause::Dns))),
        FakeProbe::new().error("https://shop.example", ProbeError::Dns),
        &["a", "b"],
        &["https://shop.example"],
        true,
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let Some(ScanEventBody::Failed { error }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    assert_eq!(error.code, ErrorCode::LocalNetworkDown);
}

/// `~/.ssh/config` was deleted: every alias fails as a DNS name. That says the
/// config is gone, not that this Mac is offline.
#[tokio::test(start_paused = true)]
async fn with_no_ssh_config_the_hosts_read_not_in_config_not_offline() {
    let mut r = rig_knowing(
        FakeTransport::new()
            .host("a", FakeHost::fail(Failure::Unreachable(NetCause::Dns)))
            .host("b", FakeHost::fail(Failure::Unreachable(NetCause::Dns))),
        FakeProbe::new(),
        &["a", "b"],
        &[],
        false,
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let Some(ScanEventBody::Done { snapshot_seq }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    let snap = r.store.load_snapshot(*snapshot_seq).unwrap();
    assert_eq!(snap.hosts.get(&alias("a")), Some(&HostOutcome::NotInConfig));
    assert_eq!(snap.hosts.get(&alias("b")), Some(&HostOutcome::NotInConfig));
}

/// An alias that is itself a DNS name (or an address) names the server, not a
/// config entry: when its lookup fails, it stays a DNS failure.
#[tokio::test(start_paused = true)]
async fn a_dns_name_outside_the_config_stays_a_dns_failure() {
    let mut r = rig_knowing_b(
        FakeTransport::new()
            .host(
                "db.example.com",
                FakeHost::fail(Failure::Unreachable(NetCause::Dns)),
            )
            .host("b", healthy()),
        FakeProbe::new(),
        &["db.example.com", "b"],
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let Some(ScanEventBody::Done { snapshot_seq }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    let snap = r.store.load_snapshot(*snapshot_seq).unwrap();
    assert_eq!(
        snap.hosts.get(&alias("db.example.com")),
        Some(&HostOutcome::Unreachable {
            cause: NetCause::Dns
        })
    );
}

/// One alias gone from the config and one URL failing on DNS is one network
/// failure, not two: the scan is saved.
#[tokio::test(start_paused = true)]
async fn a_gone_alias_and_one_failing_url_do_not_read_as_offline() {
    let mut r = rig_knowing(
        FakeTransport::new().host("a", FakeHost::fail(Failure::Unreachable(NetCause::Dns))),
        FakeProbe::new().error("https://shop.example", ProbeError::Dns),
        &["a"],
        &["https://shop.example"],
        true,
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let Some(ScanEventBody::Done { snapshot_seq }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    let snap = r.store.load_snapshot(*snapshot_seq).unwrap();
    assert_eq!(snap.hosts.get(&alias("a")), Some(&HostOutcome::NotInConfig));
}

#[tokio::test(start_paused = true)]
async fn one_host_failing_dns_without_urls_is_saved_as_unreachable() {
    let mut r = rig(
        FakeTransport::new().host("a", FakeHost::fail(Failure::Unreachable(NetCause::Dns))),
        FakeProbe::new(),
        projects(&["a"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    let Some(ScanEventBody::Done { snapshot_seq }) = events.last().map(|e| &e.body) else {
        panic!("{:?}", events.last());
    };
    let snap = r.store.load_snapshot(*snapshot_seq).unwrap();
    assert_eq!(
        snap.hosts.get(&alias("a")),
        Some(&HostOutcome::Unreachable {
            cause: NetCause::Dns
        })
    );
}

#[tokio::test(start_paused = true)]
async fn one_reachable_url_means_the_network_is_up() {
    let mut r = rig(
        FakeTransport::new().host("a", FakeHost::fail(Failure::Unreachable(NetCause::Dns))),
        FakeProbe::new().status("https://shop.example", 200, 80.0),
        projects(&["a"], &["https://shop.example"]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    assert!(matches!(
        events.last().unwrap().body,
        ScanEventBody::Done { .. }
    ));
}

#[tokio::test(start_paused = true)]
async fn agent_wait_is_reported_then_the_host_times_out() {
    let mut r = rig(
        FakeTransport::new().host("vps", FakeHost::AgentHang),
        FakeProbe::new(),
        projects(&["vps"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let events = drain(&mut r.rx).await;
    assert!(
        events
            .iter()
            .any(|e| matches!(e.body, ScanEventBody::AgentWait { .. }))
    );
    assert_eq!(finished(&events, "vps"), HostOutcome::Timeout);
}

#[tokio::test(start_paused = true)]
async fn approved_agent_moves_the_host_to_running() {
    let mut r = rig(
        FakeTransport::new().host(
            "vps",
            FakeHost::AgentThen {
                wait: Duration::from_secs(5),
                text: format!("{BEGIN}{END}"),
            },
        ),
        FakeProbe::new(),
        projects(&["vps"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    let mut kinds = Vec::new();
    loop {
        let e = r.rx.recv().await.unwrap();
        match e.body {
            ScanEventBody::AgentWait { .. } => kinds.push("agent_wait"),
            ScanEventBody::HostRunning { .. } => kinds.push("running"),
            ScanEventBody::Done { .. } => break,
            _ => {}
        }
    }
    assert_eq!(kinds, ["agent_wait", "running"]);
}

#[test]
fn host_running_event_moves_the_status_out_of_agent_wait() {
    let host = alias("vps");
    let mut run = ScanRun::new(
        "s".into(),
        crate::domain::datetime::Timestamp::new(time::OffsetDateTime::UNIX_EPOCH),
        [host.clone()],
    );
    assert_eq!(run.next_seq, 0);
    run.apply(0, &ScanEventBody::AgentWait { host: host.clone() });
    assert_eq!(run.hosts[&host].state, HostState::AgentWait);
    run.apply(1, &ScanEventBody::HostRunning { host: host.clone() });
    assert_eq!(run.hosts[&host].state, HostState::Running);
    assert_eq!(
        run.next_seq, 2,
        "a listener hydrating now skips seq 0 and 1"
    );
}

#[tokio::test(start_paused = true)]
async fn a_listener_that_stops_reading_does_not_block_cancel() {
    let mut r = rig_cap(
        FakeTransport::new()
            .host("a", healthy())
            .host("b", healthy()),
        FakeProbe::new(),
        projects(&["a", "b"], &[]),
        Settings::default(),
        1,
    );
    r.service.start(&ScanScope::default()).unwrap();
    // Nobody reads: the channel fills up and every host blocks on emit.
    tokio::time::sleep(Duration::from_secs(1)).await;
    assert!(r.service.status().is_some());
    assert!(r.service.cancel());
    for _ in 0..100 {
        if r.service.status().is_none() {
            drop(r.rx.recv().await);
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("scan still running after cancel with a stuck listener");
}

#[tokio::test(start_paused = true)]
async fn hosts_at_once_limits_concurrency() {
    let slow = || {
        FakeHost::slow(
            &fixture_run("ubuntu-24.04").unwrap(),
            Duration::from_secs(1),
        )
    };
    let mut settings = Settings::default();
    settings.scan.hosts_at_once = Some(1);
    let mut r = rig_with(
        FakeTransport::new().host("a", slow()).host("b", slow()),
        FakeProbe::new(),
        projects(&["a", "b"], &[]),
        settings,
    );
    r.service.start(&ScanScope::default()).unwrap();
    let kinds: Vec<&str> = drain(&mut r.rx)
        .await
        .iter()
        .filter_map(|e| match e.body {
            ScanEventBody::HostStarted { .. } => Some("start"),
            ScanEventBody::HostFinished { .. } => Some("end"),
            _ => None,
        })
        .collect::<Vec<_>>()
        .into_iter()
        .collect();
    assert_eq!(kinds, ["start", "end", "start", "end"]);
}

#[tokio::test(start_paused = true)]
async fn disabled_uptime_group_skips_urls() {
    // Exposed-file probes belong to `security`: with both groups off, no URL.
    let mut settings = Settings::default();
    settings.scan.disabled_groups.insert(CheckGroup::Uptime);
    settings.scan.disabled_groups.insert(CheckGroup::Security);
    let mut r = rig_with(
        FakeTransport::new().host("vps", healthy()),
        FakeProbe::new(),
        projects(&["vps"], &["https://shop.example"]),
        settings,
    );
    r.service.start(&ScanScope::default()).unwrap();
    drain(&mut r.rx).await;
    let snap = r.store.load_history(None).unwrap().remove(0);
    assert!(!snap.hosts.contains_key(&HostRef::Local));
}

/// The URL checks follow their groups: status and certificate are `uptime`,
/// exposed files are `security`, and the Mac is covered for the groups whose
/// probes ran.
#[tokio::test(start_paused = true)]
async fn url_checks_follow_their_groups_and_so_does_coverage() {
    let url = "https://shop.example";
    let probe = || {
        FakeProbe::new()
            .tls(url, 41.0, false, false, false)
            .exposed(url, &["/.env:DB_PASSWORD"])
    };
    let checks_of = |snap: &crate::domain::snapshot::Snapshot| -> Vec<String> {
        snap.facts[&HostRef::Local]
            .iter()
            .map(|f| f.check.clone())
            .collect()
    };
    for (off, want_checks, want_groups) in [
        (
            None,
            vec!["url.http", "url.tls", "url.exposed"],
            vec![CheckGroup::Uptime, CheckGroup::Security],
        ),
        (
            Some(CheckGroup::Security),
            vec!["url.http", "url.tls"],
            vec![CheckGroup::Uptime],
        ),
        (
            Some(CheckGroup::Uptime),
            vec!["url.exposed"],
            vec![CheckGroup::Security],
        ),
    ] {
        let mut settings = Settings::default();
        settings.scan.disabled_groups.extend(off);
        let mut r = rig_with(
            FakeTransport::new().host("vps", healthy()),
            probe(),
            projects(&["vps"], &[url]),
            settings,
        );
        r.service.start(&ScanScope::default()).unwrap();
        drain(&mut r.rx).await;
        let snap = r.store.load_history(None).unwrap().remove(0);
        assert_eq!(checks_of(&snap), want_checks, "off: {off:?}");
        for group in [CheckGroup::Uptime, CheckGroup::Security] {
            assert_eq!(
                snap.covered(&HostRef::Local, group),
                want_groups.contains(&group),
                "off: {off:?}, {group:?}"
            );
        }
    }
}

/// An exposed `.env` is critical while it is served, and "fixed" once a scan
/// that probed for it finds it gone.
#[tokio::test(start_paused = true)]
async fn an_exposed_file_is_reported_and_then_fixed() {
    let url = "https://shop.example";
    let pf = projects(&["vps"], &[url]);
    let settings = Settings::default();
    let first = rig_with(
        FakeTransport::new().host("vps", healthy()),
        FakeProbe::new().exposed(url, &["/.env:APP_KEY"]),
        pf.clone(),
        settings.clone(),
    );
    let mut r = first;
    r.service.start(&ScanScope::default()).unwrap();
    drain(&mut r.rx).await;
    // Same store, the site fixed.
    let (tx, mut rx) = mpsc::channel(4096);
    let service = ScanService::new(
        r.transport.clone(),
        Arc::new(FakeProbe::new().exposed(url, &[])),
        r.store.clone(),
        tx,
    );
    let m = crate::checks::manifest().unwrap();
    let report = |r: &Rig| {
        let history = r.store.load_history(None).unwrap();
        evaluate(
            &history,
            Config {
                projects: &pf,
                settings: &settings,
            },
            &m,
            history[0].finished_at,
        )
    };
    let item = |rep: &crate::domain::evaluate::Report| {
        rep.items
            .iter()
            .find(|i| i.key.check == "url.exposed")
            .cloned()
            .unwrap()
    };
    let rep = report(&r);
    assert_eq!(item(&rep).severity, Severity::Crit);
    assert_eq!(item(&rep).delta, Some(Delta::New));
    // The fixture host has criticals of its own; the exposed file is one more.
    let before = rep.projects[0].counts.crit;

    service.start(&ScanScope::default()).unwrap();
    drain(&mut rx).await;
    let rep = report(&r);
    assert_eq!(item(&rep).severity, Severity::Ok);
    assert_eq!(item(&rep).delta, Some(Delta::Fixed));
    assert_eq!(rep.projects[0].counts.crit, before - 1);
}

/// A crit from the last complete scan stays red (stale) when the host times
/// out before that group, and is never reported as fixed.
#[tokio::test(start_paused = true)]
async fn evaluate_keeps_old_crit_when_host_times_out() {
    let dir = TempDir::new().unwrap();
    let store = FsStore::new(dir.path());
    let pf = projects(&["vps"], &[]);
    store.save_projects(&pf, None).unwrap();
    let settings = Settings::default();

    let scan = |host: FakeHost| {
        let store = store.clone();
        async move {
            let (tx, mut rx) = mpsc::channel(1024);
            let t = FakeTransport::new().host("vps", host);
            let s = ScanService::new(Arc::new(t), Arc::new(FakeProbe::new()), store, tx);
            s.start(&ScanScope::default()).unwrap();
            drain(&mut rx).await
        }
    };
    scan(FakeHost::output(run_text(95, true, true))).await;
    // Second scan: system finishes, then the host stalls past the budget.
    let stalled = FakeHost::Output {
        chunks: vec![
            (Duration::ZERO, run_text(0, false, false)),
            (Duration::from_secs(200), END.to_owned()),
        ],
        exit: 0,
    };
    let events = scan(stalled).await;
    assert_eq!(finished(&events, "vps"), HostOutcome::Timeout);

    let history = store.load_history(None).unwrap();
    assert_eq!(history.len(), 2);
    let m = crate::checks::manifest().unwrap();
    let report = evaluate(
        &history,
        Config {
            projects: &pf,
            settings: &settings,
        },
        &m,
        history[0].finished_at,
    );
    let disk = report
        .items
        .iter()
        .find(|i| i.key.check == "disk.fs")
        .unwrap();
    assert_eq!(disk.severity, Severity::Crit, "old crit stays red");
    assert_eq!(disk.disposition, Disposition::Stale { since_seq: 1 });
    assert_ne!(disk.delta, Some(Delta::Fixed));
    let load = report
        .items
        .iter()
        .find(|i| i.key.check == "sys.load")
        .unwrap();
    assert_ne!(load.severity, Severity::Unknown(UnknownReason::Unreachable));
}

#[tokio::test(start_paused = true)]
async fn each_host_is_sent_its_own_components_under_one_hash() {
    let mut r = rig(
        FakeTransport::new()
            .host("vps-a", healthy())
            .host("vps-b", healthy()),
        FakeProbe::new(),
        projects(&["vps-a", "vps-b"], &[]),
    );
    r.service.start(&ScanScope::default()).unwrap();
    drain(&mut r.rx).await;
    let scripts = r.transport.scripts();
    assert_eq!(scripts.len(), 2);
    let for_host = |h: &str| {
        scripts
            .iter()
            .find(|s| s.contains(&format!("DAMINUS_PATHS='/srv/{h}'")))
            .unwrap_or_else(|| panic!("no bundle names /srv/{h}"))
    };
    let (a, b) = (for_host("vps-a"), for_host("vps-b"));
    assert!(!a.contains("/srv/vps-b") && !b.contains("/srv/vps-a"));
    assert_eq!(
        crate::ssh::fake::bundle_hash(a),
        crate::ssh::fake::bundle_hash(b)
    );
}
