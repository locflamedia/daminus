//! `SetupService`: the setup flow behind the screens (01 to 05, 12, 25).
//!
//! 1. [`SetupService::list_hosts`] reads the hosts of `~/.ssh/config`
//!    (and says why others were left out).
//! 2. The user picks hosts and [`SetupService::start`] runs the login test
//!    ([`Step::Test`]) and then discover ([`Step::Discover`]) on them through
//!    the same `Transport` a scan uses, so ProxyJump, the SSH agent and the
//!    host key policy are the user's own and the app never writes
//!    `known_hosts`. Events stream out like a scan's; [`SetupService::result`]
//!    has what was found and the suggested projects.
//! 3. The user edits the suggestions; [`SetupService::validate`] checks them
//!    (including the warning for a URL only this Mac can reach) and
//!    [`SetupService::save`] writes `projects.json`.
//!
//! One run at a time (a second `start` joins the running one). A run that is
//! cancelled leaves what was already found.

mod environment;
mod event;
mod url_check;
mod validate;

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use time::OffsetDateTime;
use tokio::sync::{Semaphore, mpsc};
use tokio::task::JoinSet;
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;
use tracing::Instrument as _;

pub use environment::{AgentState, SshEnvironment};
pub use event::{
    HostSetup, SetupEvent, SetupEventBody, SetupHostProgress, SetupResult, SetupRun, Started, Step,
};
pub use url_check::{UrlCheck, UrlFailure, check_url};
pub use validate::{
    IssueCode, IssueField, IssueLevel, ProjectIssue, has_errors, is_probeable_url, normalized,
    validate,
};

use crate::checks::bundle::Bundle;
use crate::discover::grouping::group;
use crate::discover::{
    HostDiscovery, LoginResult, RecordParser, SetupRecord, discover_bundle, login_bundle,
};
use crate::domain::datetime::Timestamp;
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::host::HostAlias;
use crate::domain::project::{Project, ProjectsFile};
use crate::domain::snapshot::HostOutcome;
use crate::scan::{MAX_CONNECT_TIMEOUT_S, concurrency};
use crate::ssh::config::{
    ConfigSource, HostList, HostListing, ResolvedHost, list_hosts, resolve, resolve_all,
};
use crate::ssh::hostkey::{self, HostKeyInfo, HostKeyState};
use crate::ssh::{RunEnd, RunRequest, RunSignal, SshTools, Transport, run_outcome};
use crate::store::FsStore;

/// Time the login test has on a reachable host, from its first byte of
/// output. Before any output (connect, SSH agent approval) it has as long again.
pub const TEST_BUDGET: Duration = Duration::from_secs(30);
/// The same for discover, which searches folders and asks docker and pm2.
pub const DISCOVER_BUDGET: Duration = Duration::from_secs(90);

/// Knobs that are not user settings. Tests shorten the budgets.
#[derive(Clone, Debug)]
pub struct SetupOptions {
    pub test_budget: Duration,
    pub discover_budget: Duration,
}

impl Default for SetupOptions {
    fn default() -> Self {
        Self {
            test_budget: TEST_BUDGET,
            discover_budget: DISCOVER_BUDGET,
        }
    }
}

/// What [`SetupService::save`] did.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, rename = "SaveOutcome"))]
pub enum Saved {
    /// `projects.json` was written. `issues` are warnings only.
    Saved {
        issues: Vec<ProjectIssue>,
        /// Projects in the file now.
        projects: u32,
    },
    /// Nothing was written: at least one issue is an error.
    Rejected { issues: Vec<ProjectIssue> },
}

struct Active {
    run: SetupRun,
    cancel: CancellationToken,
}

struct Shared {
    transport: Arc<dyn Transport>,
    tools: SshTools,
    store: FsStore,
    events: mpsc::Sender<SetupEvent>,
    options: SetupOptions,
    current: Mutex<Option<Active>>,
    results: Mutex<Vec<HostSetup>>,
    proposal: Mutex<Option<crate::discover::grouping::Proposal>>,
    started: AtomicU32,
}

