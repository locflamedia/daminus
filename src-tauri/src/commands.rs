//! IPC commands: thin adapters over [`AppCore`]. Every error is an
//! [`AppError`] (code + params); the webview words it.
//!
//! The TypeScript wrappers in `src/api/commands.ts` list the same names; a
//! test there reads the `generate_handler!` list in `lib.rs` and compares.
//! Generic over the runtime so tests drive them through a mock webview.

use std::time::Duration;

use daminus_core::domain::error::{AppError, ErrorCode};
use daminus_core::domain::evaluate::Report;
use daminus_core::scan::{ScanRun, ScanScope, Started};
use tauri::{AppHandle, Runtime, State};

use crate::app::AppCore;
use crate::tray;

/// How long `scan_stop` waits for the scan to wind down before answering.
const STOP_WAIT: Duration = Duration::from_secs(5);

/// Starts a scan (or joins the running one: tray and window share it).
#[tauri::command]
pub async fn scan_start<R: Runtime>(
    app: AppHandle<R>,
    core: State<'_, AppCore>,
    scope: Option<ScanScope>,
) -> Result<Started, AppError> {
    let started = core.scan_start(&scope.unwrap_or_default())?;
    if !started.joined {
        tray::refresh(&app);
    }
    Ok(started)
}

/// Stops the running scan; nothing is saved. `false` when none was running.
/// Answers once the scan has ended (or after [`STOP_WAIT`]), so a status
/// read right after sees it gone, and redraws the tray: the final event may
/// be dropped when the event channel is full.
#[tauri::command]
pub async fn scan_stop<R: Runtime>(
    app: AppHandle<R>,
    core: State<'_, AppCore>,
) -> Result<bool, AppError> {
    let running = core.scan_status().map(|r| r.scan_id);
    let stopped = core.scan_stop();
    if let Some(id) = running {
        core.wait_ended(&id, STOP_WAIT).await;
    }
    tauri::async_runtime::spawn(async move { tray::reload(&app) });
    Ok(stopped)
}

/// The scan in progress, if any (a reloaded webview hydrates from it).
#[tauri::command]
pub fn scan_status(core: State<'_, AppCore>) -> Option<ScanRun> {
    core.scan_status()
}

/// `evaluate` over the saved scans.
#[tauri::command]
pub async fn report_latest(core: State<'_, AppCore>) -> Result<Report, AppError> {
    let core = core.inner().clone();
    tauri::async_runtime::spawn_blocking(move || core.report_latest())
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "report_latest panicked");
            AppError::from(ErrorCode::Internal)
        })?
}

/// Shows the config folder in Finder. Done here rather than through the
/// opener plugin, so the webview never gets to open arbitrary paths.
#[tauri::command]
pub fn reveal_config_dir(core: State<'_, AppCore>) -> Result<(), AppError> {
    let dir = core.ensure_config_dir()?;
    std::process::Command::new("/usr/bin/open")
        .arg(&dir)
        .status()
        .ok()
        .filter(std::process::ExitStatus::success)
        .map(|_| ())
        .ok_or_else(|| {
            AppError::from(ErrorCode::Io {
                path: dir.display().to_string(),
            })
        })
}
