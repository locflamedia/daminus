//! Daminus app shell: Tauri around `daminus-core`.
//!
//! One window (closing it hides it), one menu bar item, one instance. Scans
//! only start when the user asks, from the window or the menu bar; both go
//! through the same `ScanService`, so asking twice joins the running scan.

pub mod app;
mod commands;
pub mod gui_env;
mod logging;
mod tray;
pub mod tray_text;

use std::sync::Arc;

use daminus_core::probe::HttpProbe;
use daminus_core::scan::ScanEvent;
use daminus_core::ssh::SshTransport;
use daminus_core::store::FsStore;
use tauri::{AppHandle, Emitter as _, Manager as _, RunEvent, Runtime, WindowEvent};
use time::UtcOffset;
use tokio::sync::mpsc::Receiver;

use crate::app::{AppCore, SCAN_EVENT, is_final, pump};

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
        commands::reveal_config_dir,
    ]
}

/// Emits every scan event to the webview on [`SCAN_EVENT`] and re-reads the
/// tray's results when a scan ends. Must be called inside the Tauri runtime.
pub fn forward_events<R: Runtime>(app: &AppHandle<R>, rx: Receiver<ScanEvent>) {
    let handle = app.clone();
    tauri::async_runtime::spawn(pump(rx, move |event| {
        if let Err(e) = handle.emit(SCAN_EVENT, &event) {
            tracing::warn!(error = %e, "scan event not delivered");
        }
        if is_final(&event) {
            let h = handle.clone();
            tauri::async_runtime::spawn(async move { tray::reload(&h) });
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
            let transport = SshTransport::new().with_env(env.vars);
            let (core, rx) = AppCore::new(
                Arc::new(transport),
                Arc::new(HttpProbe::new()),
                FsStore::new(dir),
            );
            app.manage(core);

            forward_events(app.handle(), rx);

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