/// The setup flow. Cheap to clone; clones share the same run.
#[derive(Clone)]
pub struct SetupService {
    shared: Arc<Shared>,
}

impl SetupService {
    /// `tools` are the OpenSSH programs and config `transport` uses (for a
    /// real run, `SshTransport::tools()`); the host list, `ssh -G` and the
    /// host key lookups go through them.
    pub fn new(
        transport: Arc<dyn Transport>,
        tools: SshTools,
        store: FsStore,
        events: mpsc::Sender<SetupEvent>,
    ) -> Self {
        Self::with_options(transport, tools, store, events, SetupOptions::default())
    }

    pub fn with_options(
        transport: Arc<dyn Transport>,
        tools: SshTools,
        store: FsStore,
        events: mpsc::Sender<SetupEvent>,
        options: SetupOptions,
    ) -> Self {
        Self {
            shared: Arc::new(Shared {
                transport,
                tools,
                store,
                events,
                options,
                current: Mutex::new(None),
                results: Mutex::new(Vec::new()),
                proposal: Mutex::new(None),
                started: AtomicU32::new(0),
            }),
        }
    }

    // ------------------------------------------------------------- the hosts

    /// The hosts of `~/.ssh/config` (or the `-F` file), and what was left out.
    pub fn list_hosts(&self) -> Result<HostList, AppError> {
        match ConfigSource::for_tools(&self.shared.tools) {
            Some(source) => list_hosts(&source),
            None => Ok(HostList {
                config_found: false,
                hosts: Vec::new(),
                skipped: Vec::new(),
                empty: Some(crate::ssh::config::EmptyReason::NoConfig),
            }),
        }
    }

    /// The same, with what `ssh -G` says each connection uses.
    pub async fn list_resolved(&self) -> Result<HostListing, AppError> {
        let list = self.list_hosts()?;
        let entries = resolve_all(&self.shared.tools, &list).await;
        Ok(HostListing { list, entries })
    }

    /// Looks at the key of `host` without logging in: what is recorded and
    /// what the host offers. For the "Retry" of the host key screen, after the
    /// user accepted it in Terminal. `None` when `ssh` cannot say what the
    /// connection uses.
    pub async fn host_key(&self, host: &HostAlias) -> Option<HostKeyInfo> {
        let resolved = resolve(&self.shared.tools, host).await?;
        Some(hostkey::check(&self.shared.tools, &resolved).await)
    }

    // ------------------------------------------------------------------ runs

    /// Starts `step` on `hosts` (in this order), or joins the run in progress.
    /// `paths` are project folders the login test asks about (absolute); the
    /// other step ignores them. Must be called inside a Tokio runtime. Config
    /// errors come back here; everything after that arrives as events.
    pub fn start(
        &self,
        step: Step,
        hosts: &[HostAlias],
        paths: &[String],
    ) -> Result<Started, AppError> {
        let sh = &self.shared;
        let mut current = sh
            .current
            .lock()
            .map_err(|_| AppError::from(ErrorCode::StoreBusy))?;
        if let Some(active) = current.as_ref() {
            return Ok(Started {
                setup_id: active.run.setup_id.clone(),
                joined: true,
            });
        }
        let mut hosts = hosts.to_vec();
        let mut seen = std::collections::BTreeSet::new();
        hosts.retain(|h| seen.insert(h.clone()));
        if hosts.is_empty() {
            return Err(ErrorCode::NothingToScan.into());
        }
        let settings = sh.store.load_settings()?.value;
        let invalid = |e: crate::checks::bundle::BundleError| {
            AppError::from(ErrorCode::SchemaInvalid).with_param("detail", e.to_string())
        };
        let (bundle, budget) = match step {
            Step::Test => (
                login_bundle(paths, true).map_err(invalid)?,
                sh.options.test_budget,
            ),
            Step::Discover => (
                discover_bundle(&settings.scan, true).map_err(invalid)?,
                sh.options.discover_budget,
            ),
        };

        let now = OffsetDateTime::now_utc();
        let n = sh.started.fetch_add(1, Ordering::Relaxed);
        let setup_id = format!("{:x}-{n}", now.unix_timestamp_nanos() / 1_000_000);
        let cancel = CancellationToken::new();
        *current = Some(Active {
            run: SetupRun::new(setup_id.clone(), step, Timestamp::new(now), &hosts),
            cancel: cancel.clone(),
        });
        drop(current);
        sh.keep_only(&hosts);

        let connect = Duration::from_secs(u64::from(
            settings
                .scan
                .connect_timeout_s
                .clamp(1, MAX_CONNECT_TIMEOUT_S),
        ));
        let job = Job {
            shared: Arc::clone(sh),
            emitter: Arc::new(Emitter {
                shared: Arc::clone(sh),
                cancel: cancel.clone(),
                setup_id: setup_id.clone(),
                seq: tokio::sync::Mutex::new(0),
            }),
            cancel,
            step,
            hosts,
            bundle: Arc::new(bundle),
            connect,
            budget,
            hosts_at_once: settings.scan.hosts_at_once,
        };
        tokio::spawn(
            job.run()
                .instrument(tracing::info_span!("setup", id = %setup_id)),
        );
        Ok(Started {
            setup_id,
            joined: false,
        })
    }

