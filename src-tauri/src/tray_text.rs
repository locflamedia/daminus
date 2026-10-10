//! What the menu bar item shows, worked out from the saved results. Pure, so
//! it is tested without a menu bar. The words come from the UI's own locale
//! files (`src/i18n/*.json`, key `tray`), so en/vi stay in one place.
//!
//! Board Release assets › Menu bar: the icon is the template mark only (macOS
//! tints it); the count of criticals, or of warnings when there is none, is
//! plain text beside it, and a "!" stands there when no saved result can be
//! read, so the item never looks clean when it is not. The menu has six
//! states (not set up, config error, scanning, all clear, results unreadable,
//! needs attention); its summary lines are grey, and no item is a dead click.

use std::path::Path;

use daminus_core::domain::datetime::Timestamp;
use daminus_core::domain::error::{AppError, ErrorCode};
use daminus_core::domain::evaluate::{ProjectRollup, Report};
use daminus_core::domain::host::HostRef;
use daminus_core::domain::project::ProjectsFile;
use daminus_core::domain::severity::Level;
use daminus_core::scan::{HostState, ScanRun};
use serde_json::Value;
use time::UtcOffset;

const EN: &str = include_str!("../../src/i18n/en.json");
const VI: &str = include_str!("../../src/i18n/vi.json");

/// Menu item ids.
pub const SCAN_NOW: &str = "scan_now";
pub const STOP: &str = "stop_scan";
pub const SET_UP: &str = "set_up";
pub const OPEN_TO_FIX: &str = "open_to_fix";
pub const TRY_AGAIN: &str = "try_again";
pub const OPEN: &str = "open";
pub const QUIT: &str = "quit";
/// Prefix of the quick-open item id; the project id follows it.
pub const OPEN_PROJECT: &str = "open_project:";

/// The image of the item: the mark, or the mark at half opacity, breathing,
/// while a scan runs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayIcon {
    Mark,
    Scanning,
}

/// One clickable line of the menu.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrayItem {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    pub accelerator: Option<&'static str>,
}

/// Menu bar item contents.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrayView {
    pub icon: TrayIcon,
    /// Plain text beside the mark: "2", or "!" when nothing can be read.
    pub title: Option<String>,
    /// The grey lines at the top: "2 critical · 4 warnings", "Scan #12 · 13:42 · …".
    pub info: Vec<String>,
    pub items: Vec<TrayItem>,
}

impl TrayView {
    /// The text set beside the mark. Always a string: the menu bar keeps the
    /// last title when it is given none, so an empty one is what clears the
    /// count while scanning or when all is clear.
    pub fn title_text(&self) -> &str {
        self.title.as_deref().unwrap_or("")
    }

    /// The hover text: the grey lines, one after the other.
    pub fn tooltip(&self) -> String {
        std::iter::once("Daminus")
            .chain(self.info.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(" · ")
    }
}

/// What the view is built from.
pub struct Inputs<'a> {
    /// The last report that was read (kept when a later read fails).
    pub report: Option<&'a Report>,
    /// Why the latest read of the saved results failed, if it did.
    pub report_error: Option<&'a AppError>,
    /// `projects.json`, or why it could not be read.
    pub projects: Result<&'a ProjectsFile, &'a AppError>,
    /// The scan that is running.
    pub scan: Option<&'a ScanRun>,
    pub now: Timestamp,
    pub offset: UtcOffset,
}

/// Tray strings in one language, falling back to English per key.
pub struct Strings {
    lang: Value,
    en: Value,
}

impl Strings {
    pub fn new(language: &str) -> Self {
        let parse = |s: &str| serde_json::from_str::<Value>(s).unwrap_or(Value::Null);
        let en = parse(EN);
        let lang = match language {
            "vi" => parse(VI),
            _ => en.clone(),
        };
        Self { lang, en }
    }

    fn raw(&self, key: &str) -> String {
        [&self.lang, &self.en]
            .iter()
            .find_map(|v| v["tray"][key].as_str())
            .unwrap_or(key)
            .to_owned()
    }

