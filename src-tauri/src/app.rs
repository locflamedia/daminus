//! The app's state and what every command does, as plain Rust functions.
//!
//! `commands.rs` only adapts these to Tauri, so tests drive the same code
//! with a fake transport and no webview.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use daminus_core::ai::view::AiStreamEvent;
use daminus_core::data::{self, DataUsage};
use daminus_core::diagnostics::{self, Diagnostics, DiagnosticsSource};
use daminus_core::domain::app_state::{LaunchInfo, LaunchKind, StreakInfo, launch_kind};
use daminus_core::domain::datetime::Timestamp;
use daminus_core::domain::error::{AppError, ErrorCode};
use daminus_core::domain::evaluate::Report;
use daminus_core::domain::expected::ExpectedRule;
use daminus_core::domain::host::HostAlias;
use daminus_core::domain::project::Project;
use daminus_core::domain::project::ProjectsFile;
use daminus_core::domain::settings::{
    AiSettings, AppearanceSettings, DataSettings, GeneralSettings, ScanSettings, Settings,
};
use daminus_core::probe::UrlProbe;
use daminus_core::scan::{ConfigHosts, ServiceOptions};
use daminus_core::scan::{
    ExpectedDraft, HistoryView, ScanEvent, ScanFact, ScanRun, ScanScope, ScanService, Started,
    add_rule, excluded_hosts, history_facts, history_view, latest_report, remove_rule, report_at,
    set_host_included,
};
use daminus_core::setup::{
    AgentStatus, Saved, SetupEvent, SetupResult, SetupRun, SetupService, SshEnvironment, Step,
    UrlCheck, check_url,
};
use daminus_core::ssh::config::HostListing;
use daminus_core::ssh::config::{ConfigSource, KnownAliases, list_hosts};
use daminus_core::ssh::hostkey::HostKeyInfo;
use daminus_core::ssh::{SshTools, Transport};
use daminus_core::store::FsStore;
use tokio::sync::mpsc;

use crate::ai::AiRuntime;

/// The one event channel the webview listens to.
pub const SCAN_EVENT: &str = "scan://event";

/// The event channel of the setup flow.
pub const SETUP_EVENT: &str = "setup://event";

/// Room for events between the scan and the pump that forwards them.
const EVENT_BUFFER: usize = 1024;

/// Store, scan service and setup flow, shared by commands, the tray and quit handling.
#[derive(Clone)]
pub struct AppCore {
    pub(crate) store: FsStore,
    service: ScanService,
    setup: SetupService,
    probe: Arc<dyn UrlProbe>,
    tools: SshTools,
    log_file: Option<PathBuf>,
    pub(crate) ai: AiRuntime,
}

/// The receivers of the two event streams; each must be drained continuously
/// (see [`pump`]).
pub struct AppEvents {
    pub scan: mpsc::Receiver<ScanEvent>,
    pub setup: mpsc::Receiver<SetupEvent>,
    pub ai: mpsc::Receiver<AiStreamEvent>,
}

impl AppCore {
    /// Builds the core over `store`. `tools` are the OpenSSH programs and
    /// config `transport` uses (the setup flow reads the same ssh config).
    pub fn new(
        transport: Arc<dyn Transport>,
        tools: SshTools,
        probe: Arc<dyn UrlProbe>,
        store: FsStore,
    ) -> (Self, AppEvents) {
        let (tx, rx) = mpsc::channel(EVENT_BUFFER);
        let (setup_tx, setup_rx) = mpsc::channel(EVENT_BUFFER);
        // Each scan reads the ssh config's aliases once, so a host that is no
        // longer in it is not run and reads "Not in ~/.ssh/config".
        let config_tools = tools.clone();
        let config_hosts: ConfigHosts = Arc::new(move || {
            let source = ConfigSource::for_tools(&config_tools)?;
            KnownAliases::of(&list_hosts(&source).ok()?)
        });
        let service = ScanService::with_options(
            Arc::clone(&transport),
            Arc::clone(&probe),
            store.clone(),
            tx,
            ServiceOptions {
                config_hosts: Some(config_hosts),
                ..ServiceOptions::default()
            },
        );
        let (ai_tx, ai_rx) = mpsc::channel(EVENT_BUFFER);
        let setup = SetupService::new(transport, tools.clone(), store.clone(), setup_tx);
        (
            Self {
                store,
                service,
                setup,
                probe,
                tools,
                log_file: None,
                ai: AiRuntime::new(ai_tx),
            },
            AppEvents {
                scan: rx,
                setup: setup_rx,
                ai: ai_rx,
            },
        )
    }

