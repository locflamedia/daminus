//! IPC commands: thin adapters over [`AppCore`]. Every error is an
//! [`AppError`] (code + params); the webview words it.
//!
//! The TypeScript wrappers in `src/api/commands.ts` list the same names; a
//! test there reads the `generate_handler!` list in `lib.rs` and compares.
//! Generic over the runtime so tests drive them through a mock webview.

use std::time::Duration;

use daminus_core::ai::profiles::ModelList;
use daminus_core::ai::view::{
    AiProvidersView, AiTestResult, PayloadPreview, PreviewOptions, PreviewScope,
};
use daminus_core::data::{DataUsage, ExportedFile};
use daminus_core::diagnostics::Diagnostics;
use daminus_core::domain::app_state::LaunchInfo;
use daminus_core::domain::datetime::Timestamp;
use daminus_core::domain::error::{AppError, ErrorCode};
use daminus_core::domain::evaluate::Report;
use daminus_core::domain::expected::ExpectedRule;
use daminus_core::domain::host::HostAlias;
use daminus_core::domain::project::Project;
use daminus_core::domain::settings::{
    AiSettings, AppearanceSettings, DataSettings, GeneralSettings, ScanSettings, Settings,
};
use daminus_core::scan::{ExpectedDraft, HistoryView, ScanFact, ScanRun, ScanScope, Started};
use daminus_core::setup::{
    AgentStatus, ProjectIssue, Saved, SetupResult, SetupRun, SshEnvironment,
    Started as SetupStarted, Step, UrlCheck,
};
use daminus_core::ssh::config::HostListing;
use daminus_core::ssh::hostkey::HostKeyInfo;
use tauri::{AppHandle, Manager, Runtime, State};

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

/// Saves a "mark as expected" rule for a result of the latest report. Rust adds the evidence
/// fingerprint, the review day and the id, and refuses what the board forbids (a critical result
/// without a review day or without its evidence, a note that is too long).
#[tauri::command]
pub async fn rules_add(
    core: State<'_, AppCore>,
    draft: ExpectedDraft,
) -> Result<ExpectedRule, AppError> {
    let core = core.inner().clone();
    run_blocking("rules_add", move || core.rules_add(draft)).await
}

/// Takes an expected rule out (Undo). `false` when it was not there.
#[tauri::command]
pub async fn rules_remove(core: State<'_, AppCore>, id: String) -> Result<bool, AppError> {
    let core = core.inner().clone();
    run_blocking("rules_remove", move || core.rules_remove(&id)).await
}