    /// `key` with `{name}` placeholders filled. A `a | b` message picks the
    /// singular for `n` = 1 (vue-i18n plural syntax).
    pub fn t(&self, key: &str, params: &[(&str, &str)]) -> String {
        let raw = self.raw(key);
        let forms: Vec<&str> = raw.split(" | ").collect();
        let n = params.iter().find(|(k, _)| *k == "n").map(|(_, v)| *v);
        let mut text = match (forms.as_slice(), n) {
            ([one, other], Some(n)) => {
                if n == "1" {
                    (*one).to_owned()
                } else {
                    (*other).to_owned()
                }
            }
            _ => raw.clone(),
        };
        for (k, v) in params {
            text = text.replace(&format!("{{{k}}}"), v);
        }
        text
    }
}

/// Whether the icon holds still while scanning: the app's own animation
/// switch is off, or the system asks for reduced motion.
pub fn reduce_motion(app_animates: bool, os_reduces: bool) -> bool {
    os_reduces || !app_animates
}

fn item(
    id: impl Into<String>,
    label: String,
    enabled: bool,
    key: Option<&'static str>,
) -> TrayItem {
    TrayItem {
        id: id.into(),
        label,
        enabled,
        accelerator: key,
    }
}

/// Builds the view, one of the board's six menu states.
pub fn view(i: &Inputs<'_>, s: &Strings) -> TrayView {
    let scan_now = |enabled| item(SCAN_NOW, s.t("scanNow", &[]), enabled, Some("CmdOrCtrl+R"));
    let open = || item(OPEN, s.t("open", &[]), true, Some("CmdOrCtrl+O"));
    let fix = || item(OPEN_TO_FIX, s.t("openToFix", &[]), true, None);
    let quit = || item(QUIT, s.t("quit", &[]), true, Some("CmdOrCtrl+Q"));
    // A passing failure can be retried; anything else waits for a fix.
    let retry_or_dim = |e: &AppError| {
        if e.retryable || e.code == ErrorCode::StoreBusy {
            item(TRY_AGAIN, s.t("tryAgain", &[]), true, None)
        } else {
            scan_now(false)
        }
    };

    // Config error: nothing can be scanned until projects.json reads again.
    let projects = match i.projects {
        Ok(p) => p,
        Err(e) => {
            return TrayView {
                icon: TrayIcon::Mark,
                title: None,
                info: vec![s.t("cantScan", &[]), error_line(e, s)],
                items: vec![fix(), retry_or_dim(e), quit()],
            };
        }
    };

    // Scanning: no count, the mark breathes; Stop replaces Scan now.
    if let Some(run) = i.scan {
        let hosts: Vec<_> = run
            .hosts
            .iter()
            .filter(|(h, _)| !matches!(h, HostRef::Local))
            .collect();
        let done = hosts
            .iter()
            .filter(|(_, p)| matches!(p.state, HostState::Finished { .. }))
            .count();
        let started = clock(run.started_at, i.offset);
        return TrayView {
            icon: TrayIcon::Scanning,
            title: None,
            info: vec![
                s.t(
                    "scanningHosts",
                    &[("done", &done.to_string()), ("n", &hosts.len().to_string())],
                ),
                s.t("started", &[("time", &started)]),
            ],
            items: vec![item(STOP, s.t("stop", &[]), true, None), open(), quit()],
        };
    }

    // Not set up: Scan now would have nothing to scan, so it is dimmed and
    // "Set up Daminus…" opens the window on the empty app.
    if projects.projects.is_empty() {
        return TrayView {
            icon: TrayIcon::Mark,
            title: None,
            info: vec![s.t("never", &[])],
            items: vec![
                scan_now(false),
                item(SET_UP, s.t("setUp", &[]), true, None),
                open(),
                quit(),
            ],
        };
    }

    let scanned = i.report.and_then(|r| r.seq.zip(r.scanned_at));
    let (Some(report), Some((seq, at))) = (i.report, scanned) else {
        // Results unreadable, with nothing older to show: never a clean icon.
        if let Some(e) = i.report_error {
            return TrayView {
                icon: TrayIcon::Mark,
                title: Some("!".into()),
                info: vec![s.t("cantRead", &[]), error_line(e, s)],
                items: vec![fix(), retry_or_dim(e), quit()],
            };
        }
        return TrayView {
            icon: TrayIcon::Mark,
            title: None,
            info: vec![s.t("never", &[])],
            items: vec![scan_now(true), open(), quit()],
        };
    };

    // All clear, or needs attention (an old result reads the same, with its age).
    let counts = &report.counts;
    let title = match (counts.crit, counts.warn) {
        (0, 0) => None,
        (0, w) => Some(w.to_string()),
        (c, _) => Some(c.to_string()),
    };
    let mut parts = Vec::new();
    if counts.crit > 0 {
        parts.push(s.t("crit", &[("n", &counts.crit.to_string())]));
    }
    if counts.warn > 0 {
        parts.push(s.t("warn", &[("n", &counts.warn.to_string())]));
    }
    let headline = if parts.is_empty() {
        s.t("allClear", &[("n", &report.projects.len().to_string())])
    } else {
        parts.join(" · ")
    };

    let days = (i.now.inner() - at.inner()).whole_days();
    let when = if days >= 1 {
        s.t("daysAgo", &[("n", &days.to_string())])
    } else {
        clock(at, i.offset)
    };
    let mut detail = vec![s.t("scan", &[("seq", &seq.to_string()), ("time", &when)])];
    let attention = needs_you(report, projects);
    if let Some((_, name)) = &attention {
        detail.push(s.t("needs", &[("project", name)]));
    }

    let mut info = vec![headline, detail.join(" · ")];
    let mut items = vec![scan_now(true)];
    if i.report_error.is_some() {
        // Newer results cannot be read: keep the last good icon and count, and say so.
        info.push(s.t("showingOld", &[("seq", &seq.to_string())]));
        items.push(fix());
    } else {
        items.push(open());
    }
    if let Some((id, name)) = attention {
        items.push(item(
            format!("{OPEN_PROJECT}{id}"),
            s.t("openProject", &[("project", &name)]),
            true,
            None,
        ));
    }
    items.push(quit());
    TrayView {
        icon: TrayIcon::Mark,
        title,
        info,
        items,
    }
}

