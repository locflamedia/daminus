//! `daminus-dev hosts` and `daminus-dev discover`: the setup flow from a
//! terminal. Progress goes to stderr, results to stdout.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use daminus_core::discover::grouping::{Proposal, ProposedKind};
use daminus_core::discover::{DockerAccess, LoginReport, NoteCode, SetupRecord};
use daminus_core::domain::host::HostAlias;
use daminus_core::domain::snapshot::HostOutcome;
use daminus_core::setup::{
    HostSetup, IssueLevel, Saved, SetupEvent, SetupEventBody, SetupService, Step,
};
use daminus_core::ssh::config::{EmptyReason, SkipReason};
use daminus_core::ssh::{SshTransport, outcome_error};
use daminus_core::store::FsStore;
use tokio::sync::mpsc;

fn service(
    store: &FsStore,
    ssh_config: Option<&PathBuf>,
) -> (SetupService, mpsc::Receiver<SetupEvent>) {
    let mut transport = SshTransport::new();
    if let Some(cfg) = ssh_config {
        transport = transport.with_config(cfg);
    }
    let tools = transport.tools().clone();
    let (tx, rx) = mpsc::channel(4096);
    (
        SetupService::new(Arc::new(transport), tools, store.clone(), tx),
        rx,
    )
}

fn runtime() -> Result<tokio::runtime::Runtime, ExitCode> {
    tokio::runtime::Runtime::new().map_err(|e| {
        eprintln!("runtime: {e}");
        ExitCode::FAILURE
    })
}

/// `hosts`: the hosts of the ssh config and why others are left out.
pub fn hosts(store: &FsStore, ssh_config: Option<PathBuf>) -> ExitCode {
    let rt = match runtime() {
        Ok(rt) => rt,
        Err(code) => return code,
    };
    rt.block_on(async {
        let (service, _rx) = service(store, ssh_config.as_ref());
        let (list, entries) = match service.list_resolved().await {
            Ok(v) => (v.list, v.entries),
            Err(e) => {
                eprintln!("hosts: {e:?}");
                return ExitCode::FAILURE;
            }
        };
        if let Some(reason) = list.empty {
            match reason {
                EmptyReason::NoConfig => {
                    println!("no ssh config file: add your servers to ~/.ssh/config")
                }
                EmptyReason::NoUsableHosts => {
                    println!("the ssh config has no host that can be used")
                }
            }
        }
        println!("{} host(s)", entries.len());
        for e in &entries {
            let detail = match &e.resolved {
                Some(r) => format!(
                    "{}{}:{}{}",
                    r.user
                        .as_deref()
                        .map(|u| format!("{u}@"))
                        .unwrap_or_default(),
                    r.hostname,
                    r.port,
                    r.proxy_jump
                        .as_deref()
                        .map(|p| format!("  via {p}"))
                        .unwrap_or_default()
                ),
                None => "(ssh could not resolve it)".to_owned(),
            };
            println!("  {:<24} {detail}", e.host.alias);
        }
        if !list.skipped.is_empty() {
            println!("{} entr(ies) left out", list.skipped.len());
            for s in &list.skipped {
                let why = match s.reason {
                    SkipReason::Wildcard => "wildcard",
                    SkipReason::Match => "match block",
                    SkipReason::NoHostName => "no HostName",
                    SkipReason::InvalidAlias => "not a usable alias",
                };
                println!("  {:<24} {why} ({}:{})", s.pattern, s.file, s.line);
            }
        }
        ExitCode::SUCCESS
    })
}

pub struct DiscoverArgs {
    pub hosts: Vec<String>,
    /// `PROJECT=DATABASE`: the name of the database a project's database components use.
    pub databases: Vec<String>,
    /// Project folders the login test asks about.
    pub paths: Vec<String>,
    pub dry_run: bool,
}

fn parse_hosts(hosts: &[String]) -> Result<Vec<HostAlias>, String> {
    hosts
        .iter()
        .map(|h| HostAlias::parse(h).map_err(|e| format!("--host {h:?}: {e}")))
        .collect()
}

fn parse_databases(items: &[String]) -> Result<BTreeMap<String, String>, String> {
    let mut map = BTreeMap::new();
    for item in items {
        let (project, name) = item
            .split_once('=')
            .filter(|(p, n)| !p.is_empty() && !n.is_empty())
            .ok_or_else(|| format!("--database {item:?}: expected PROJECT=DATABASE"))?;
        map.insert(project.to_owned(), name.to_owned());
    }
    Ok(map)
}

