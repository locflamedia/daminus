use std::collections::BTreeSet;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use clap::{Parser, Subcommand};
use daminus_core::checks::bundle::{self, BundleVars, Selection};
use daminus_core::checks::{manifest, ndjson};
use daminus_core::domain::datetime::Timestamp;
use daminus_core::domain::evaluate::{Delta, Disposition, Report};
use daminus_core::domain::host::HostAlias;
use daminus_core::domain::snapshot::HostOutcome;
use daminus_core::probe::HttpProbe;
use daminus_core::scan::{
    ScanEvent, ScanEventBody, ScanScope, ScanService, build_bundles, latest_report, resolve,
};
use daminus_core::ssh::{SshTransport, outcome_error};
use daminus_core::store::FsStore;
use tokio::sync::mpsc;

#[derive(Parser)]
#[command(name = "daminus-dev", version = daminus_core::VERSION, about = "Daminus core dev CLI")]
struct Cli {
    /// Config folder. Defaults to `~/.daminus-dev`, never the app's own folder.
    #[arg(long, value_name = "PATH")]
    config_dir: Option<PathBuf>,
    /// ssh config file to use instead of `~/.ssh/config` (test hosts),
    /// passed to ssh as `-F`.
    #[arg(short = 'F', long, value_name = "PATH", global = true)]
    ssh_config: Option<PathBuf>,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Print the check bundle a host would run, using Settings › Scan from the config folder.
    Bundle {
        /// Only this check (repeatable). Default: every enabled check.
        #[arg(long, value_name = "ID")]
        only: Vec<String>,
        /// Include this host's components from `projects.json` (code folders,
        /// compose projects, pm2 apps), as a scan of that host does.
        #[arg(long, value_name = "ALIAS")]
        host: Option<String>,
    },
    /// Validate a bundle's NDJSON output: every line v1, `begin` and `end`
    /// present, every check id in the manifest. Exits 1 otherwise.
    Ndjson {
        /// Output file to read.
        file: PathBuf,
    },
    /// Scan hosts and URLs from `projects.json`, save the snapshot and print
    /// what changed. Progress goes to stderr; Ctrl-C cancels without saving.
    Scan {
        /// Only this project's hosts and URLs (repeatable).
        #[arg(long, value_name = "ID")]
        project: Vec<String>,
        /// Only this host (repeatable), even if excluded in Settings › Hosts.
        #[arg(long, value_name = "ALIAS")]
        host: Vec<String>,
        /// Connect to nothing: print the exact bundle each host would be
        /// sent (stdout; a `==> alias <==` header per host and the URLs on
        /// stderr) and exit.
        #[arg(long)]
        print_bundle: bool,
    },
    /// List saved snapshots, newest last.
    Snapshots,
    /// Print `evaluate` over the saved snapshots as JSON.
    Report,
}

fn default_config_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(".daminus-dev")
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .with_writer(std::io::stderr)
        .init();
    let dir = cli.config_dir.unwrap_or_else(default_config_dir);
    let store = FsStore::new(&dir);
    match cli.command {
        None => config_summary(&store, &dir),
        Some(Command::Bundle { only, host }) => print_bundle(&store, only, host),
        Some(Command::Ndjson { file }) => validate_ndjson(&file),
        Some(Command::Scan {
            project,
            host,
            print_bundle,
        }) => {
            if print_bundle {
                print_scan_bundles(&store, project, host)
            } else {
                scan(store, cli.ssh_config, project, host)
            }
        }
        Some(Command::Snapshots) => list_snapshots(&store),
        Some(Command::Report) => print_report(&store),
    }
}

fn now() -> Timestamp {
    Timestamp::new(time::OffsetDateTime::now_utc())
}

fn scope_of(projects: Vec<String>, hosts: Vec<String>) -> Result<ScanScope, String> {
    let mut aliases = Vec::new();
    for h in hosts {
        aliases.push(HostAlias::parse(&h).map_err(|e| format!("--host {h:?}: {e}"))?);
    }
    Ok(ScanScope {
        projects,
        hosts: aliases,
    })
}