    /// The run in progress, if any.
    pub fn status(&self) -> Option<SetupRun> {
        self.shared
            .current
            .lock()
            .ok()
            .and_then(|c| c.as_ref().map(|a| a.run.clone()))
    }

    /// What the runs found so far, and the suggested projects.
    pub fn result(&self) -> SetupResult {
        SetupResult {
            hosts: self
                .shared
                .results
                .lock()
                .map(|r| r.clone())
                .unwrap_or_default(),
            proposal: self.shared.proposal.lock().ok().and_then(|p| p.clone()),
        }
    }

    /// Stops the running setup. Returns whether one was running.
    pub fn cancel(&self) -> bool {
        match self.shared.current.lock() {
            Ok(c) => c.as_ref().map(|a| a.cancel.cancel()).is_some(),
            Err(_) => false,
        }
    }

    /// Stops the running setup and kills every `ssh` process group (app
    /// quit, Ctrl-C).
    pub fn shutdown(&self) {
        self.cancel();
        self.shared.transport.kill_all();
    }

    // ---------------------------------------------------------------- saving

    /// What is wrong or doubtful about `projects`, including the ones that
    /// would replace a project already in `projects.json`.
    pub fn validate(&self, projects: &[Project]) -> Vec<ProjectIssue> {
        let known: Option<Vec<HostAlias>> = self
            .list_hosts()
            .ok()
            .filter(|l| l.config_found)
            .map(|l| l.hosts.into_iter().map(|h| h.alias).collect());
        let saved: Vec<String> = self
            .shared
            .store
            .load_projects()
            .map(|s| s.value.projects.into_iter().map(|p| p.id).collect())
            .unwrap_or_default();
        validate(projects, known.as_deref(), &saved)
    }

    /// Saves `projects` into `projects.json`: a project with the id of one in
    /// the file replaces its name, URLs and components (the color and the
    /// threshold overrides it had stay, unless the new one sets its own), the
    /// others are added, and everything else (the other projects, the "mark
    /// as expected" rules, the hosts' settings) stays.
    /// `hosts` are the servers the user picked in setup; they are listed in
    /// Settings › Hosts (included in scans) with the hosts the projects use.
    /// Nothing is written when [`SetupService::validate`] finds an error.
    pub fn save(&self, projects: Vec<Project>, hosts: &[HostAlias]) -> Result<Saved, AppError> {
        let issues = self.validate(&projects);
        if has_errors(&issues) {
            return Ok(Saved::Rejected { issues });
        }
        let stamped = self.shared.store.load_projects()?;
        if stamped.read_only {
            return Err(ErrorCode::ConfigFromNewerVersion {
                path: crate::store::PROJECTS_FILE.to_owned(),
                version: stamped.value.version,
            }
            .into());
        }
        let mut file: ProjectsFile = stamped.value;
        for project in projects.into_iter().map(normalized) {
            for c in &project.components {
                file.hosts.entry(c.host.clone()).or_default();
            }
            match file.projects.iter_mut().find(|p| p.id == project.id) {
                Some(existing) => {
                    let color = project.color.or_else(|| existing.color.take());
                    let overrides = if project.overrides.is_empty() {
                        std::mem::take(&mut existing.overrides)
                    } else {
                        project.overrides
                    };
                    *existing = Project {
                        color,
                        overrides,
                        ..project
                    };
                }
                None => file.projects.push(project),
            }
        }
        for h in hosts {
            file.hosts.entry(h.clone()).or_default();
        }
        self.shared.store.save_projects(&file, stamped.stamp)?;
        Ok(Saved::Saved {
            issues,
            projects: u32::try_from(file.projects.len()).unwrap_or(u32::MAX),
        })
    }
}

