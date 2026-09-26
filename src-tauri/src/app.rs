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
use daminus_core::domain::project::ProjectsFile;
use daminus_core::probe::UrlProbe;
use daminus_core::scan::{ScanEvent, ScanRun, ScanScope, ScanService, Started, latest_report};
use daminus_core::ssh::Transport;
use daminus_core::store::FsStore;
use tokio::sync::mpsc;

/// The one event channel the webview listens to.
pub const SCAN_EVENT: &str = "scan://event";

/// Room for events between the scan and the pump that forwards them.
const EVENT_BUFFER: usize = 1024;

/// Store and scan service, shared by commands, the tray and quit handling.
#[derive(Clone)]
pub struct AppCore {
    store: FsStore,
    service: ScanService,
}

impl AppCore {
    /// Builds the core over `store`. The returned receiver carries every scan
    /// event and must be drained continuously (see [`pump`]).
    pub fn new(
        transport: Arc<dyn Transport>,
        probe: Arc<dyn UrlProbe>,
        store: FsStore,
    ) -> (Self, mpsc::Receiver<ScanEvent>) {
        let (tx, rx) = mpsc::channel(EVENT_BUFFER);
        let service = ScanService::new(transport, probe, store.clone(), tx);
        (Self { store, service }, rx)
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

    /// Cancels the scan and kills every `ssh` it started (app quit).
    pub fn shutdown(&self) {
        self.service.shutdown();
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

/// Whether an event ends the scan.
pub fn is_final(event: &ScanEvent) -> bool {
    use daminus_core::scan::ScanEventBody as B;
    matches!(event.body, B::Done { .. } | B::Cancelled | B::Failed { .. })
}

/// Forwards every scan event to `sink` until the service goes away.
pub async fn pump(mut rx: mpsc::Receiver<ScanEvent>, mut sink: impl FnMut(ScanEvent)) {
    while let Some(event) = rx.recv().await {
        sink(event);
    }
}