fn clock(at: Timestamp, offset: UtcOffset) -> String {
    let local = at.inner().to_offset(offset);
    format!("{:02}:{:02}", local.hour(), local.minute())
}

/// One short grey line saying what went wrong ("settings.json is damaged").
fn error_line(e: &AppError, s: &Strings) -> String {
    let file = |path: &str| {
        Path::new(path)
            .file_name()
            .map_or_else(|| path.to_owned(), |f| f.to_string_lossy().into_owned())
    };
    match &e.code {
        ErrorCode::ConfigInvalid {
            path,
            line: Some(line),
        } => s.t(
            "errLine",
            &[("file", &file(path)), ("line", &line.to_string())],
        ),
        ErrorCode::ConfigInvalid { path, line: None } => {
            s.t("errDamaged", &[("file", &file(path))])
        }
        ErrorCode::ConfigFromNewerVersion { path, .. } => s.t("errNewer", &[("file", &file(path))]),
        ErrorCode::ConfigChangedOnDisk { path } => s.t("errChanged", &[("file", &file(path))]),
        ErrorCode::Io { path } => s.t("errIo", &[("file", &file(path))]),
        ErrorCode::StoreBusy => s.t("errBusy", &[]),
        _ => s.t("errOther", &[]),
    }
}

/// The id and name of the project that needs a look most: the worst level,
/// then the most criticals, then the most warnings; the first in the report
/// on a full tie.
fn needs_you(report: &Report, projects: &ProjectsFile) -> Option<(String, String)> {
    let rank = |l: Level| match l {
        Level::Crit => 2,
        Level::Warn => 1,
        _ => 0,
    };
    let key = |p: &ProjectRollup| (rank(p.level), p.counts.crit, p.counts.warn);
    let worst = report.projects.iter().filter(|p| rank(p.level) > 0).fold(
        None,
        |best: Option<&ProjectRollup>, p| match best {
            Some(b) if key(b) >= key(p) => Some(b),
            _ => Some(p),
        },
    )?;
    projects
        .projects
        .iter()
        .find(|p| p.id == worst.id)
        .map(|p| (p.id.clone(), p.name.clone()))
}

#[cfg(test)]
#[path = "tray_text_tests.rs"]
mod tests;