impl SetupService {
    /// Takes project `id` out of `projects.json`; everything else in the file,
    /// the "mark as expected" rules included, stays. Scans already saved are
    /// kept. Returns whether the project was there.
    pub fn remove(&self, id: &str) -> Result<bool, AppError> {
        let stamped = self.shared.store.load_projects()?;
        if stamped.read_only {
            return Err(ErrorCode::ConfigFromNewerVersion {
                path: crate::store::PROJECTS_FILE.to_owned(),
                version: stamped.value.version,
            }
            .into());
        }
        let mut file: ProjectsFile = stamped.value;
        let before = file.projects.len();
        file.projects.retain(|p| p.id != id);
        if file.projects.len() == before {
            return Ok(false);
        }
        self.shared.store.save_projects(&file, stamped.stamp)?;
        Ok(true)
    }
}

impl Shared {
    /// A new run starts from the hosts it is given: what earlier runs found
    /// about other hosts is dropped (it would otherwise feed the suggestions),
    /// what they found about these hosts stays until the run replaces it.
    fn keep_only(&self, hosts: &[HostAlias]) {
        if let Ok(mut results) = self.results.lock() {
            let mut kept: Vec<HostSetup> = hosts
                .iter()
                .map(|h| {
                    results
                        .iter()
                        .find(|r| &r.host == h)
                        .cloned()
                        .unwrap_or_else(|| HostSetup::new(h.clone()))
                })
                .collect();
            std::mem::swap(&mut *results, &mut kept);
        }
    }

    fn update(&self, host: &HostAlias, f: impl FnOnce(&mut HostSetup)) {
        if let Ok(mut results) = self.results.lock()
            && let Some(entry) = results.iter_mut().find(|r| &r.host == host)
        {
            f(entry);
        }
    }

    /// Suggestions from every host that has been discovered.
    fn regroup(&self) {
        let found: Vec<(HostAlias, HostDiscovery)> = self
            .results
            .lock()
            .map(|r| {
                r.iter()
                    .filter_map(|h| h.discovery.clone().map(|d| (h.host.clone(), d)))
                    .collect()
            })
            .unwrap_or_default();
        if let Ok(mut proposal) = self.proposal.lock() {
            *proposal = (!found.is_empty()).then(|| group(&found));
        }
    }
}

/// Stamps events with the run id and a rising `seq`, keeps the status in step.
/// Once the run is cancelled, an event that cannot be queued is dropped
/// instead of waited on, so a stuck listener never blocks a cancel.
struct Emitter {
    shared: Arc<Shared>,
    cancel: CancellationToken,
    setup_id: String,
    seq: tokio::sync::Mutex<u32>,
}

impl Emitter {
    async fn emit(&self, body: SetupEventBody) {
        // Held across the send so events leave in `seq` order.
        let mut seq = self.seq.lock().await;
        if let Ok(mut c) = self.shared.current.lock()
            && let Some(a) = c.as_mut()
        {
            a.run.apply(*seq, &body);
        }
        let event = SetupEvent {
            setup_id: self.setup_id.clone(),
            seq: *seq,
            body,
        };
        *seq += 1;
        tokio::select! {
            biased;
            _ = self.shared.events.send(event) => {}
            _ = self.cancel.cancelled() => {}
        }
    }
}

struct Job {
    shared: Arc<Shared>,
    emitter: Arc<Emitter>,
    cancel: CancellationToken,
    step: Step,
    hosts: Vec<HostAlias>,
    bundle: Arc<Bundle>,
    connect: Duration,
    budget: Duration,
    hosts_at_once: Option<u32>,
}

