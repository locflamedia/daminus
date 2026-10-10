//! The menu bar item (board Release assets › Menu bar).
//!
//! The icon is the template mark only, so macOS tints it to suit the bar and
//! the wallpaper. Beside it, as plain text that takes the bar's colour too:
//! the count of criticals (or of warnings when there is none), or "!" when no
//! saved result can be read. While a scan runs the mark is at half opacity and
//! breathes by swapping two template frames, still under Reduce Motion, with no
//! count. Nothing scans in the background: the item only reflects scans the
//! user started, and starts one when asked.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use daminus_core::domain::datetime::Timestamp;
use daminus_core::domain::error::AppError;
use daminus_core::domain::evaluate::Report;
use daminus_core::scan::ScanScope;
use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use time::UtcOffset;

use crate::app::AppCore;
use crate::tray_text::{
    Inputs, OPEN, OPEN_PROJECT, OPEN_TO_FIX, QUIT, SCAN_NOW, SET_UP, STOP, Strings, TRY_AGAIN,
    TrayIcon as Icon, TrayView, reduce_motion, view,
};

const MARK_2X: &[u8] = include_bytes!("../../assets/brand/menubar-template@2x.png");
const TRAY_ID: &str = "daminus";
/// The two frames of a breath, swapped while a scan runs.
const BREATH: [f32; 2] = [0.5, 0.3];
const BREATH_FRAME: Duration = Duration::from_millis(1200);

/// Emitted to the webview when the quick-open item is chosen; the payload is
/// `{ "project_id": "<id>" }`.
pub const OPEN_PROJECT_EVENT: &str = "tray://open-project";

#[derive(Clone, serde::Serialize)]
struct OpenProject {
    project_id: String,
}

/// The tray and what it last showed.
pub struct Tray<R: Runtime> {
    icon: TrayIcon<R>,
    mark: Mark,
    offset: UtcOffset,
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    /// The last report read; kept when a later read fails.
    report: Option<Report>,
    /// Why the last read failed, if it did.
    report_error: Option<AppError>,
    icon: Option<Icon>,
    /// Bumped on every icon change; a breathing loop stops once it differs
    /// from the value it started with.
    icon_gen: u64,
}

/// The template mark as RGBA pixels.
#[derive(Clone)]
struct Mark {
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

impl Mark {
    fn load() -> tauri::Result<Self> {
        let img = Image::from_bytes(MARK_2X)?;
        Ok(Self {
            rgba: img.rgba().to_vec(),
            width: img.width(),
            height: img.height(),
        })
    }

    /// The template at `alpha` (0–1) opacity.
    fn faded(&self, alpha: f32) -> Image<'static> {
        let mut px = self.rgba.clone();
        for a in px.iter_mut().skip(3).step_by(4) {
            *a = (f32::from(*a) * alpha).round().clamp(0.0, 255.0) as u8;
        }
        Image::new_owned(px, self.width, self.height)
    }
}

impl<R: Runtime> Tray<R> {
    /// Adds the item to the menu bar, showing the saved results.
    pub fn build(app: &AppHandle<R>, offset: UtcOffset) -> tauri::Result<Arc<Self>> {
        let mark = Mark::load()?;
        let icon = TrayIconBuilder::with_id(TRAY_ID)
            .icon(mark.faded(1.0))
            .icon_as_template(true)
            .show_menu_on_left_click(true)
            .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
            .build(app)?;
        let tray = Arc::new(Self {
            icon,
            mark,
            offset,
            state: Mutex::new(State::default()),
        });
        Ok(tray)
    }

    /// Re-reads the saved results (after a scan ends, at launch).
    pub fn reload(self: &Arc<Self>, app: &AppHandle<R>) {
        let Some(core) = app.try_state::<AppCore>() else {
            return;
        };
        let read = core.report_latest();
        if let Ok(mut s) = self.state.lock() {
            match read {
                Ok(r) => {
                    s.report = Some(r);
                    s.report_error = None;
                }
                Err(e) => {
                    tracing::warn!(error = ?e.code, "tray: report not read; keeping the last one");
                    s.report_error = Some(e);
                }
            }
        }
        self.show(app);
    }