/// What `host` offers as its key and what is recorded for it, without logging in. For the host
/// key screen's Retry after the key was accepted once in Terminal. `None` when ssh cannot say.
#[tauri::command]
pub async fn host_key_check(
    core: State<'_, AppCore>,
    host: HostAlias,
) -> Result<Option<HostKeyInfo>, AppError> {
    Ok(core.host_key_check(&host).await)
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

/// Whether an SSH agent answers `ssh-add -l` with the app's resolved
/// environment, and how many keys it holds (a count, nothing else).
#[tauri::command]
pub async fn agent_status(core: State<'_, AppCore>) -> Result<AgentStatus, AppError> {
    Ok(core.agent_status().await)
}

/// App and system versions, `ssh -V`, the resolved `PATH`, settings, the last
/// result of each host and the log tail, redacted, as text to copy. Sends nothing.
#[tauri::command]
pub async fn diagnostics_collect(core: State<'_, AppCore>) -> Result<Diagnostics, AppError> {
    Ok(core.diagnostics_collect().await)
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

/// Which intro journey to play (first, returning, daily); records this launch in `state.json`.
#[tauri::command]
pub async fn app_launch(core: State<'_, AppCore>) -> Result<LaunchInfo, AppError> {
    let core = core.inner().clone();
    let now = Timestamp::new(time::OffsetDateTime::now_utc());
    run_blocking("app_launch", move || Ok(core.app_launch(now))).await
}

/// `settings.json` as saved (no key or secret is ever in it).
#[tauri::command]
pub async fn settings_get(core: State<'_, AppCore>) -> Result<Settings, AppError> {
    let core = core.inner().clone();
    run_blocking("settings_get", move || core.settings_get()).await
}

/// Replaces Settings › General; the whole file is checked again and nothing is written when
/// a field is not valid. Answers with the settings as saved and re-words the tray menu.
#[tauri::command]
pub async fn settings_set_general<R: Runtime>(
    app: AppHandle<R>,
    core: State<'_, AppCore>,
    general: GeneralSettings,
) -> Result<Settings, AppError> {
    let core = core.inner().clone();
    let saved = run_blocking("settings_set_general", move || {
        core.settings_set_general(general)
    })
    .await?;
    tauri::async_runtime::spawn(async move { tray::refresh(&app) });
    Ok(saved)
}

/// Replaces Settings › Appearance; checked and answered like `settings_set_general`.
#[tauri::command]
pub async fn settings_set_appearance(
    core: State<'_, AppCore>,
    appearance: AppearanceSettings,
) -> Result<Settings, AppError> {
    let core = core.inner().clone();
    run_blocking("settings_set_appearance", move || {
        core.settings_set_appearance(appearance)
    })
    .await
}

/// Replaces Settings › Scan; checked and answered like `settings_set_general`. Thresholds take
/// effect on the next report, without a new scan.
#[tauri::command]
pub async fn settings_set_scan(
    core: State<'_, AppCore>,
    scan: ScanSettings,
) -> Result<Settings, AppError> {
    let core = core.inner().clone();
    run_blocking("settings_set_scan", move || core.settings_set_scan(scan)).await
}

/// Replaces Settings › Data; checked and answered like `settings_set_general`.
#[tauri::command]
pub async fn settings_set_data(
    core: State<'_, AppCore>,
    data: DataSettings,
) -> Result<Settings, AppError> {
    let core = core.inner().clone();
    run_blocking("settings_set_data", move || core.settings_set_data(data)).await
}

/// Puts every setting back to its default (the General language too, so the tray is re-worded).
#[tauri::command]
pub async fn settings_reset<R: Runtime>(
    app: AppHandle<R>,
    core: State<'_, AppCore>,
) -> Result<Settings, AppError> {
    let core = core.inner().clone();
    let saved = run_blocking("settings_reset", move || core.settings_reset()).await?;
    tauri::async_runtime::spawn(async move { tray::refresh(&app) });
    Ok(saved)
}

/// The eight providers with whether a key is stored for each (never the key), the selected
/// provider, model and endpoint, and what the `claude` program reports.
#[tauri::command]
pub async fn ai_providers(core: State<'_, AppCore>) -> Result<AiProvidersView, AppError> {
    core.ai_providers().await
}

/// Stores (`Some`) or removes (`None`) the key of a provider in the Keychain. Answers whether
/// a key is stored afterwards. The key crosses IPC here, inward, and nowhere else.
#[tauri::command]
pub async fn ai_set_key(
    core: State<'_, AppCore>,
    provider_id: String,
    key: Option<String>,
) -> Result<bool, AppError> {
    core.ai_set_key(&provider_id, key).await
}

/// Replaces Settings › AI (provider, model, endpoint, the Claude Code consent); the provider and
/// the URL are checked against the profiles and the whole file is checked again.
#[tauri::command]
pub async fn ai_settings_set(
    core: State<'_, AppCore>,
    ai: AiSettings,
) -> Result<Settings, AppError> {
    core.ai_settings_set(ai).await
}

/// The models of a provider; the suggestions with manual entry when it cannot list them.
#[tauri::command]
pub async fn ai_models(
    core: State<'_, AppCore>,
    provider_id: String,
) -> Result<ModelList, AppError> {
    core.ai_models(&provider_id).await
}

/// Checks a provider's key and endpoint with the stored key. A failure is data in the answer.
#[tauri::command]
pub async fn ai_test(
    core: State<'_, AppCore>,
    provider_id: String,
) -> Result<AiTestResult, AppError> {
    core.ai_test(&provider_id).await
}

/// The text that would be sent for `scope`, built from the latest report. Its bytes are kept
/// under the hash; `ai_analyze` sends those.
#[tauri::command]
pub async fn ai_payload_preview(
    core: State<'_, AppCore>,
    scope: PreviewScope,
    options: PreviewOptions,
) -> Result<PayloadPreview, AppError> {
    core.ai_payload_preview(scope, options).await
}

/// Sends the payload previewed under `previewed_hash`. Answers once the send is under way; the
/// reply arrives on `ai://event`, tagged with `request_id`.
#[tauri::command]
pub async fn ai_analyze(
    core: State<'_, AppCore>,
    request_id: String,
    previewed_hash: String,
) -> Result<(), AppError> {
    core.ai_analyze(&request_id, &previewed_hash).await
}

/// Stops a send. `false` when `request_id` is not running. The stop shows as a `cancelled`
/// event, not as an error.
#[tauri::command]
pub async fn ai_cancel(core: State<'_, AppCore>, request_id: String) -> Result<bool, AppError> {
    Ok(core.ai_cancel(&request_id))
}

/// What the app's folder holds: path, files and bytes by kind, the size of each scan.
#[tauri::command]
pub async fn data_usage(core: State<'_, AppCore>) -> Result<DataUsage, AppError> {
    let core = core.inner().clone();
    run_blocking("data_usage", move || Ok(core.data_usage())).await
}

/// Writes every kept scan, redacted, to a new JSON file in Downloads and answers with its name.
/// The folder and the name are fixed here; the webview sends none and gets no content back.
#[tauri::command]
pub async fn data_export<R: Runtime>(
    app: AppHandle<R>,
    core: State<'_, AppCore>,
) -> Result<ExportedFile, AppError> {
    let core = core.inner().clone();
    let dir = app.path().download_dir().map_err(|_| {
        AppError::from(ErrorCode::Io {
            path: "Downloads".to_owned(),
        })
    })?;
    run_blocking("data_export", move || {
        let text = core.data_export()?;
        write_new_file(&dir, "daminus-scans", &text)
    })
    .await
}

/// Deletes the scans and the expected notes from this Mac; answers how many scans went.
#[tauri::command]
pub async fn data_clear(core: State<'_, AppCore>) -> Result<usize, AppError> {
    let core = core.inner().clone();
    run_blocking("data_clear", move || core.data_clear()).await
}

/// Writes `text` to `<dir>/<stem>.json`, or `<stem>-2.json` and on when the name is taken;
/// an existing file is never replaced.
fn write_new_file(dir: &std::path::Path, stem: &str, text: &str) -> Result<ExportedFile, AppError> {
    use std::io::Write as _;
    let io = |path: &std::path::Path| {
        AppError::from(ErrorCode::Io {
            path: path.display().to_string(),
        })
    };
    for n in 1..100 {
        let name = if n == 1 {
            format!("{stem}.json")
        } else {
            format!("{stem}-{n}.json")
        };
        let path = dir.join(&name);
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt as _;
            options.mode(0o600);
        }
        match options.open(&path) {
            Ok(mut file) => {
                if file.write_all(text.as_bytes()).is_err() {
                    drop(file);
                    let _ = std::fs::remove_file(&path);
                    return Err(io(&path));
                }
                return Ok(ExportedFile { name });
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(io(&path)),
        }
    }
    Err(io(dir))
}

/// The hosts switched off for scans in Settings › Hosts.
#[tauri::command]
pub async fn hosts_excluded(core: State<'_, AppCore>) -> Result<Vec<HostAlias>, AppError> {
    let core = core.inner().clone();
    run_blocking("hosts_excluded", move || core.hosts_excluded()).await
}

/// Switches one host on or off for scans and answers with the hosts that are off.
#[tauri::command]
pub async fn hosts_set_include(
    core: State<'_, AppCore>,
    host: HostAlias,
    include: bool,
) -> Result<Vec<HostAlias>, AppError> {
    let core = core.inner().clone();
    run_blocking("hosts_set_include", move || {
        core.hosts_set_include(&host, include)
    })
    .await
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

#[cfg(test)]
mod tests {
    use super::write_new_file;

    #[test]
    fn an_export_is_private_to_the_user_and_never_replaces_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let first = write_new_file(dir.path(), "scans", "{}").unwrap();
        let second = write_new_file(dir.path(), "scans", "{}").unwrap();
        assert_eq!(
            (first.name.as_str(), second.name.as_str()),
            ("scans.json", "scans-2.json")
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            let mode = std::fs::metadata(dir.path().join("scans.json"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }
}
