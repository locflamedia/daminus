//! The menu bar item (board Release assets › Menu bar; design decision 15).
//!
//! Idle: the black template mark, tinted by macOS. Scanning: the mark at
//! half opacity, breathing slowly (held still under Reduce Motion). Warning / critical: an amber or pink dot
//! beside the mark. A coloured dot cannot live in a template image, so those
//! two states use a plain image with the mark drawn in the colour of the
//! current appearance (see ui-change-requests). Nothing scans in the
//! background: the item only reflects scans the user started.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use daminus_core::domain::evaluate::Report;
use daminus_core::scan::ScanScope;
use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, Theme};
use time::UtcOffset;

use crate::app::AppCore;
use crate::tray_text::{Strings, TrayLevel, TrayView, reduce_motion, view};

const MARK_2X: &[u8] = include_bytes!("../../assets/brand/menubar-template@2x.png");
const TRAY_ID: &str = "daminus";
const AMBER: [u8; 3] = [0xE9, 0xA2, 0x3B];
const PINK: [u8; 3] = [0xE5, 0x57, 0x7E];
/// One breath: opacity 0.3 → 0.7 → 0.3 around the board's 0.5.
const BREATH_FRAMES: usize = 16;
const BREATH_FRAME: Duration = Duration::from_millis(150);

/// Menu item ids.
pub const SCAN_NOW: &str = "scan_now";
pub const OPEN: &str = "open";
pub const QUIT: &str = "quit";
/// Prefix of the quick-open item id; the project id follows it.
pub const OPEN_PROJECT: &str = "open_project:";
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
    /// The last read failed.
    report_error: bool,
    level: Option<TrayLevel>,
    dark: bool,
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

    /// The mark in black or white with a 6 pt dot at its top right.
    fn with_dot(&self, dot: [u8; 3], dark: bool) -> Image<'static> {
        let mut px = self.rgba.clone();
        let ink = if dark { 255 } else { 0 };
        for p in px.as_chunks_mut::<4>().0 {
            p[..3].fill(ink);
        }
        // 18 pt icon at 2×: a 12 px dot centred 3 pt in from the top right corner.
        let (cx, cy, r) = (self.width as f32 - 6.0, 6.0, 6.0);
        for y in 0..self.height {
            for x in 0..self.width {
                let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
                // Clear a ring around the dot so it reads against the mark.
                let i = ((y * self.width + x) * 4) as usize;
                let Some(p) = px.get_mut(i..i + 4) else {
                    continue;
                };
                if d <= r {
                    let cover = (r - d + 0.5).clamp(0.0, 1.0);
                    p[0] = dot[0];
                    p[1] = dot[1];
                    p[2] = dot[2];
                    p[3] = (cover * 255.0) as u8;
                } else if d <= r + 2.0 {
                    p[3] = 0;
                }
            }
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
                    s.report_error = false;
                }
                Err(e) => {
                    tracing::warn!(error = ?e.code, "tray: report not read; keeping the last one");
                    s.report_error = true;
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
        let scanning = core.scan_status().is_some();
        let projects = core.projects().unwrap_or_default();
        let settings = core.settings_get().ok();
        let language = core.language();
        // Read each time, so a change applies from the next scan.
        let still = reduce_motion(
            settings
                .as_ref()
                .is_none_or(|s| s.appearance.animate_charts),
            os_reduces_motion(app),
        );
        let dark = app
            .get_webview_window("main")
            .and_then(|w| w.theme().ok())
            .is_some_and(|t| t == Theme::Dark);
        let Ok(mut s) = self.state.lock() else {
            return;
        };
        let v = view(
            s.report.as_ref(),
            s.report_error,
            &projects,
            scanning,
            &Strings::new(&language),
            self.offset,
        );
        if let Err(e) = self.set_menu(app, &v) {
            tracing::warn!(error = %e, "tray: menu not set");
        }
        let _ = self.icon.set_tooltip(Some(tooltip(&v)));
        if s.level == Some(v.level) && s.dark == dark {
            return;
        }
        s.level = Some(v.level);
        s.dark = dark;
        // Stops a breathing loop. It sets each frame under this lock after
        // checking the counter, so no frame can land after the icon below.
        s.icon_gen += 1;
        let result = match v.level {
            TrayLevel::Idle => self
                .icon
                .set_icon_with_as_template(Some(self.mark.faded(1.0)), true),
            TrayLevel::Warn => self
                .icon
                .set_icon_with_as_template(Some(self.mark.with_dot(AMBER, dark)), false),
            TrayLevel::Crit => self
                .icon
                .set_icon_with_as_template(Some(self.mark.with_dot(PINK, dark)), false),
            TrayLevel::Scanning if still => self
                .icon
                .set_icon_with_as_template(Some(self.mark.faded(0.5)), true),
            TrayLevel::Scanning => {
                self.breathe(s.icon_gen);
                Ok(())
            }
        };
        if let Err(e) = result {
            tracing::warn!(error = %e, "tray: icon not set");
        }
    }

    /// Loops the half-opacity mark through one slow breath until the icon
    /// changes again (`icon_gen` moves on).
    fn breathe(self: &Arc<Self>, generation: u64) {
        let frames: Vec<Image<'static>> = (0..BREATH_FRAMES)
            .map(|i| {
                let phase = i as f32 / BREATH_FRAMES as f32 * std::f32::consts::TAU;
                self.mark.faded(0.5 - 0.2 * phase.cos())
            })
            .collect();
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

    fn set_menu(&self, app: &AppHandle<R>, v: &TrayView) -> tauri::Result<()> {
        let headline = MenuItem::new(app, &v.headline, false, None::<&str>)?;
        let detail = MenuItem::new(app, &v.detail, false, None::<&str>)?;
        let scan = MenuItem::with_id(app, SCAN_NOW, &v.scan_now, true, Some("CmdOrCtrl+R"))?;
        let open = MenuItem::with_id(app, OPEN, &v.open, true, Some("CmdOrCtrl+O"))?;
        let quit = MenuItem::with_id(app, QUIT, &v.quit, true, Some("CmdOrCtrl+Q"))?;
        let quick = match &v.attention {
            Some(a) => Some(MenuItem::with_id(
                app,
                format!("{OPEN_PROJECT}{}", a.project_id),
                &a.label,
                true,
                None::<&str>,
            )?),
            None => None,
        };
        let mut items: Vec<&dyn IsMenuItem<R>> = vec![&headline];
        if !v.detail.is_empty() {
            items.push(&detail);
        }
        items.push(&scan);
        items.push(&open);
        if let Some(q) = &quick {
            items.push(q);
        }
        items.push(&quit);
        let menu = Menu::with_items(app, &items)?;
        self.icon.set_menu(Some(menu))
    }
}

fn tooltip(v: &TrayView) -> String {
    if v.detail.is_empty() {
        format!("Daminus · {}", v.headline)
    } else {
        format!("Daminus · {} · {}", v.headline, v.detail)
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
        OPEN => crate::show_main(app),
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