    /// Redraws from the last report and whether a scan is running. Blocks on
    /// the main thread, so never call it from there (spawn it instead).
    pub fn show(self: &Arc<Self>, app: &AppHandle<R>) {
        let Some(core) = app.try_state::<AppCore>() else {
            return;
        };
        let scan = core.scan_status();
        let projects = core.projects();
        let settings = core.settings_get().ok();
        let language = core.language();
        // Read each time, so a change applies from the next scan.
        let still = reduce_motion(
            settings
                .as_ref()
                .is_none_or(|s| s.appearance.animate_charts),
            os_reduces_motion(app),
        );
        let Ok(mut s) = self.state.lock() else {
            return;
        };
        let v = view(
            &Inputs {
                report: s.report.as_ref(),
                report_error: s.report_error.as_ref(),
                projects: projects.as_ref(),
                scan: scan.as_ref(),
                now: Timestamp::new(time::OffsetDateTime::now_utc()),
                offset: self.offset,
            },
            &Strings::new(&language),
        );
        if let Err(e) = self.set_menu(app, &v) {
            tracing::warn!(error = %e, "tray: menu not set");
        }
        let _ = self.icon.set_tooltip(Some(v.tooltip()));
        // Plain text beside the mark; macOS draws it in the bar's colour.
        let _ = self.icon.set_title(v.title.as_deref());
        if s.icon == Some(v.icon) {
            return;
        }
        s.icon = Some(v.icon);
        // Stops a breathing loop. It sets each frame under this lock after
        // checking the counter, so no frame can land after the icon below.
        s.icon_gen += 1;
        let result = match v.icon {
            Icon::Mark => self
                .icon
                .set_icon_with_as_template(Some(self.mark.faded(1.0)), true),
            Icon::Scanning if still => self
                .icon
                .set_icon_with_as_template(Some(self.mark.faded(BREATH[0])), true),
            Icon::Scanning => {
                self.breathe(s.icon_gen);
                Ok(())
            }
        };
        if let Err(e) = result {
            tracing::warn!(error = %e, "tray: icon not set");
        }
    }

    /// Swaps the two half-opacity template frames until the icon changes
    /// again (`icon_gen` moves on).
    fn breathe(self: &Arc<Self>, generation: u64) {
        let frames: Vec<Image<'static>> = BREATH.iter().map(|a| self.mark.faded(*a)).collect();
        let tray = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            for frame in frames.iter().cycle() {
                {
                    let Ok(s) = tray.state.lock() else { return };
                    if s.icon_gen != generation
                        || tray
                            .icon
                            .set_icon_with_as_template(Some(frame.clone()), true)
                            .is_err()
                    {
                        return;
                    }
                }
                tokio::time::sleep(BREATH_FRAME).await;
            }
        });
    }

    /// The grey lines (disabled items: a native menu cannot bold a line), a
    /// separator, then the actions, with Quit after one more separator.
    fn set_menu(&self, app: &AppHandle<R>, v: &TrayView) -> tauri::Result<()> {
        let mut owned: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
        for line in &v.info {
            owned.push(Box::new(MenuItem::new(app, line, false, None::<&str>)?));
        }
        owned.push(Box::new(PredefinedMenuItem::separator(app)?));
        for it in &v.items {
            if it.id == QUIT {
                owned.push(Box::new(PredefinedMenuItem::separator(app)?));
            }
            owned.push(Box::new(MenuItem::with_id(
                app,
                &it.id,
                &it.label,
                it.enabled,
                it.accelerator,
            )?));
        }
        let items: Vec<&dyn IsMenuItem<R>> = owned.iter().map(AsRef::as_ref).collect();
        let menu = Menu::with_items(app, &items)?;
        self.icon.set_menu(Some(menu))
    }
}

fn on_menu<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        SCAN_NOW => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(core) = app.try_state::<AppCore>() {
                    match core.scan_start(&ScanScope::default()) {
                        Ok(started) => {
                            tracing::info!(scan = %started.scan_id, joined = started.joined, "scan from menu bar")
                        }
                        Err(e) => tracing::warn!(error = ?e.code, "scan from menu bar not started"),
                    }
                }
                refresh(&app);
            });
        }
        STOP => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(core) = app.try_state::<AppCore>() {
                    core.scan_stop();
                }
                refresh(&app);
            });
        }
        TRY_AGAIN => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move { reload(&app) });
        }
        // The window shows the empty app when nothing is set up, and the
        // error where it is when a file cannot be read.
        OPEN | SET_UP | OPEN_TO_FIX => crate::show_main(app),
        QUIT => app.exit(0),
        _ => {
            if let Some(project_id) = id.strip_prefix(OPEN_PROJECT) {
                crate::show_main(app);
                let payload = OpenProject {
                    project_id: project_id.to_owned(),
                };
                if let Err(e) = app.emit(OPEN_PROJECT_EVENT, payload) {
                    tracing::warn!(error = %e, "tray: open-project event not sent");
                }
            }
        }
    }
}

/// Redraws the tray, if there is one.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    if let Some(t) = app.try_state::<Arc<Tray<R>>>() {
        t.show(app);
    }
}

/// Re-reads results and redraws the tray, if there is one.
pub fn reload<R: Runtime>(app: &AppHandle<R>) {
    if let Some(t) = app.try_state::<Arc<Tray<R>>>() {
        t.reload(app);
    }
}

/// macOS "Reduce motion" (System Settings › Accessibility › Display). Asked on
/// the main thread; `false` if that cannot be reached in time.
#[cfg(target_os = "macos")]
fn os_reduces_motion<R: Runtime>(app: &AppHandle<R>) -> bool {
    let (tx, rx) = std::sync::mpsc::channel();
    let asked = app.run_on_main_thread(move || {
        let reduced =
            objc2_app_kit::NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion();
        let _ = tx.send(reduced);
    });
    asked.is_ok() && rx.recv_timeout(Duration::from_millis(500)).unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn os_reduces_motion<R: Runtime>(_app: &AppHandle<R>) -> bool {
    false
}
