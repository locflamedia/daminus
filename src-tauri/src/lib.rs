//! Daminus app shell: Tauri around `daminus-core`.
//!
//! One window (closing it hides it), one menu bar item, one instance. Scans
//! only start when the user asks, from the window or the menu bar; both go
//! through the same `ScanService`, so asking twice joins the running scan.

pub mod ai;
pub mod app;
mod commands;
pub mod gui_env;
mod logging;
mod tray;
pub mod tray_text;

use std::sync::Arc;

use daminus_core::probe::HttpProbe;
use daminus_core::ssh::SshTransport;
use daminus_core::store::FsStore;
use tauri::{AppHandle, Emitter as _, Manager as _, RunEvent, Runtime, WindowEvent};
use time::UtcOffset;

use crate::ai::AI_EVENT;
use crate::ai::keystore::KeychainStore;
use crate::app::{AppCore, AppEvents, SCAN_EVENT, SETUP_EVENT, is_final, pump};

/// Label of the one window, from `tauri.conf.json`.
pub const MAIN_WINDOW: &str = "main";

/// Shows, un-minimizes and focuses the window.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// The IPC commands. Keep in step with `build.rs`, `src/api/commands.ts` and
/// the capability (a test in `src/api/commands.test.ts` compares them).
pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::scan_start,
        commands::scan_stop,
        commands::scan_status,
        commands::report_latest,
        commands::history_list,
        commands::report_at,
        commands::history_facts,
        commands::rules_list,
        commands::rules_add,
        commands::rules_remove,
        commands::host_key_check,
        commands::projects_list,
        commands::reveal_config_dir,
        commands::reveal_ssh_dir,
        commands::hosts_list,
        commands::ssh_environment,
        commands::setup_start,
        commands::setup_stop,
        commands::setup_status,
        commands::setup_result,
        commands::projects_validate,
        commands::projects_save,
        commands::projects_remove,
        commands::url_check,
        commands::app_launch,
        commands::streak_get,
        commands::settings_get,
        commands::settings_set_general,
        commands::settings_set_appearance,
        commands::settings_set_scan,
        commands::settings_set_data,
        commands::settings_reset,
        commands::data_usage,
        commands::data_export,
        commands::data_clear,
        commands::hosts_excluded,
        commands::hosts_set_include,
        commands::agent_status,
        commands::diagnostics_collect,
        commands::ai_providers,
        commands::ai_set_key,
        commands::ai_settings_set,
        commands::ai_models,
        commands::ai_test,
        commands::ai_payload_preview,
        commands::ai_analyze,
        commands::ai_cancel,
    ]
}

/// Emits every scan event to the webview on [`SCAN_EVENT`], every setup event
/// on [`SETUP_EVENT`], every event of an AI send on [`AI_EVENT`], and re-reads the tray's results when a scan ends. Must
/// be called inside the Tauri runtime.
pub fn forward_events<R: Runtime>(app: &AppHandle<R>, events: AppEvents) {
    let handle = app.clone();
    tauri::async_runtime::spawn(pump(events.setup, move |event| {
        if let Err(e) = handle.emit(SETUP_EVENT, &event) {
            tracing::warn!(error = %e, "setup event not delivered");
        }
    }));
    let handle = app.clone();
    tauri::async_runtime::spawn(pump(events.ai, move |event| {
        if let Err(e) = handle.emit(AI_EVENT, &event) {
            tracing::warn!(error = %e, "ai event not delivered");
        }
    }));
    let handle = app.clone();
    tauri::async_runtime::spawn(pump(events.scan, move |event| {
        if let Err(e) = handle.emit(SCAN_EVENT, &event) {
            tracing::warn!(error = %e, "scan event not delivered");
        }
        if is_final(&event) {
            let h = handle.clone();
            tauri::async_runtime::spawn(async move { tray::reload(&h) });
        } else if matches!(
            event.body,
            daminus_core::scan::ScanEventBody::HostFinished { .. }
        ) {
            // "Scanning 3 of 5 hosts…" counts up as each host ends.
            let h = handle.clone();
            tauri::async_runtime::spawn(async move { tray::refresh(&h) });
        }
    }));
}

/// Runs the app until Quit.
pub fn run() -> Result<(), tauri::Error> {
    // Read while the process is still single-threaded; `time` refuses later.
    let offset = UtcOffset::current_local_offset().unwrap_or(UtcOffset::UTC);
    // The login shell may be slow; read it while Tauri starts.
    let env_reader = std::thread::spawn(gui_env::read);

    let app = tauri::Builder::default()
        // First, so a second launch only focuses this one.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app)
        }))
        .plugin(logging::plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(move |app| {
            let env = env_reader.join().unwrap_or_default();
            env.log();
            let dir = app.path().app_config_dir()?;
            tracing::info!(version = daminus_core::VERSION, config = %dir.display(), "Daminus starting");
            let path_var = env
                .vars
                .iter()
                .find(|(k, _)| k == "PATH")
                .map(|(_, v)| v.clone())
                .unwrap_or_default();
            let transport = SshTransport::new().with_env(env.vars);
            let tools = transport.tools().clone();
            let (core, events) = AppCore::new(
                Arc::new(transport),
                tools,
                Arc::new(HttpProbe::new()),
                FsStore::new(dir),
            );
            let core = core
                .with_secret_store(Arc::new(KeychainStore))
                .with_path_var(path_var);
            let core = match app.path().app_log_dir() {
                Ok(logs) => core.with_log_file(logs.join("daminus.log")),
                Err(_) => core,
            };
            app.manage(core);

            forward_events(app.handle(), events);

            let tray = tray::Tray::build(app.handle(), offset)?;
            app.manage(Arc::clone(&tray));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move { tray.reload(&handle) });
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing hides: the app stays in the menu bar with the last results.
            WindowEvent::CloseRequested { api, .. } if window.label() == MAIN_WINDOW => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::ThemeChanged(_) => {
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move { tray::refresh(&app) });
            }
            _ => {}
        })
        .invoke_handler(handler())
        .build(tauri::generate_context!())?;

    app.run(|app, event| match event {
        RunEvent::ExitRequested { .. } | RunEvent::Exit => {
            if let Some(core) = app.try_state::<AppCore>() {
                core.shutdown();
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main(app),
        _ => {}
    });
    Ok(())
}