/// What `scan` would send, without connecting anywhere.
fn print_scan_bundles(store: &FsStore, projects: Vec<String>, hosts: Vec<String>) -> ExitCode {
    let run = || -> Result<(), String> {
        let scope = scope_of(projects, hosts)?;
        let files = store
            .load_projects()
            .map_err(|e| format!("projects: {e:?}"))?
            .value;
        let settings = store
            .load_settings()
            .map_err(|e| format!("settings: {e:?}"))?
            .value;
        let targets = resolve(&files, &scope).map_err(|e| format!("{e:?}"))?;
        let (bundle, scripts) =
            build_bundles(&settings, &files, &targets.hosts).map_err(|e| format!("{e:?}"))?;
        eprintln!("bundle {} checks: {}", bundle.hash, bundle.checks.join(" "));
        let mut stdout = std::io::stdout().lock();
        for host in &targets.hosts {
            eprintln!("==> {host} <==");
            let text = scripts.get(host).ok_or("host without a bundle")?;
            stdout
                .write_all(text.as_bytes())
                .and_then(|()| stdout.flush())
                .map_err(|e| e.to_string())?;
        }
        for url in &targets.urls {
            eprintln!("url {url}");
        }
        Ok(())
    };
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn scan(
    store: FsStore,
    ssh_config: Option<PathBuf>,
    projects: Vec<String>,
    hosts: Vec<String>,
) -> ExitCode {
    let scope = match scope_of(projects, hosts) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("runtime: {e}");
            return ExitCode::FAILURE;
        }
    };
    runtime.block_on(async move {
        let mut transport = SshTransport::new();
        if let Some(cfg) = ssh_config {
            transport = transport.with_config(cfg);
        }
        let (tx, mut rx) = mpsc::channel(1024);
        let service = ScanService::new(
            Arc::new(transport),
            Arc::new(HttpProbe::new()),
            store.clone(),
            tx,
        );
        let started = match service.start(&scope) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("scan: {e:?}");
                return ExitCode::FAILURE;
            }
        };
        eprintln!("scan {} started", started.scan_id);
        let mut interrupted = false;
        loop {
            let event = tokio::select! {
                e = rx.recv() => e,
                _ = tokio::signal::ctrl_c(), if !interrupted => {
                    interrupted = true;
                    eprintln!("cancelling…");
                    service.shutdown();
                    continue;
                }
            };
            let Some(event) = event else {
                return ExitCode::FAILURE;
            };
            match print_event(&event) {
                Some(ScanEnd::Saved) => return print_changes(&store),
                Some(ScanEnd::Cancelled) => return ExitCode::from(130),
                Some(ScanEnd::Failed) => return ExitCode::FAILURE,
                None => {}
            }
        }
    })
}

enum ScanEnd {
    Saved,
    Cancelled,
    Failed,
}

fn print_event(e: &ScanEvent) -> Option<ScanEnd> {
    match &e.body {
        ScanEventBody::HostStarted { host } => eprintln!("{host:<24} connecting"),
        ScanEventBody::HostRunning { host } => eprintln!("{host:<24} running"),
        ScanEventBody::AgentWait { host } => {
            eprintln!("{host:<24} waiting for SSH agent approval")
        }
        ScanEventBody::Step { host, group, ms } => {
            eprintln!("{host:<24} {group:?} done in {ms} ms")
        }
        ScanEventBody::Fact { .. } => {}
        ScanEventBody::HostFinished {
            host,
            outcome,
            ms,
            facts,
            dropped,
        } => {
            let error = outcome_error(outcome)
                .map(|c| format!(" [{c:?}]"))
                .unwrap_or_default();
            let fp = match outcome {
                HostOutcome::HostKeyUnknown { fp } | HostOutcome::HostKeyChanged { fp } => {
                    format!(" key {fp}")
                }
                _ => String::new(),
            };
            eprintln!(
                "{host:<24} {} in {:.1} s, {facts} fact(s), {dropped} dropped{error}{fp}",
                outcome_name(outcome),
                *ms as f64 / 1000.0
            );
        }
        ScanEventBody::Done { snapshot_seq } => {
            eprintln!("saved snapshot {snapshot_seq}");
            return Some(ScanEnd::Saved);
        }
        ScanEventBody::Cancelled => {
            eprintln!("cancelled, nothing saved");
            return Some(ScanEnd::Cancelled);
        }
        ScanEventBody::Failed { error } => {
            eprintln!("scan failed: {error:?}");
            return Some(ScanEnd::Failed);
        }
    }
    None
}

