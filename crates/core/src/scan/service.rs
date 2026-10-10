//! `ScanService`: the only owner of the scan in progress.
//!
//! One scan at a time (a second `start` joins the running one). Every host
//! runs the bundle at once, up to `hosts_at_once` (Auto = number of hosts,
//! at most 8), while the URL probes run from this Mac. Events stream out with
//! a rising `seq`; when every host is done the raw snapshot is saved. A
//! cancelled scan is never saved, so the next delta compares against the last
//! complete one.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use time::OffsetDateTime;
use tokio::sync::{Semaphore, mpsc};
use tokio::task::JoinSet;
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;
use tracing::Instrument as _;

use super::event::{ScanEvent, ScanEventBody, ScanRun};
use super::report::record_scan_streak;
use super::targets::{ScanScope, ScanTargets, resolve};
use crate::checks::bundle::{self, Bundle, BundleVars, Selection};
use crate::checks::manifest;
use crate::checks::ndjson::{HostOutput, Line, Parser};
use crate::domain::datetime::Timestamp;
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::fact::CheckFact;
use crate::domain::host::{HostAlias, HostRef};
use crate::domain::manifest::CheckGroup;
use crate::domain::project::ProjectsFile;
use crate::domain::settings::Settings;
use crate::domain::snapshot::{HostOutcome, HostTiming, NetCause, Snapshot};
use crate::probe::{ProbeChecks, UrlProbe};
use crate::ssh::config::KnownAliases;
use crate::ssh::{RunEnd, RunRequest, RunSignal, Transport, outcome_error, run_outcome};
use crate::store::FsStore;

/// Time each reachable host has for its bundle, from its first byte of
/// output. Before any output (connect, SSH agent approval) it has as long again.
pub const HOST_BUDGET: Duration = Duration::from_secs(90);
/// Most hosts scanned at once, whatever the setting says.
pub const MAX_HOSTS_AT_ONCE: usize = 8;
/// Longest connect timeout honoured, in seconds.
pub(crate) const MAX_CONNECT_TIMEOUT_S: u32 = 120;

/// The aliases `~/.ssh/config` defines, read once per scan; `None` when the
/// file cannot tell (then every host runs, as before).
pub type ConfigHosts = Arc<dyn Fn() -> Option<KnownAliases> + Send + Sync>;

/// Knobs that are not user settings. Tests shorten the budget.
#[derive(Clone)]
pub struct ServiceOptions {
    pub host_budget: Duration,
    /// When set, a host whose alias is not in the config and fails as a DNS
    /// name ends as `NotInConfig` instead of unreachable.
    pub config_hosts: Option<ConfigHosts>,
}

impl std::fmt::Debug for ServiceOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServiceOptions")
            .field("host_budget", &self.host_budget)
            .field("config_hosts", &self.config_hosts.is_some())
            .finish()
    }
}

impl Default for ServiceOptions {
    fn default() -> Self {
        Self {
            host_budget: HOST_BUDGET,
            config_hosts: None,
        }
    }
}

/// What `start` did.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, rename = "ScanStarted"))]
pub struct Started {
    pub scan_id: String,
    /// A scan was already running; this is its id and nothing new started.
    pub joined: bool,
}

struct Active {
    run: ScanRun,
    cancel: CancellationToken,
}

struct Shared {
    transport: Arc<dyn Transport>,
    probe: Arc<dyn UrlProbe>,
    store: FsStore,
    events: mpsc::Sender<ScanEvent>,
    options: ServiceOptions,
    current: Mutex<Option<Active>>,
    started: AtomicU32,
}

/// Runs scans. Cheap to clone; clones share the same scan.
#[derive(Clone)]
pub struct ScanService {
    shared: Arc<Shared>,
}

impl ScanService {
    pub fn new(
        transport: Arc<dyn Transport>,
        probe: Arc<dyn UrlProbe>,
        store: FsStore,
        events: mpsc::Sender<ScanEvent>,
    ) -> Self {
        Self::with_options(transport, probe, store, events, ServiceOptions::default())
    }