impl Job {
    async fn run(self) {
        let sem = Arc::new(Semaphore::new(concurrency(
            self.hosts_at_once,
            self.hosts.len(),
        )));
        let mut tasks = JoinSet::new();
        for host in &self.hosts {
            let task = HostTask {
                shared: Arc::clone(&self.shared),
                emitter: Arc::clone(&self.emitter),
                cancel: self.cancel.clone(),
                step: self.step,
                bundle: Arc::clone(&self.bundle),
                req: RunRequest {
                    host: host.clone(),
                    script: self.bundle.text.clone(),
                    connect_timeout: self.connect,
                    budget: self.budget,
                },
            };
            let sem = Arc::clone(&sem);
            let span = tracing::info_span!("host", host = %host);
            tasks.spawn(
                async move {
                    let _permit = tokio::select! {
                        p = sem.acquire_owned() => p.ok()?,
                        _ = task.cancel.cancelled() => return None,
                    };
                    task.run().await
                }
                .instrument(span),
            );
        }
        let mut broken = false;
        while let Some(joined) = tasks.join_next().await {
            if let Err(e) = joined {
                tracing::error!(error = %e, "setup host task failed");
                broken = true;
            }
        }
        let body = if self.cancel.is_cancelled() {
            SetupEventBody::Cancelled
        } else {
            // What the other hosts found is still kept and suggested from.
            self.shared.regroup();
            if broken {
                // A host that never reports `host_finished` must not leave
                // a listener waiting: the run ends with an error instead.
                SetupEventBody::Failed {
                    error: ErrorCode::Internal.into(),
                }
            } else {
                SetupEventBody::Done
            }
        };
        // Cleared first, so a listener reacting to the last event can start the next run.
        if let Ok(mut c) = self.shared.current.lock() {
            *c = None;
        }
        self.emitter.emit(body).await;
    }
}

struct HostTask {
    shared: Arc<Shared>,
    emitter: Arc<Emitter>,
    cancel: CancellationToken,
    step: Step,
    bundle: Arc<Bundle>,
    req: RunRequest,
}

/// What a host's run gave back.
struct Ran {
    outcome: HostOutcome,
    records: Vec<SetupRecord>,
    dropped: u32,
}

impl HostTask {
    /// `None` when the run was cancelled.
    async fn run(self) -> Option<()> {
        let host = self.req.host.clone();
        self.emitter
            .emit(SetupEventBody::HostStarted { host: host.clone() })
            .await;
        let started = Instant::now();
        let tools = &self.shared.tools;
        let resolved = tokio::select! {
            biased;
            _ = self.cancel.cancelled() => return None,
            r = resolve(tools, &host) => r,
        };
        // The budget counts from here: `ssh -G` is not the server's time.
        let ran = self.drive(&host, Instant::now()).await?;

        let mut outcome = ran.outcome;
        let mut host_key = None;
        let key_fp = match &outcome {
            HostOutcome::HostKeyUnknown { fp } | HostOutcome::HostKeyChanged { fp } => {
                Some(fp.clone())
            }
            _ => None,
        };
        if let Some(fp) = key_fp {
            // Up to a dozen seconds per lookup; a cancel does not wait for them.
            let (info, merged) = tokio::select! {
                biased;
                _ = self.cancel.cancelled() => return None,
                r = self.host_key_info(&outcome, &fp, resolved.as_ref()) => r,
            };
            outcome = match outcome {
                HostOutcome::HostKeyChanged { .. } => HostOutcome::HostKeyChanged { fp: merged },
                _ => HostOutcome::HostKeyUnknown { fp: merged },
            };
            self.emitter
                .emit(SetupEventBody::HostKey {
                    host: host.clone(),
                    info: info.clone(),
                })
                .await;
            host_key = Some(info);
        }

        let items = u32::try_from(ran.records.len()).unwrap_or(u32::MAX);
        let step = self.step;
        let kept = outcome.answered() || outcome == HostOutcome::Timeout;
        let finished = outcome.clone();
        self.shared.update(&host, |h| {
            h.outcome = Some(finished);
            h.resolved = resolved;
            h.host_key = host_key;
            match step {
                Step::Test => h.login = kept.then(|| LoginResult::from_records(ran.records)),
                Step::Discover => {
                    h.discovery = kept.then(|| HostDiscovery::from_records(ran.records));
                }
            }
        });
        let ms = u32::try_from(started.elapsed().as_millis()).unwrap_or(u32::MAX);
        tracing::info!(
            ?outcome,
            ms,
            items,
            dropped = ran.dropped,
            "setup host finished"
        );
        self.emitter
            .emit(SetupEventBody::HostFinished {
                host,
                outcome,
                ms,
                items,
                dropped: ran.dropped,
            })
            .await;
        Some(())
    }