fn outcome_name(o: &HostOutcome) -> String {
    serde_json::to_value(o)
        .ok()
        .and_then(|v| v["state"].as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn load_report(store: &FsStore) -> Result<Report, String> {
    latest_report(store, now()).map_err(|e| format!("{e:?}"))
}

/// One line per issue and per change since the previous scan.
fn print_changes(store: &FsStore) -> ExitCode {
    let report = match load_report(store) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    let c = &report.counts;
    println!(
        "scan {}: {} crit, {} warn, {} stale, {} unknown, {} needs permission",
        report.seq.unwrap_or(0),
        c.crit,
        c.warn,
        c.stale,
        c.unknown,
        c.needs_perm
    );
    for item in &report.items {
        let delta = match &item.delta {
            Some(Delta::New) => "new".to_owned(),
            Some(Delta::Fixed) => "fixed".to_owned(),
            Some(Delta::Still { scans_open }) => format!("still ({scans_open} scans)"),
            Some(Delta::Changed { from, to }) => format!("changed {from:?} -> {to:?}"),
            None if item.severity.is_issue() => "open".to_owned(),
            None => continue,
        };
        let stale = match &item.disposition {
            Disposition::Stale { since_seq } => format!(" (not re-checked since scan {since_seq})"),
            _ => String::new(),
        };
        let value = item
            .fact
            .as_ref()
            .and_then(|f| {
                f.value
                    .map(|v| format!(" {v}{}", f.unit.as_deref().unwrap_or("")))
            })
            .unwrap_or_default();
        println!(
            "  {:?} {} {} {}{value}: {delta}{stale}",
            item.severity, item.key.host, item.key.check, item.key.target
        );
    }
    ExitCode::SUCCESS
}

fn list_snapshots(store: &FsStore) -> ExitCode {
    let seqs = match store.snapshot_seqs() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{e:?}");
            return ExitCode::FAILURE;
        }
    };
    for seq in seqs {
        let Some(s) = store.load_snapshot(seq) else {
            println!("{seq:6}  (unreadable)");
            continue;
        };
        let hosts: Vec<String> = s
            .hosts
            .iter()
            .map(|(h, o)| format!("{h}={}", outcome_name(o)))
            .collect();
        let facts: usize = s.facts.values().map(Vec::len).sum();
        println!(
            "{seq:6}  {}  {facts} fact(s)  {}",
            serde_json::to_value(s.finished_at)
                .ok()
                .and_then(|v| v.as_str().map(str::to_owned))
                .unwrap_or_default(),
            hosts.join(" ")
        );
    }
    ExitCode::SUCCESS
}

fn print_report(store: &FsStore) -> ExitCode {
    match load_report(store)
        .and_then(|r| serde_json::to_string_pretty(&r).map_err(|e| e.to_string()))
    {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn config_summary(store: &FsStore, dir: &std::path::Path) -> ExitCode {
    // Loading both files validates them (and migrates older versions).
    let loaded = store
        .load_projects()
        .and_then(|p| store.load_settings().map(|s| (p, s)));
    match loaded {
        Ok((projects, _settings)) => {
            println!(
                "config {}: {} project(s), {} expected rule(s)",
                dir.display(),
                projects.value.projects.len(),
                projects.value.rules.len()
            );
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("config {}: {e:?}", dir.display());
            ExitCode::FAILURE
        }
    }
}

fn print_bundle(store: &FsStore, only: Vec<String>, host: Option<String>) -> ExitCode {
    let settings = match store.load_settings() {
        Ok(s) => s.value,
        Err(e) => {
            eprintln!("settings: {e:?}");
            return ExitCode::FAILURE;
        }
    };
    let built = manifest()
        .map_err(|e| format!("manifest: {e}"))
        .and_then(|m| {
            let mut vars = BundleVars::from_scan(&settings.scan).map_err(|e| e.to_string())?;
            if let Some(h) = &host {
                let alias = HostAlias::parse(h).map_err(|e| format!("--host {h:?}: {e}"))?;
                let files = store
                    .load_projects()
                    .map_err(|e| format!("projects: {e:?}"))?
                    .value;
                vars.add_components(&files, &alias)
                    .map_err(|e| e.to_string())?;
            }
            let selection = Selection {
                disabled_groups: settings.scan.disabled_groups.clone(),
                only: (!only.is_empty()).then(|| only.into_iter().collect::<BTreeSet<_>>()),
            };
            bundle::build(&m, &selection, &vars).map_err(|e| e.to_string())
        });
    match built {
        Ok(b) => {
            let mut stdout = std::io::stdout().lock();
            if stdout.write_all(b.text.as_bytes()).is_err() {
                return ExitCode::FAILURE;
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn validate_ndjson(file: &std::path::Path) -> ExitCode {
    let bytes = match std::fs::read(file) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("{}: {e}", file.display());
            return ExitCode::FAILURE;
        }
    };
    let m = match manifest() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("manifest: {e}");
            return ExitCode::FAILURE;
        }
    };
    let out = ndjson::parse(&bytes);
    let mut problems = Vec::new();
    if out.bundle.is_none() {
        problems.push("no v1 `begin` line".to_owned());
    }
    if !out.ended {
        problems.push("no `end` line".to_owned());
    }
    if out.dropped > 0 {
        problems.push(format!("{} line(s) are not valid NDJSON v1", out.dropped));
    }
    if out.truncated {
        problems.push("output over the per-host limit".to_owned());
    }
    for fact in &out.facts {
        if m.get(&fact.check).is_none() {
            problems.push(format!("check {:?} is not in the manifest", fact.check));
        }
    }
    let groups: Vec<String> = out.coverage.iter().map(|g| format!("{g:?}")).collect();
    println!(
        "{}: {} fact(s), groups [{}], {}",
        file.display(),
        out.facts.len(),
        groups.join(", "),
        if problems.is_empty() { "ok" } else { "INVALID" }
    );
    for p in &problems {
        eprintln!("  {p}");
    }
    if problems.is_empty() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