    pub fn with_options(
        transport: Arc<dyn Transport>,
        probe: Arc<dyn UrlProbe>,
        store: FsStore,
        events: mpsc::Sender<ScanEvent>,
        options: ServiceOptions,
    ) -> Self {
        Self {
            shared: Arc::new(Shared {
                transport,
                probe,
                store,
                events,
                options,
                current: Mutex::new(None),
                started: AtomicU32::new(0),
            }),
        }
    }

    /// Starts a scan of `scope`, or joins the one already running. Must be
    /// called inside a Tokio runtime. Config and bundle errors come back
    /// here; everything after that arrives as events.
    pub fn start(&self, scope: &ScanScope) -> Result<Started, AppError> {
        let sh = &self.shared;
        let mut current = sh
            .current
            .lock()
            .map_err(|_| AppError::from(ErrorCode::StoreBusy))?;
        if let Some(active) = current.as_ref() {
            return Ok(Started {
                scan_id: active.run.scan_id.clone(),
                joined: true,
            });
        }
        let projects = sh.store.load_projects()?.value;
        let settings = sh.store.load_settings()?.value;
        let mut targets = resolve(&projects, scope)?;
        // Status and certificate are the `uptime` group, exposed files the
        // `security` group; with both off, no URL is probed.
        let uptime = settings.scan.group_enabled(CheckGroup::Uptime);
        let probe_checks = ProbeChecks {
            http: uptime,
            tls: uptime,
            exposed: settings.scan.group_enabled(CheckGroup::Security),
        };
        if !probe_checks.any() {
            targets.urls.clear();
        }
        if targets.is_empty() {
            return Err(ErrorCode::NothingToScan.into());
        }
        let (bundle, scripts) = build_bundles(&settings, &projects, &targets.hosts)?;

        let now = OffsetDateTime::now_utc();
        let n = sh.started.fetch_add(1, Ordering::Relaxed);
        let scan_id = format!("{:x}-{n}", now.unix_timestamp_nanos() / 1_000_000);
        let started_at = Timestamp::new(now);
        let cancel = CancellationToken::new();
        let mut listed: Vec<HostRef> = targets.hosts.iter().cloned().map(HostRef::Alias).collect();
        if !targets.urls.is_empty() {
            listed.push(HostRef::Local);
        }
        *current = Some(Active {
            run: ScanRun::new(scan_id.clone(), started_at, listed),
            cancel: cancel.clone(),
        });
        drop(current);

        let job = Job {
            shared: Arc::clone(sh),
            emitter: Arc::new(Emitter {
                shared: Arc::clone(sh),
                cancel: cancel.clone(),
                scan_id: scan_id.clone(),
                seq: tokio::sync::Mutex::new(0),
            }),
            cancel,
            started_at,
            targets,
            probe_checks,
            bundle: Arc::new(bundle),
            scripts,
            settings,
        };
        tokio::spawn(
            job.run()
                .instrument(tracing::info_span!("scan", id = %scan_id)),
        );
        Ok(Started {
            scan_id,
            joined: false,
        })
    }

    /// The scan in progress, if any.
    pub fn status(&self) -> Option<ScanRun> {
        self.shared
            .current
            .lock()
            .ok()
            .and_then(|c| c.as_ref().map(|a| a.run.clone()))
    }

    /// Stops the running scan. Returns whether one was running.
    pub fn cancel(&self) -> bool {
        match self.shared.current.lock() {
            Ok(c) => c.as_ref().map(|a| a.cancel.cancel()).is_some(),
            Err(_) => false,
        }
    }

    /// Stops the running scan and kills every `ssh` process group. The app
    /// calls this on quit, the dev CLI on Ctrl-C.
    pub fn shutdown(&self) {
        self.cancel();
        self.shared.transport.kill_all();
    }
}