/// `discover`: test the hosts, discover the ones that answer, print the
/// suggested projects and (unless `--dry-run`) save them to `projects.json`.
pub fn discover(store: FsStore, ssh_config: Option<PathBuf>, args: DiscoverArgs) -> ExitCode {
    let (wanted, databases) = match (parse_hosts(&args.hosts), parse_databases(&args.databases)) {
        (Ok(h), Ok(d)) => (h, d),
        (Err(e), _) | (_, Err(e)) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    let rt = match runtime() {
        Ok(rt) => rt,
        Err(code) => return code,
    };
    rt.block_on(async move {
        let (service, mut rx) = service(&store, ssh_config.as_ref());
        let hosts = if wanted.is_empty() {
            match service.list_hosts() {
                Ok(list) if !list.hosts.is_empty() => {
                    list.hosts.into_iter().map(|h| h.alias).collect()
                }
                Ok(_) => {
                    eprintln!("no hosts in the ssh config: add your servers to ~/.ssh/config (see `hosts`)");
                    return ExitCode::FAILURE;
                }
                Err(e) => {
                    eprintln!("hosts: {e:?}");
                    return ExitCode::FAILURE;
                }
            }
        } else {
            wanted
        };

        eprintln!("== testing {} host(s)", hosts.len());
        if !run_step(&service, &mut rx, Step::Test, &hosts, &args.paths).await {
            return ExitCode::FAILURE;
        }
        let tested = service.result();
        print_tests(&tested.hosts, ssh_config.as_ref());
        let reachable: Vec<HostAlias> = tested
            .hosts
            .iter()
            .filter(|h| h.outcome.as_ref().is_some_and(HostOutcome::answered))
            .map(|h| h.host.clone())
            .collect();
        if reachable.is_empty() {
            eprintln!("no host answered: nothing to discover");
            return ExitCode::FAILURE;
        }

        eprintln!("== discovering {} host(s)", reachable.len());
        if !run_step(&service, &mut rx, Step::Discover, &reachable, &[]).await {
            return ExitCode::FAILURE;
        }
        let result = service.result();
        print_notes(&result.hosts);
        let Some(proposal) = result.proposal else {
            println!("nothing found on the hosts that answered");
            return ExitCode::SUCCESS;
        };
        print_proposal(&proposal);

        let mut projects = Vec::new();
        for p in &proposal.projects {
            let db = databases.get(&p.id).map(String::as_str);
            let (project, incomplete) = p.to_project(db);
            if incomplete > 0 {
                println!(
                    "{}: {incomplete} database component(s) saved without a name or .env, so their \
                     size is not read yet (--database {}=NAME, or add it to projects.json)",
                    p.id, p.id
                );
            }
            projects.push(project);
        }
        let issues = service.validate(&projects);
        for i in &issues {
            let level = match i.level {
                IssueLevel::Error => "error",
                IssueLevel::Warning => "warning",
            };
            println!("{level}: {}: {:?} {:?}", i.project, i.field, i.code);
        }
        if args.dry_run {
            println!("dry run: nothing saved");
            return ExitCode::SUCCESS;
        }
        match service.save(projects, &reachable) {
            Ok(Saved::Saved { projects, .. }) => {
                println!(
                    "saved {} project(s) to {}",
                    projects,
                    store.root().join("projects.json").display()
                );
                ExitCode::SUCCESS
            }
            Ok(Saved::Rejected { .. }) => {
                eprintln!("not saved: fix the errors above");
                ExitCode::FAILURE
            }
            Err(e) => {
                eprintln!("save: {e:?}");
                ExitCode::FAILURE
            }
        }
    })
}

/// Runs one step to its end, printing progress to stderr. `false` when it
/// failed to start or was cancelled.
async fn run_step(
    service: &SetupService,
    rx: &mut mpsc::Receiver<SetupEvent>,
    step: Step,
    hosts: &[HostAlias],
    paths: &[String],
) -> bool {
    if let Err(e) = service.start(step, hosts, paths) {
        eprintln!("setup: {e:?}");
        return false;
    }
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
        let Some(event) = event else { return false };
        match &event.body {
            SetupEventBody::HostStarted { host } => eprintln!("{host:<24} connecting"),
            SetupEventBody::AgentWait { host } => {
                eprintln!("{host:<24} waiting for SSH agent approval");
            }
            SetupEventBody::HostRunning { host } => eprintln!("{host:<24} running"),
            SetupEventBody::Item { .. } => {}
            SetupEventBody::HostKey { .. } => {}
            SetupEventBody::HostFinished {
                host,
                outcome,
                ms,
                items,
                dropped,
            } => {
                let error = outcome_error(outcome)
                    .map(|c| format!(" [{c:?}]"))
                    .unwrap_or_default();
                eprintln!(
                    "{host:<24} {} in {:.1} s, {items} item(s), {dropped} dropped{error}",
                    super::outcome_name(outcome),
                    f64::from(*ms) / 1000.0
                );
            }
            SetupEventBody::Done => return true,
            SetupEventBody::Cancelled => {
                eprintln!("cancelled");
                return false;
            }
            SetupEventBody::Failed { error } => {
                eprintln!("setup failed: {error:?}");
                return false;
            }
        }
    }
}

