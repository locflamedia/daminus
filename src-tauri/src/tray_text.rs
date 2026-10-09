//! What the menu bar item shows, worked out from the latest report. Pure, so
//! it is tested without a menu bar. The words come from the UI's own locale
//! files (`src/i18n/*.json`, key `tray`), so en/vi stay in one place.

use daminus_core::domain::evaluate::{ProjectRollup, Report};
use daminus_core::domain::project::ProjectsFile;
use daminus_core::domain::severity::Level;
use serde_json::Value;
use time::UtcOffset;

const EN: &str = include_str!("../../src/i18n/en.json");
const VI: &str = include_str!("../../src/i18n/vi.json");

/// The icon state (board Release assets › Menu bar).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayLevel {
    Idle,
    Scanning,
    Warn,
    Crit,
}

/// Menu bar item contents.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrayView {
    pub level: TrayLevel,
    /// "2 critical · 4 warnings".
    pub headline: String,
    /// "Scan #12 · 13:42 · kho-hang needs you".
    pub detail: String,
    pub scan_now: String,
    pub open: String,
    /// The project that needs a look, for the quick-open item. `None` when
    /// there is nothing to look at (or a scan is running).
    pub attention: Option<Attention>,
    pub quit: String,
}

/// The worst project and the label of its quick-open item.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Attention {
    pub project_id: String,
    /// "Open kho-hang".
    pub label: String,
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

/// Builds the view. `report` is the last one read (`None` before any read
/// worked); `report_error` says the latest read failed, so "no report" is not
/// shown as "never scanned".
pub fn view(
    report: Option<&Report>,
    report_error: bool,
    projects: &ProjectsFile,
    scanning: bool,
    s: &Strings,
    offset: UtcOffset,
) -> TrayView {
    let counts = report.map(|r| r.counts.clone()).unwrap_or_default();
    let scanned = report.and_then(|r| r.seq.zip(r.scanned_at));
    let level = if scanning {
        TrayLevel::Scanning
    } else if counts.crit > 0 {
        TrayLevel::Crit
    } else if counts.warn > 0 {
        TrayLevel::Warn
    } else {
        TrayLevel::Idle
    };

    let mut parts = Vec::new();
    if counts.crit > 0 {
        parts.push(s.t("crit", &[("n", &counts.crit.to_string())]));
    }
    if counts.warn > 0 {
        parts.push(s.t("warn", &[("n", &counts.warn.to_string())]));
    }
    let headline = match (parts.is_empty(), scanned.is_some()) {
        (false, _) => parts.join(" · "),
        (true, true) => s.t("clear", &[]),
        (true, false) if report_error && report.is_none() => s.t("unreadable", &[]),
        (true, false) => s.t("never", &[]),
    };

    let mut detail = Vec::new();
    let mut attention = None;
    if scanning {
        detail.push(s.t("scanning", &[]));
    } else if let Some((seq, at)) = scanned {
        let local = at.inner().to_offset(offset);
        let time = format!("{:02}:{:02}", local.hour(), local.minute());
        detail.push(s.t("scan", &[("seq", &seq.to_string()), ("time", &time)]));
        if let Some((id, name)) = report.and_then(|r| needs_you(r, projects)) {
            detail.push(s.t("needs", &[("project", &name)]));
            attention = Some(Attention {
                project_id: id,
                label: s.t("openProject", &[("project", &name)]),
            });
        }
    }

    TrayView {
        level,
        headline,
        detail: detail.join(" · "),
        scan_now: s.t("scanNow", &[]),
        open: s.t("open", &[]),
        attention,
        quit: s.t("quit", &[]),
    }
}

