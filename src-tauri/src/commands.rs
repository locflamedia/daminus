//! IPC commands: thin adapters over [`AppCore`]. Every error is an
//! [`AppError`] (code + params); the webview words it.
//!
//! The TypeScript wrappers in `src/api/commands.ts` list the same names; a
//! test there reads the `generate_handler!` list in `lib.rs` and compares.
//! Generic over the runtime so tests drive them through a mock webview.

use std::time::Duration;

use daminus_core::domain::error::{AppError, ErrorCode};
use daminus_core::domain::evaluate::Report;
use daminus_core::domain::expected::ExpectedRule;
use daminus_core::domain::host::HostAlias;
use daminus_core::domain::project::Project;
use daminus_core::scan::{HistoryView, ScanFact, ScanRun, ScanScope, Started};
use daminus_core::setup::{
    ProjectIssue, Saved, SetupResult, SetupRun, SshEnvironment, Started as SetupStarted, Step,
    UrlCheck,
};
use daminus_core::ssh::config::HostListing;
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

/// One summary per kept scan (counts, hosts, per-project levels), oldest first.
#[tauri::command]
pub async fn history_list(core: State<'_, AppCore>) -> Result<HistoryView, AppError> {
    let core = core.inner().clone();
    run_blocking("history_list", move || core.history_list()).await
}

/// `evaluate` over the saved scans up to scan `seq`, as of when it finished.
#[tauri::command]
pub async fn report_at(core: State<'_, AppCore>, seq: u32) -> Result<Report, AppError> {
    let core = core.inner().clone();
    run_blocking("report_at", move || core.report_at(seq)).await
}

/// The raw facts of the named checks in the newest `last` scans, oldest first.
#[tauri::command]
pub async fn history_facts(
    core: State<'_, AppCore>,
    checks: Vec<String>,
    last: u32,
) -> Result<Vec<ScanFact>, AppError> {
    let core = core.inner().clone();
    run_blocking("history_facts", move || core.history_facts(&checks, last)).await
}

/// The expected rules: what each one covers, its reason and review day.
#[tauri::command]
pub async fn rules_list(core: State<'_, AppCore>) -> Result<Vec<ExpectedRule>, AppError> {
    let core = core.inner().clone();
    run_blocking("rules_list", move || core.rules_list()).await
}

/// The saved projects (name, colour, URLs, components), for the marks in the
/// sidebar, the rail and the project header. Only the projects: host settings
/// and expected rules stay in Rust.
#[tauri::command]
pub async fn projects_list(core: State<'_, AppCore>) -> Result<Vec<Project>, AppError> {
    let core = core.inner().clone();
    tauri::async_runtime::spawn_blocking(move || core.projects().map(|file| file.projects))
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "projects_list panicked");
            AppError::from(ErrorCode::Internal)
        })?
}

/// The hosts of `~/.ssh/config` with what ssh resolves for each, and the
/// entries left out with their reason, file and line.
#[tauri::command]
pub async fn hosts_list(core: State<'_, AppCore>) -> Result<HostListing, AppError> {
    core.hosts_list().await
}

/// Whether the SSH agent holds keys and Termius is installed.
#[tauri::command]
pub async fn ssh_environment(core: State<'_, AppCore>) -> Result<SshEnvironment, AppError> {
    Ok(core.ssh_environment().await)
}

/// Starts the login test or discover on `hosts` (or joins the run in progress).
/// `paths` are the project folders the login test asks about.
#[tauri::command]
pub async fn setup_start(
    core: State<'_, AppCore>,
    step: Step,
    hosts: Vec<HostAlias>,
    paths: Option<Vec<String>>,
) -> Result<SetupStarted, AppError> {
    let core = core.inner().clone();
    // Reads settings.json before it starts, and spawns the run: keep both off the main thread.
    let paths = paths.unwrap_or_default();
    let started = run_blocking("setup_start", move || {
        // `start` spawns on the Tokio runtime, which a blocking thread of Tauri's pool can enter.
        let _guard = tauri::async_runtime::handle().inner().enter();
        core.setup_start(step, &hosts, &paths)
    })
    .await?;
    Ok(started)
}

/// Stops the running setup step. `false` when none was running.
#[tauri::command]
pub async fn setup_stop(core: State<'_, AppCore>) -> Result<bool, AppError> {
    Ok(core.setup_stop())
}

/// The setup step in progress, if any (a reloaded webview hydrates from it).
#[tauri::command]
pub async fn setup_status(core: State<'_, AppCore>) -> Result<Option<SetupRun>, AppError> {
    Ok(core.setup_status())
}

/// What the setup steps found so far, and the suggested projects.
#[tauri::command]
pub async fn setup_result(core: State<'_, AppCore>) -> Result<SetupResult, AppError> {
    Ok(core.setup_result())
}

/// What is wrong or doubtful about `projects`, per field.
#[tauri::command]
pub async fn projects_validate(
    core: State<'_, AppCore>,
    projects: serde_json::Value,
) -> Result<Vec<ProjectIssue>, AppError> {
    let core = core.inner().clone();
    run_blocking("projects_validate", move || {
        core.projects_validate(&projects)
    })
    .await
}

/// Validates the whole set again and writes `projects.json`; nothing is
/// written when an issue is an error.
#[tauri::command]
pub async fn projects_save(
    core: State<'_, AppCore>,
    projects: serde_json::Value,
    hosts: Vec<HostAlias>,
) -> Result<Saved, AppError> {
    let core = core.inner().clone();
    run_blocking("projects_save", move || {
        core.projects_save(&projects, &hosts)
    })
    .await
}

/// Takes a project out of `projects.json`. `false` when it was not there.
#[tauri::command]
pub async fn projects_remove(core: State<'_, AppCore>, id: String) -> Result<bool, AppError> {
    let core = core.inner().clone();
    run_blocking("projects_remove", move || core.projects_remove(&id)).await
}

/// One URL probed from this Mac: status, time, certificate days.
#[tauri::command]
pub async fn url_check(core: State<'_, AppCore>, url: String) -> Result<UrlCheck, AppError> {
    Ok(core.url_check(&url).await)
}

/// Runs file work off the async threads; a panic is logged and becomes `Internal`.
async fn run_blocking<T: Send + 'static>(
    what: &'static str,
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "{what} panicked");
            AppError::from(ErrorCode::Internal)
        })?
}

/// Shows the config folder in Finder. Done here rather than through the
/// opener plugin, so the webview never gets to open arbitrary paths.
#[tauri::command]
pub fn reveal_config_dir(core: State<'_, AppCore>) -> Result<(), AppError> {
    open_in_finder(&core.ensure_config_dir()?)
}

/// Shows `~/.ssh` in Finder when it exists. Like the config folder, the path is
/// fixed here and the webview sends none.
#[tauri::command]
pub fn reveal_ssh_dir(core: State<'_, AppCore>) -> Result<(), AppError> {
    open_in_finder(&core.existing_ssh_dir()?)
}

fn open_in_finder(dir: &std::path::Path) -> Result<(), AppError> {
    std::process::Command::new("/usr/bin/open")
        .arg(dir)
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