    /// Runs the script and reads its records. `None` when cancelled.
    async fn drive(&self, host: &HostAlias, t0: Instant) -> Option<Ran> {
        let budget = self.req.budget;
        let (tx, mut rx) = mpsc::channel::<RunSignal>(64);
        let mut parser = RecordParser::for_bundle(&self.bundle);
        let mut records: Vec<SetupRecord> = Vec::new();
        let run = self.shared.transport.run(&self.req, tx);
        tokio::pin!(run);
        let mut end: Option<RunEnd> = None;
        let mut rx_done = false;
        let mut first_output: Option<Instant> = None;
        let mut timed_out = false;
        let mut agent_wait = false;
        let mut running = false;
        loop {
            if rx_done && end.is_some() {
                break;
            }
            let deadline = first_output.unwrap_or(t0) + budget;
            tokio::select! {
                biased;
                _ = self.cancel.cancelled() => return None,
                sig = rx.recv(), if !rx_done => match sig {
                    Some(RunSignal::Stdout(chunk)) => {
                        first_output.get_or_insert_with(Instant::now);
                        let found = parser.feed(&chunk);
                        if parser.begun() && !running {
                            running = true;
                            self.emitter.emit(SetupEventBody::HostRunning { host: host.clone() }).await;
                        }
                        for item in found {
                            records.push(item.clone());
                            self.emitter
                                .emit(SetupEventBody::Item { host: host.clone(), item })
                                .await;
                        }
                    }
                    Some(RunSignal::AgentWait) => {
                        if first_output.is_none() && !agent_wait {
                            agent_wait = true;
                            self.emitter.emit(SetupEventBody::AgentWait { host: host.clone() }).await;
                        }
                    }
                    None => rx_done = true,
                },
                e = &mut run, if end.is_none() => end = Some(e),
                _ = tokio::time::sleep_until(deadline) => {
                    timed_out = true;
                    break;
                }
            }
        }
        let began = parser.begun();
        let output = parser.finish();
        let end = end.unwrap_or_default();
        Some(Ran {
            outcome: run_outcome(output.ended, began, &end, timed_out),
            records,
            dropped: output.dropped,
        })
    }

    /// The key screen's data: the keys recorded for the host and the one it
    /// offers. ssh decided the state; the offered key is the one `ssh-keyscan`
    /// read, else the one the transport read through the user's own route
    /// (ProxyJump applies there). Returns the offered key too.
    async fn host_key_info(
        &self,
        outcome: &HostOutcome,
        transport_fp: &str,
        resolved: Option<&ResolvedHost>,
    ) -> (HostKeyInfo, String) {
        let looked = match resolved {
            Some(r) => Some(hostkey::check(&self.shared.tools, r).await),
            None => None,
        };
        let offered = looked
            .as_ref()
            .and_then(|i| i.offered.clone())
            .or_else(|| (!transport_fp.is_empty()).then(|| transport_fp.to_owned()));
        let state = match outcome {
            HostOutcome::HostKeyChanged { .. } => HostKeyState::Changed,
            _ => HostKeyState::Unknown,
        };
        let info = HostKeyInfo {
            state,
            offered: offered.clone(),
            known: looked.map(|i| i.known).unwrap_or_default(),
        };
        (info, offered.unwrap_or_default())
    }
}

#[cfg(test)]
mod tests;