    /// Sets the log file the diagnostics read the tail of.
    #[must_use]
    pub fn with_log_file(mut self, path: impl Into<PathBuf>) -> Self {
        self.log_file = Some(path.into());
        self
    }

    // ---------------------------------------------------------------- setup

    /// The hosts of `~/.ssh/config`, what `ssh -G` says about each, and why
    /// others were left out.
    pub async fn hosts_list(&self) -> Result<HostListing, AppError> {
        self.setup.list_resolved().await
    }

    /// The SSH agent, for the empty-app screens.
    pub async fn ssh_environment(&self) -> SshEnvironment {
        self.setup.environment().await
    }

    /// Whether the SSH agent the app uses answers, and how many keys it holds.
    pub async fn agent_status(&self) -> AgentStatus {
        self.setup.agent_status().await
    }

    /// The redacted text Settings › About copies for a bug report. Returned
    /// to the webview only; nothing is sent anywhere.
    pub async fn diagnostics_collect(&self) -> Diagnostics {
        let source = DiagnosticsSource {
            app_version: daminus_core::VERSION.to_owned(),
            log_file: self.log_file.clone(),
        };
        diagnostics::collect(&self.tools, &self.store, &source).await
    }

    /// Starts the login test or discover on `hosts`, or joins the run in progress.
    pub fn setup_start(
        &self,
        step: Step,
        hosts: &[HostAlias],
        paths: &[String],
    ) -> Result<daminus_core::setup::Started, AppError> {
        self.setup.start(step, hosts, paths)
    }

    pub fn setup_stop(&self) -> bool {
        self.setup.cancel()
    }

    pub fn setup_status(&self) -> Option<SetupRun> {
        self.setup.status()
    }

    pub fn setup_result(&self) -> SetupResult {
        self.setup.result()
    }

    /// Issues of `projects` as the user edited them; the whole set is checked.
    pub fn projects_validate(
        &self,
        projects: &serde_json::Value,
    ) -> Result<Vec<daminus_core::setup::ProjectIssue>, AppError> {
        Ok(self.setup.validate(&parse_projects(projects)?))
    }

    /// Validates again, then writes `projects.json`; nothing is written when an issue is an error.
    pub fn projects_save(
        &self,
        projects: &serde_json::Value,
        hosts: &[HostAlias],
    ) -> Result<Saved, AppError> {
        self.setup.save(parse_projects(projects)?, hosts)
    }

    pub fn projects_remove(&self, id: &str) -> Result<bool, AppError> {
        self.setup.remove(id)
    }

    /// One URL as a scan would see it, for the project sheet.
    pub async fn url_check(&self, url: &str) -> UrlCheck {
        check_url(self.probe.as_ref(), url).await
    }

    /// Starts a scan or joins the running one. Must run inside the Tokio runtime.
    pub fn scan_start(&self, scope: &ScanScope) -> Result<Started, AppError> {
        self.service.start(scope)
    }

    /// Stops the running scan; nothing is saved. Returns whether one was running.
    pub fn scan_stop(&self) -> bool {
        self.service.cancel()
    }