/// How many of `hosts` run at once: Settings › Scan `hosts_at_once`, or one
/// per host when it is Auto, kept between 1 and [`MAX_HOSTS_AT_ONCE`].
pub(crate) fn concurrency(hosts_at_once: Option<u32>, hosts: usize) -> usize {
    let n = match hosts_at_once {
        Some(n) => usize::try_from(n).unwrap_or(MAX_HOSTS_AT_ONCE),
        None => hosts,
    };
    n.clamp(1, MAX_HOSTS_AT_ONCE)
}

/// The bundle every host runs, and its text per host: the checks and the
/// hash are the same everywhere, only the variables naming that host's
/// components differ.
pub fn build_bundles(
    settings: &Settings,
    projects: &ProjectsFile,
    hosts: &[HostAlias],
) -> Result<(Bundle, HashMap<HostAlias, String>), AppError> {
    let invalid =
        |what: String| AppError::from(ErrorCode::SchemaInvalid).with_param("detail", what);
    let m = manifest().map_err(|e| invalid(format!("manifest: {e}")))?;
    let mut vars = BundleVars::from_scan(&settings.scan).map_err(|e| invalid(e.to_string()))?;
    // Transports keep stdin open, so the bundle can stop when the client goes away.
    vars.set(bundle::HANGUP_VAR, "1")
        .map_err(|e| invalid(e.to_string()))?;
    let selection = Selection {
        disabled_groups: settings.scan.disabled_groups.clone(),
        only: None,
    };
    let base = bundle::build(&m, &selection, &vars).map_err(|e| invalid(e.to_string()))?;
    let mut scripts = HashMap::new();
    for host in hosts {
        let mut host_vars = vars.clone();
        host_vars
            .add_components(projects, host)
            .map_err(|e| invalid(e.to_string()))?;
        let b = bundle::build(&m, &selection, &host_vars).map_err(|e| invalid(e.to_string()))?;
        scripts.insert(host.clone(), b.text);
    }
    Ok((base, scripts))
}

/// Stamps events with the scan id and a rising `seq`, keeps the status in step.
///
/// The event receiver must be drained continuously: a full channel slows the
/// scan down. Once the scan is cancelled, an event that cannot be queued is
/// dropped instead of waited on, so a stuck listener never blocks a cancel.
struct Emitter {
    shared: Arc<Shared>,
    cancel: CancellationToken,
    scan_id: String,
    seq: tokio::sync::Mutex<u32>,
}

impl Emitter {
    async fn emit(&self, body: ScanEventBody) {
        // Held across the send so events leave in `seq` order.
        let mut seq = self.seq.lock().await;
        if let Ok(mut c) = self.shared.current.lock()
            && let Some(a) = c.as_mut()
        {
            a.run.apply(*seq, &body);
        }
        let event = ScanEvent {
            scan_id: self.scan_id.clone(),
            seq: *seq,
            body,
        };
        *seq += 1;
        // A listener that went away does not stop the scan.
        tokio::select! {
            biased;
            _ = self.shared.events.send(event) => {}
            _ = self.cancel.cancelled() => {}
        }
    }
}

/// One host's result.
struct HostResult {
    host: HostAlias,
    outcome: HostOutcome,
    output: HostOutput,
    ms: u32,
}

/// The URL probes' result.
struct LocalResult {
    facts: Vec<CheckFact>,
    /// Every URL failed at the network level.
    all_network: bool,
    ms: u32,
}

struct Job {
    shared: Arc<Shared>,
    emitter: Arc<Emitter>,
    cancel: CancellationToken,
    started_at: Timestamp,
    targets: ScanTargets,
    /// Which URL checks run (by group enabled in Settings).
    probe_checks: ProbeChecks,
    bundle: Arc<Bundle>,
    /// The bundle text per host (see [`build_bundles`]).
    scripts: HashMap<HostAlias, String>,
    settings: Settings,
}

impl Job {
    fn concurrency(&self) -> usize {
        concurrency(self.settings.scan.hosts_at_once, self.targets.hosts.len())
    }