/// The id and name of the project with the worst open issue (first on a tie).
fn needs_you(report: &Report, projects: &ProjectsFile) -> Option<(String, String)> {
    let rank = |l: Level| match l {
        Level::Crit => 2,
        Level::Warn => 1,
        _ => 0,
    };
    let worst = report.projects.iter().filter(|p| rank(p.level) > 0).fold(
        None,
        |best: Option<&ProjectRollup>, p| match best {
            Some(b) if rank(b.level) >= rank(p.level) => Some(b),
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
mod tests {
    use daminus_core::domain::datetime::Timestamp;
    use daminus_core::domain::evaluate::Counts;
    use serde_json::json;

    use super::*;

    fn projects() -> ProjectsFile {
        serde_json::from_value(json!({
            "version": 1,
            "projects": [
                {"id": "a", "name": "tiemtra", "urls": [], "components": []},
                {"id": "b", "name": "kho-hang", "urls": [], "components": []}
            ]
        }))
        .unwrap()
    }

    fn rollup(id: &str, level: Level) -> ProjectRollup {
        ProjectRollup {
            id: id.into(),
            level,
            counts: Counts::default(),
            main_issue: None,
            unreachable_hosts: vec![],
            not_scanned_hosts: vec![],
        }
    }

    fn report(crit: u32, warn: u32) -> Report {
        let at = Timestamp::from_unix(1_790_430_120); // 2026-09-26 13:42 UTC
        Report {
            seq: Some(12),
            scanned_at: Some(at),
            evaluated_at: at,
            items: vec![],
            projects: vec![rollup("a", Level::Warn), rollup("b", Level::Crit)],
            servers: vec![],
            disabled_groups: vec![],
            rules_due: vec![],
            counts: Counts {
                crit,
                warn,
                ..Counts::default()
            },
        }
    }

    #[test]
    fn matches_the_board_example() {
        let v = view(
            Some(&report(2, 4)),
            false,
            &projects(),
            false,
            &Strings::new("en"),
            UtcOffset::UTC,
        );
        assert_eq!(v.level, TrayLevel::Crit);
        assert_eq!(v.headline, "2 critical · 4 warnings");
        assert_eq!(v.detail, "Scan #12 · 13:42 · kho-hang needs you");
        assert_eq!(
            (v.scan_now.as_str(), v.open.as_str(), v.quit.as_str()),
            ("Scan now", "Open Daminus", "Quit")
        );
    }

    #[test]
    fn reduce_motion_follows_either_switch() {
        assert!(!reduce_motion(true, false));
        assert!(reduce_motion(false, false));
        assert!(reduce_motion(true, true));
    }

    #[test]
    fn quick_open_names_the_worst_project() {
        let at = |s: &Strings, r: &Report, scanning| {
            view(Some(r), false, &projects(), scanning, s, UtcOffset::UTC).attention
        };
        let en = Strings::new("en");
        let a = at(&en, &report(2, 4), false).unwrap();
        assert_eq!(
            (a.project_id.as_str(), a.label.as_str()),
            ("b", "Open kho-hang")
        );
        let vi = at(&Strings::new("vi"), &report(2, 4), false).unwrap();
        assert_eq!(vi.label, "Mở kho-hang");

        // Nothing to look at, or a scan running: no item.
        let mut clear = report(0, 0);
        clear.projects = vec![rollup("a", Level::Ok)];
        assert_eq!(at(&en, &clear, false), None);
        assert_eq!(at(&en, &report(2, 4), true), None);
        assert_eq!(
            view(None, false, &projects(), false, &en, UtcOffset::UTC).attention,
            None
        );
    }

    #[test]
    fn plural_local_time_and_vietnamese() {
        let s = Strings::new("en");
        let v = view(
            Some(&report(0, 1)),
            false,
            &projects(),
            false,
            &s,
            UtcOffset::from_hms(7, 0, 0).unwrap(),
        );
        assert_eq!(v.level, TrayLevel::Warn);
        assert_eq!(v.headline, "1 warning");
        assert!(v.detail.starts_with("Scan #12 · 20:42"), "{}", v.detail);

        let vi = view(
            Some(&report(2, 3)),
            false,
            &projects(),
            false,
            &Strings::new("vi"),
            UtcOffset::UTC,
        );
        assert_eq!(vi.headline, "2 nghiêm trọng · 3 cảnh báo");
        assert_eq!(vi.detail, "Lần quét #12 · 13:42 · kho-hang cần xem");
    }

    #[test]
    fn scanning_and_empty_states() {
        let s = Strings::new("en");
        let v = view(
            Some(&report(2, 0)),
            false,
            &projects(),
            true,
            &s,
            UtcOffset::UTC,
        );
        assert_eq!(v.level, TrayLevel::Scanning);
        assert_eq!(v.headline, "2 critical");
        assert_eq!(v.detail, "Scanning…");
        let never = view(None, false, &projects(), false, &s, UtcOffset::UTC);
        assert_eq!(
            (never.level, never.headline.as_str()),
            (TrayLevel::Idle, "No scans yet")
        );
        assert_eq!(never.detail, "");

        // A failed read is not "never scanned"; a last good report still shows.
        let broken = view(None, true, &projects(), false, &s, UtcOffset::UTC);
        assert_eq!(
            (broken.level, broken.headline.as_str()),
            (TrayLevel::Idle, "Results could not be read")
        );
        let kept = view(
            Some(&report(2, 0)),
            true,
            &projects(),
            false,
            &s,
            UtcOffset::UTC,
        );
        assert_eq!(
            (kept.level, kept.headline.as_str()),
            (TrayLevel::Crit, "2 critical")
        );
    }
}
