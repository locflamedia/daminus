//! The app's state and what every command does, as plain Rust functions.
//!
//! `commands.rs` only adapts these to Tauri, so tests drive the same code
//! with a fake transport and no webview.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use daminus_core::domain::datetime::Timestamp;
use daminus_core::domain::error::{AppError, ErrorCode};
use daminus_core::domain::evaluate::Report;
use daminus_core::domain::host::HostAlias;
use daminus_core::domain::project::Project;
use daminus_core::domain::project::ProjectsFile;
use daminus_core::probe::UrlProbe;
use daminus_core::scan::{ScanEvent, ScanRun, ScanScope, ScanService, Started, latest_report};
use daminus_core::setup::{
    Saved, SetupEvent, SetupResult, SetupRun, SetupService, SshEnvironment, Step, UrlCheck,
    check_url,
};
use daminus_core::ssh::config::HostListing;
use daminus_core::ssh::{SshTools, Transport};
use daminus_core::store::FsStore;
use tokio::sync::mpsc;

/// The one event channel the webview listens to.
pub const SCAN_EVENT: &str = "scan://event";

/// The event channel of the setup flow.
pub const SETUP_EVENT: &str = "setup://event";

/// Room for events between the scan and the pump that forwards them.
const EVENT_BUFFER: usize = 1024;

/// Store, scan service and setup flow, shared by commands, the tray and quit handling.
#[derive(Clone)]
pub struct AppCore {
    store: FsStore,
    service: ScanService,
    setup: SetupService,
    probe: Arc<dyn UrlProbe>,
}

/// The receivers of the two event streams; each must be drained continuously
/// (see [`pump`]).
pub struct AppEvents {
    pub scan: mpsc::Receiver<ScanEvent>,
    pub setup: mpsc::Receiver<SetupEvent>,
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
        let service = ScanService::new(
            Arc::clone(&transport),
            Arc::clone(&probe),
            store.clone(),
            tx,
        );
        let setup = SetupService::new(transport, tools, store.clone(), setup_tx);
        (
            Self {
                store,
                service,
                setup,
                probe,
            },
            AppEvents {
                scan: rx,
                setup: setup_rx,
            },
        )
    }

    // ---------------------------------------------------------------- setup

    /// The hosts of `~/.ssh/config`, what `ssh -G` says about each, and why
    /// others were left out.
    pub async fn hosts_list(&self) -> Result<HostListing, AppError> {
        self.setup.list_resolved().await
    }

    /// The SSH agent and Termius, for the empty-app screens.
    pub async fn ssh_environment(&self) -> SshEnvironment {
        self.setup.environment().await
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

    /// `projects.json` as saved (names for the menu bar).
    pub fn projects(&self) -> Result<ProjectsFile, AppError> {
        Ok(self.store.load_projects()?.value)
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
}

/// The projects the webview sent, checked as `projects.json` would check them
/// (names and paths that could be read as an option are refused).
fn parse_projects(value: &serde_json::Value) -> Result<Vec<Project>, AppError> {
    serde_json::from_value(value.clone())
        .map_err(|e| AppError::from(ErrorCode::SchemaInvalid).with_param("detail", e.to_string()))
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