    async fn run(self) {
        let sem = Arc::new(Semaphore::new(self.concurrency()));
        let connect = Duration::from_secs(u64::from(
            self.settings
                .scan
                .connect_timeout_s
                .clamp(1, MAX_CONNECT_TIMEOUT_S),
        ));
        let mut hosts = JoinSet::new();
        // Read off the runtime: the config and its includes are files.
        let known = match self.shared.options.config_hosts.clone() {
            Some(read) => match tokio::task::spawn_blocking(move || read()).await {
                Ok(known) => known.map(Arc::new),
                Err(e) => {
                    tracing::warn!(error = %e, "reading the ssh config's aliases failed");
                    None
                }
            },
            None => None,
        };
        for host in &self.targets.hosts {
            let task = HostTask {
                shared: Arc::clone(&self.shared),
                emitter: Arc::clone(&self.emitter),
                cancel: self.cancel.clone(),
                bundle: Arc::clone(&self.bundle),
                known: known.clone(),
                req: RunRequest {
                    host: host.clone(),
                    script: self
                        .scripts
                        .get(host)
                        .cloned()
                        .unwrap_or_else(|| self.bundle.text.clone()),
                    connect_timeout: connect,
                    budget: self.shared.options.host_budget,
                },
            };
            let sem = Arc::clone(&sem);
            let span = tracing::info_span!("host", host = %host);
            hosts.spawn(
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
        let local = (!self.targets.urls.is_empty()).then(|| {
            tokio::spawn(probe_urls(
                Arc::clone(&self.shared),
                Arc::clone(&self.emitter),
                self.cancel.clone(),
                self.targets.urls.clone(),
                self.probe_checks,
            ))
        });

        let mut results = Vec::new();
        while let Some(joined) = hosts.join_next().await {
            match joined {
                Ok(Some(r)) => results.push(r),
                Ok(None) => {}
                Err(e) => tracing::error!(error = %e, "host task failed"),
            }
        }
        let local = match local {
            Some(handle) => handle.await.ok().flatten(),
            None => None,
        };

        if self.cancel.is_cancelled() {
            self.finish(ScanEventBody::Cancelled).await;
            return;
        }
        if local_network_down(&results, local.as_ref(), self.targets.urls.len()) {
            tracing::warn!("every host and URL failed at the network level");
            self.finish(ScanEventBody::Failed {
                error: ErrorCode::LocalNetworkDown.into(),
            })
            .await;
            return;
        }

        let snapshot = self.snapshot(results, local);
        let store = self.shared.store.clone();
        let keep = self.settings.data.keep_scans;
        let saved = tokio::task::spawn_blocking(move || {
            let seq = store.save_snapshot(snapshot, keep)?;
            // The streak is bookkeeping: a failure to record it never fails the scan.
            if let Err(e) = record_scan_streak(&store, Timestamp::new(OffsetDateTime::now_utc())) {
                tracing::warn!(error = %e, "clear-week streak not recorded");
            }
            Ok::<u32, AppError>(seq)
        })
        .await;
        let body = match saved {
            Ok(Ok(seq)) => ScanEventBody::Done { snapshot_seq: seq },
            Ok(Err(error)) => ScanEventBody::Failed { error },
            Err(_) => ScanEventBody::Failed {
                error: AppError::from(ErrorCode::Io {
                    path: "snapshots".into(),
                }),
            },
        };
        self.finish(body).await;
    }

    fn snapshot(&self, results: Vec<HostResult>, local: Option<LocalResult>) -> Snapshot {
        let mut snap = Snapshot::new(self.started_at, Timestamp::new(OffsetDateTime::now_utc()));
        if !self.targets.hosts.is_empty() {
            snap.bundle_hash = self.bundle.hash.clone();
        }
        for r in results {
            let host = HostRef::Alias(r.host);
            if r.outcome.answered() || r.outcome == HostOutcome::Timeout {
                if !r.output.coverage.is_empty() {
                    snap.coverage.insert(host.clone(), r.output.coverage);
                }
                if !r.output.facts.is_empty() {
                    snap.facts.insert(host.clone(), r.output.facts);
                }
            }
            snap.timing.insert(
                host.clone(),
                HostTiming {
                    ms: r.ms,
                    steps: r
                        .output
                        .step_ms
                        .iter()
                        .map(|(g, ms)| (*g, u32::try_from(*ms).unwrap_or(u32::MAX)))
                        .collect(),
                },
            );
            snap.hosts.insert(host, r.outcome);
        }
        if let Some(l) = local {
            snap.hosts.insert(HostRef::Local, HostOutcome::Reached);
            // A group is covered on this Mac when its probes ran: `uptime`
            // for status and certificate, `security` for exposed files.
            let covered = [
                (
                    self.probe_checks.http || self.probe_checks.tls,
                    CheckGroup::Uptime,
                ),
                (self.probe_checks.exposed, CheckGroup::Security),
            ]
            .into_iter()
            .filter_map(|(ran, group)| ran.then_some(group))
            .collect();
            snap.coverage.insert(HostRef::Local, covered);
            snap.timing.insert(
                HostRef::Local,
                HostTiming {
                    ms: l.ms,
                    steps: Default::default(),
                },
            );
            if !l.facts.is_empty() {
                snap.facts.insert(HostRef::Local, l.facts);
            }
        }
        snap
    }

    /// Clears the running scan first, so a listener reacting to the last
    /// event can start the next scan straight away.
    async fn finish(&self, body: ScanEventBody) {
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
    bundle: Arc<Bundle>,
    /// The aliases the ssh config defines, when it could be read.
    known: Option<Arc<KnownAliases>>,
    req: RunRequest,
}

impl HostTask {
    /// `None` when the scan was cancelled.
    async fn run(self) -> Option<HostResult> {
        let host = HostRef::Alias(self.req.host.clone());
        self.emitter
            .emit(ScanEventBody::HostStarted { host: host.clone() })
            .await;
        let t0 = Instant::now();
        let budget = self.req.budget;
        let (tx, mut rx) = mpsc::channel::<RunSignal>(64);
        let mut parser = Parser::for_bundle(&self.bundle);
        let run = self.shared.transport.run(&self.req, tx);
        tokio::pin!(run);
        let mut end: Option<RunEnd> = None;
        let mut rx_done = false;
        let mut first_output: Option<Instant> = None;
        let mut timed_out = false;
        let mut agent_wait = false;
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
                        for line in parser.feed(&chunk) {
                            self.forward(&host, line).await;
                        }
                    }
                    Some(RunSignal::AgentWait) => {
                        if first_output.is_none() && !agent_wait {
                            agent_wait = true;
                            self.emitter.emit(ScanEventBody::AgentWait { host: host.clone() }).await;
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
        let output = parser.finish();
        let end = end.unwrap_or_default();
        let outcome = not_in_config(
            decide(&output, &end, timed_out),
            self.known.as_deref(),
            &self.req.host,
        );
        let ms = millis(t0);
        tracing::info!(
            exit = ?end.exit,
            error = ?outcome_error(&outcome),
            ms,
            facts = output.facts.len(),
            dropped = output.dropped,
            truncated = output.truncated,
            "host finished"
        );
        self.emitter
            .emit(ScanEventBody::HostFinished {
                host,
                outcome: outcome.clone(),
                ms,
                facts: u32::try_from(output.facts.len()).unwrap_or(u32::MAX),
                dropped: output.dropped,
            })
            .await;
        Some(HostResult {
            host: self.req.host.clone(),
            outcome,
            output,
            ms,
        })
    }

    async fn forward(&self, host: &HostRef, line: Line) {
        let body = match line {
            Line::Fact(fact) => ScanEventBody::Fact {
                host: host.clone(),
                fact,
            },
            Line::Step { group, ms } => ScanEventBody::Step {
                host: host.clone(),
                group,
                ms: u32::try_from(ms).unwrap_or(u32::MAX),
            },
            Line::Begin { .. } => ScanEventBody::HostRunning { host: host.clone() },
            Line::End => return,
        };
        self.emitter.emit(body).await;
    }
}

/// An alias the config no longer defines is looked up as a DNS name, and
/// fails there: say it is not in the config rather than unreachable. ssh ran
/// either way, so a host it reached without a `Host` line keeps its outcome.
fn not_in_config(
    outcome: HostOutcome,
    known: Option<&KnownAliases>,
    host: &HostAlias,
) -> HostOutcome {
    let dns = matches!(
        outcome,
        HostOutcome::Unreachable {
            cause: NetCause::Dns
        }
    );
    // A DNS name or an address names the server itself, not a config entry.
    let named = host.as_str().contains('.') || host.as_str().parse::<std::net::IpAddr>().is_ok();
    if dns && !named && known.is_some_and(|k| !k.contains(host.as_str())) {
        HostOutcome::NotInConfig
    } else {
        outcome
    }
}

/// Every host failed with DNS/no route and every URL failed at the network
/// level. One failing target says nothing about this Mac (a mistyped
/// HostName, a VPN that is down), so at least two targets must have failed;
/// that host or URL is then saved with its own outcome instead. An alias gone
/// from the config also failed on DNS, so it does not clear the Mac, but it
/// is not counted: a deleted config would otherwise read as "offline".
fn local_network_down(results: &[HostResult], local: Option<&LocalResult>, urls: usize) -> bool {
    let network = |o: &HostOutcome| {
        matches!(
            o,
            HostOutcome::Unreachable {
                cause: NetCause::Dns | NetCause::NoRoute
            }
        )
    };
    let hosts_down = results
        .iter()
        .all(|r| network(&r.outcome) || r.outcome == HostOutcome::NotInConfig);
    let urls_down = local.is_none_or(|l| l.all_network);
    let failed = results.iter().filter(|r| network(&r.outcome)).count() + urls;
    hosts_down && urls_down && failed >= 2
}

/// How a host's part ended (see [`run_outcome`]).
fn decide(output: &HostOutput, end: &RunEnd, timed_out: bool) -> HostOutcome {
    run_outcome(output.ended, output.bundle.is_some(), end, timed_out)
}

async fn probe_urls(
    shared: Arc<Shared>,
    emitter: Arc<Emitter>,
    cancel: CancellationToken,
    urls: Vec<String>,
    checks: ProbeChecks,
) -> Option<LocalResult> {
    let host = HostRef::Local;
    emitter
        .emit(ScanEventBody::HostStarted { host: host.clone() })
        .await;
    let t0 = Instant::now();
    let mut set = JoinSet::new();
    for url in urls {
        let probe = Arc::clone(&shared.probe);
        set.spawn(async move { probe.probe(&url, checks).await });
    }
    let mut facts = Vec::new();
    let mut all_network = true;
    loop {
        let next = tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                set.abort_all();
                return None;
            }
            next = set.join_next() => next,
        };
        let Some(joined) = next else { break };
        let Ok(result) = joined else {
            all_network = false;
            continue;
        };
        all_network &= result.error.is_some_and(|e| e.is_network());
        for fact in result.facts {
            emitter
                .emit(ScanEventBody::Fact {
                    host: host.clone(),
                    fact: fact.clone(),
                })
                .await;
            facts.push(fact);
        }
    }
    let ms = millis(t0);
    emitter
        .emit(ScanEventBody::HostFinished {
            host,
            outcome: HostOutcome::Reached,
            ms,
            facts: u32::try_from(facts.len()).unwrap_or(u32::MAX),
            dropped: 0,
        })
        .await;
    Some(LocalResult {
        facts,
        all_network,
        ms,
    })
}

/// Milliseconds since `t0`, saturating.
fn millis(t0: Instant) -> u32 {
    u32::try_from(t0.elapsed().as_millis()).unwrap_or(u32::MAX)
}