/// What discover could not read, so what it lists is incomplete.
fn print_notes(hosts: &[HostSetup]) {
    for h in hosts {
        let Some(found) = &h.discovery else { continue };
        for n in &found.notes {
            let what = match n.code {
                NoteCode::DockerNoPermission => {
                    "docker: no permission (add the user to the docker group)"
                }
                NoteCode::DockerStopped => "docker is not running",
                NoteCode::Pm2Missing => "a pm2 daemon runs but there is no pm2 command",
                NoteCode::NginxNoPermission => "nginx.conf cannot be read by this user",
            };
            println!("note: {}: {what}", h.host);
        }
        for p in &found.pm2_homes {
            println!(
                "note: {}: pm2 daemon {} belongs to another user (log in as that user to list its apps)",
                h.host, p.home
            );
        }
    }
}

fn print_tests(hosts: &[HostSetup], ssh_config: Option<&PathBuf>) {
    println!("login test");
    for h in hosts {
        let name = &h.host;
        match &h.outcome {
            Some(HostOutcome::HostKeyUnknown { fp }) | Some(HostOutcome::HostKeyChanged { fp }) => {
                let changed = matches!(h.outcome, Some(HostOutcome::HostKeyChanged { .. }));
                let what = if changed {
                    "host key CHANGED"
                } else {
                    "host key not accepted yet"
                };
                let key = if fp.is_empty() {
                    "(could not read it)"
                } else {
                    fp.as_str()
                };
                println!("  {name:<24} {what}: {key}");
                let cfg = ssh_config
                    .map(|c| format!(" -F {}", c.display()))
                    .unwrap_or_default();
                println!(
                    "  {:<24} check the fingerprint, accept it once in Terminal with `ssh{cfg} {name}`, then run this again",
                    ""
                );
            }
            Some(outcome) if !outcome.answered() => {
                let code = outcome_error(outcome)
                    .map(|c| format!("{c:?}"))
                    .unwrap_or_default();
                println!("  {name:<24} {} [{code}]", super::outcome_name(outcome));
            }
            _ => {
                let Some(login) = h.login.as_ref().and_then(|l| l.login.as_ref()) else {
                    println!("  {name:<24} answered, but not with a login report");
                    continue;
                };
                println!("  {name:<24} {}", describe(login));
                for p in h.login.iter().flat_map(|l| &l.paths) {
                    println!("  {:<24}   folder {} {:?}", "", p.path, p.state);
                }
            }
        }
    }
}

fn describe(l: &LoginReport) -> String {
    let docker = match l.docker {
        DockerAccess::Ok => "docker ok",
        DockerAccess::NoPermission => "docker: no permission (add the user to the docker group)",
        DockerAccess::Stopped => "docker not running",
        DockerAccess::Missing => "no docker",
    };
    let groups = [(l.adm_group, "adm"), (l.journal_group, "systemd-journal")]
        .iter()
        .filter(|(on, _)| *on)
        .map(|(_, n)| *n)
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{} {} as {}{} ({}), {docker}{}",
        l.os,
        l.distro,
        l.user,
        if l.root { " (root)" } else { "" },
        l.arch,
        if groups.is_empty() {
            String::new()
        } else {
            format!(", groups: {groups}")
        }
    )
}

fn print_proposal(p: &Proposal) {
    println!("{} project(s) suggested", p.projects.len());
    for project in &p.projects {
        println!("  {} ({})", project.name, project.id);
        for url in &project.urls {
            println!("    url {url}");
        }
        for c in &project.components {
            let what = match &c.kind {
                ProposedKind::Path { path } => format!("path {path}"),
                ProposedKind::Compose { project } => format!("compose {project}"),
                ProposedKind::Pm2 { app, pm2_home } => format!(
                    "pm2 {app}{}",
                    pm2_home
                        .as_deref()
                        .map(|h| format!(" (PM2_HOME {h})"))
                        .unwrap_or_default()
                ),
                ProposedKind::Db {
                    engine,
                    env_file,
                    container,
                } => format!(
                    "db {engine:?} env {env_file}{}",
                    container
                        .as_deref()
                        .map(|c| format!(" in container {c}"))
                        .unwrap_or_default()
                ),
            };
            println!("    {:?} {} {what}", c.role, c.host);
        }
    }
    println!("{} item(s) not in a project", p.unassigned.len());
    for u in &p.unassigned {
        let what = match &u.item {
            SetupRecord::Vhost(v) => format!("nginx {}", v.names.join(",")),
            SetupRecord::Compose(c) => format!("compose {}", c.project),
            SetupRecord::Pm2(a) => format!("pm2 {}", a.app),
            SetupRecord::Db(d) => format!("database {:?} {}", d.engine, d.name),
            SetupRecord::Env(e) => format!(".env {}", e.path),
            other => other.kind().to_owned(),
        };
        println!("  {} {what}", u.host);
    }
}