    /// Waits until scan `scan_id` is no longer the running one, at most `limit`.
    pub async fn wait_ended(&self, scan_id: &str, limit: Duration) {
        let started = Instant::now();
        while self.scan_status().is_some_and(|r| r.scan_id == scan_id) && started.elapsed() < limit
        {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    /// The scan in progress, so a reloaded webview can pick up where it was.
    pub fn scan_status(&self) -> Option<ScanRun> {
        self.service.status()
    }

    /// `evaluate` over the saved scans, as of now.
    pub fn report_latest(&self) -> Result<Report, AppError> {
        latest_report(&self.store, Timestamp::new(time::OffsetDateTime::now_utc()))
    }

    /// One summary per kept scan, oldest first.
    pub fn history_list(&self) -> Result<HistoryView, AppError> {
        history_view(&self.store)
    }

    /// The report as scan `seq` saw it.
    pub fn report_at(&self, seq: u32) -> Result<Report, AppError> {
        report_at(&self.store, seq)
    }

    /// The facts of `checks` in the newest `last` scans.
    pub fn history_facts(&self, checks: &[String], last: u32) -> Result<Vec<ScanFact>, AppError> {
        history_facts(
            &self.store,
            checks,
            usize::try_from(last).unwrap_or(usize::MAX),
        )
    }

    /// The expected rules as saved: what each covers, why, and until when.
    pub fn rules_list(&self) -> Result<Vec<ExpectedRule>, AppError> {
        Ok(self.store.load_projects()?.value.rules)
    }

    /// Saves a "mark as expected" rule for a result of the latest report. The fingerprint, the
    /// review day and the id are set here, never by the webview.
    pub fn rules_add(&self, draft: ExpectedDraft) -> Result<ExpectedRule, AppError> {
        add_rule(
            &self.store,
            draft,
            Timestamp::new(time::OffsetDateTime::now_utc()),
        )
    }

    /// Takes a rule out again (the toast's Undo). `false` when it was not there.
    pub fn rules_remove(&self, id: &str) -> Result<bool, AppError> {
        remove_rule(&self.store, id)
    }

    /// Looks at the key `host` offers and the keys recorded for it, without logging in.
    pub async fn host_key_check(&self, host: &HostAlias) -> Option<HostKeyInfo> {
        self.setup.host_key(host).await
    }

    /// `projects.json` as saved (names for the menu bar).
    pub fn projects(&self) -> Result<ProjectsFile, AppError> {
        Ok(self.store.load_projects()?.value)
    }

    /// Picks the intro journey from `state.json` and records this launch at `now`. A state
    /// that cannot be read counts as a daily launch and is left as it is, so a temporary
    /// failure never replays the first-launch intro or wipes the history; a failed write is
    /// logged, not returned.
    pub fn app_launch(&self, now: Timestamp) -> LaunchInfo {
        let mut info = None;
        let result = self.store.update_state(|state| {
            let previous = state.last_opened_at;
            info = Some(LaunchInfo {
                kind: launch_kind(previous, now),
                previous,
            });
            state.last_opened_at = Some(now);
        });
        if let Err(e) = result {
            tracing::warn!(error = %e, "state.json not read or not written");
        }
        info.unwrap_or(LaunchInfo {
            kind: LaunchKind::Daily,
            previous: None,
        })
    }

    /// The clear-week streak. A state file that cannot be read shows no streak.
    pub fn streak_get(&self) -> StreakInfo {
        match self.store.load_state() {
            Ok(state) => StreakInfo {
                weeks: state.streak_weeks,
            },
            Err(e) => {
                tracing::warn!(error = %e, "state.json not read");
                StreakInfo::default()
            }
        }
    }

    /// `settings.json` as saved, with the defaults for what the file leaves out.
    pub fn settings_get(&self) -> Result<Settings, AppError> {
        Ok(self.store.load_settings()?.value)
    }

    /// Replaces the General section, checks the whole file again, then writes it.
    pub fn settings_set_general(&self, general: GeneralSettings) -> Result<Settings, AppError> {
        self.store.update_settings(|s| s.general = general)
    }

    /// Replaces the Appearance section, checks the whole file again, then writes it.
    pub fn settings_set_appearance(
        &self,
        appearance: AppearanceSettings,
    ) -> Result<Settings, AppError> {
        self.store.update_settings(|s| s.appearance = appearance)
    }

    /// Replaces the Scan section (what to check, the limits, the thresholds), checks the whole
    /// file again, then writes it. The next report reads the thresholds, so they apply at once.
    pub fn settings_set_scan(&self, scan: ScanSettings) -> Result<Settings, AppError> {
        self.store.update_settings(|s| s.scan = scan)
    }

    /// Replaces the Data section (how many scans to keep, when AI replies go), checks the
    /// whole file again, then writes it. The next scan prunes to the new limit.
    pub fn settings_set_data(&self, data: DataSettings) -> Result<Settings, AppError> {
        self.store.update_settings(|s| s.data = data)
    }

    /// Replaces the AI section, checks the whole file again, then writes it. The provider and
    /// the URL were checked against the profiles by the caller.
    pub(crate) fn settings_set_ai(&self, ai: AiSettings) -> Result<Settings, AppError> {
        self.store.update_settings(|s| s.ai = ai)
    }

    /// What the app's folder holds, for Settings › Data.
    pub fn data_usage(&self) -> DataUsage {
        data::usage(
            &self.store,
            self.log_file.as_deref(),
            data::home_dir().as_deref(),
        )
    }

    /// Every kept scan as one redacted JSON text, for the shell to write to Downloads.
    pub fn data_export(&self) -> Result<String, AppError> {
        data::export_scans(&self.store)
    }

    /// Deletes the scans and the expected notes; answers how many scans went.
    pub fn data_clear(&self) -> Result<usize, AppError> {
        data::clear_history(&self.store)
    }

    /// Puts every setting back to its default.
    pub fn settings_reset(&self) -> Result<Settings, AppError> {
        data::reset_settings(&self.store)
    }

    /// The hosts switched off for scans (Settings › Hosts).
    pub fn hosts_excluded(&self) -> Result<Vec<HostAlias>, AppError> {
        excluded_hosts(&self.store)
    }

    /// Switches a host on or off for scans; answers with the hosts that are off afterwards.
    pub fn hosts_set_include(
        &self,
        host: &HostAlias,
        include: bool,
    ) -> Result<Vec<HostAlias>, AppError> {
        set_host_included(&self.store, host, include)
    }

    /// The app language from Settings › General (`en` when unreadable).
    pub fn language(&self) -> String {
        self.store
            .load_settings()
            .map(|s| s.value.general.language)
            .unwrap_or_else(|_| "en".to_owned())
    }

    /// Cancels the scan and the setup run and kills every `ssh` they started (app quit).
    pub fn shutdown(&self) {
        self.service.shutdown();
        self.setup.shutdown();
    }

    pub fn config_dir(&self) -> &Path {
        self.store.root()
    }

    /// Creates the config folder if needed and returns it, for Finder.
    pub fn ensure_config_dir(&self) -> Result<PathBuf, AppError> {
        let dir = self.config_dir().to_path_buf();
        std::fs::create_dir_all(&dir).map_err(|_| {
            AppError::from(ErrorCode::Io {
                path: dir.display().to_string(),
            })
        })?;
        Ok(dir)
    }

    /// `~/.ssh` for Finder; creates nothing, so a Mac without one gets an `Io` error.
    pub fn existing_ssh_dir(&self) -> Result<PathBuf, AppError> {
        self.setup.existing_ssh_dir().ok_or_else(|| {
            AppError::from(ErrorCode::Io {
                path: "~/.ssh".to_owned(),
            })
        })
    }
}

/// The projects the webview sent, checked as `projects.json` would check them
/// (names and paths that could be read as an option are refused).
fn parse_projects(value: &serde_json::Value) -> Result<Vec<Project>, AppError> {
    serde_json::from_value(value.clone()).map_err(|e| {
        AppError::from(ErrorCode::SchemaInvalid).with_param("detail", serde_error_path(&e))
    })
}

/// Whether an event ends the scan.
pub fn is_final(event: &ScanEvent) -> bool {
    use daminus_core::scan::ScanEventBody as B;
    matches!(event.body, B::Done { .. } | B::Cancelled | B::Failed { .. })
}

/// Forwards every scan event to `sink` until the service goes away.
pub async fn pump<E>(mut rx: mpsc::Receiver<E>, mut sink: impl FnMut(E)) {
    while let Some(event) = rx.recv().await {
        sink(event);
    }
}

/// Where a rejected project went wrong (line and column), never the message: serde's text
/// can quote the value, and values here are names and paths from the webview.
fn serde_error_path(e: &serde_json::Error) -> String {
    format!("line {}, column {}", e.line(), e.column())
}
