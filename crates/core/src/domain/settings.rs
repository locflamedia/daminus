//! `settings.json`: user preferences. Never holds an API key (keys live in the
//! Keychain). Every field has a default so a hand-trimmed file still loads.
//! Defaults follow the Settings boards (General, Appearance, Scan, AI, Data).

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::error::{AppError, ErrorCode};
use super::manifest::CheckGroup;
use super::rule::ThresholdOverride;

/// Current `settings.json` format version.
pub const SETTINGS_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Settings {
    pub version: u32,
    pub general: GeneralSettings,
    pub appearance: AppearanceSettings,
    pub scan: ScanSettings,
    pub ai: AiSettings,
    pub data: DataSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            general: GeneralSettings::default(),
            appearance: AppearanceSettings::default(),
            scan: ScanSettings::default(),
            ai: AiSettings::default(),
            data: DataSettings::default(),
        }
    }
}

/// The app languages with a complete translation, as language tags.
pub const LANGUAGES: [&str; 2] = ["en", "vi"];

impl Settings {
    /// Checks every field the app reads; a hand-edited or forged value is refused with
    /// `SchemaInvalid` and the name of the field, never the value.
    pub fn validate(&self) -> Result<(), AppError> {
        self.general.validate()?;
        self.scan.validate()?;
        self.ai.validate()?;
        self.data.validate()
    }
}

fn invalid(field: &str) -> AppError {
    AppError::from(ErrorCode::SchemaInvalid).with_param("detail", field)
}

impl GeneralSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if !LANGUAGES.contains(&self.language.as_str()) {
            return Err(invalid("general.language"));
        }
        if let Some(tag) = &self.ai_language
            && !LANGUAGES.contains(&tag.as_str())
        {
            return Err(invalid("general.ai_language"));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum IntroMode {
    #[default]
    FirstLaunch,
    Always,
    Never,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct GeneralSettings {
    /// App language tag (`en`, `vi`).
    pub language: String,
    /// Language for AI answers; `None` follows the app language.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_language: Option<String>,
    pub scan_on_open: bool,
    pub intro: IntroMode,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            language: "en".into(),
            ai_language: None,
            scan_on_open: false,
            intro: IntroMode::FirstLaunch,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AppearanceSettings {
    pub theme: Theme,
    pub reduce_transparency: bool,
    pub animate_charts: bool,
    pub clear_sky: bool,
    pub streak_badge: bool,
    pub completion_chime: bool,
    pub easter_eggs: bool,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            reduce_transparency: false,
            animate_charts: true,
            clear_sky: true,
            streak_badge: true,
            completion_chime: false,
            easter_eggs: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ScanSettings {
    /// Check groups switched off. `system` cannot be switched off and is ignored here.
    pub disabled_groups: BTreeSet<CheckGroup>,
    /// Paths skipped by `du` and file checks.
    pub skip_paths: Vec<String>,
    /// Floor for the large-files list, in MB.
    pub large_file_mb: u32,
    /// SSH connect timeout in seconds (Settings › Scan offers 5 / 10 / 30).
    /// Only the TCP connect and handshake; each reachable host then has a
    /// fixed 90 s budget for its bundle.
    pub connect_timeout_s: u32,
    /// Hosts scanned at once (1 / 2 / 4); `None` = Auto, the number of hosts
    /// capped at 8.
    pub hosts_at_once: Option<u32>,
    /// Threshold overrides on top of the manifest (disk, container memory, certificate, restarts).
    pub thresholds: Vec<ThresholdOverride>,
}

impl Default for ScanSettings {
    fn default() -> Self {
        Self {
            disabled_groups: BTreeSet::from([CheckGroup::CodeChanges]),
            skip_paths: [
                "node_modules",
                "vendor",
                "storage/framework/cache",
                ".next/cache",
                "/proc",
                "/var/lib/docker/overlay2",
            ]
            .map(String::from)
            .to_vec(),
            large_file_mb: 50,
            connect_timeout_s: 10,
            hosts_at_once: None,
            thresholds: Vec::new(),
        }
    }
}

/// Connect timeouts Settings › Scan offers, in seconds.
pub const CONNECT_TIMEOUTS: [u32; 3] = [5, 10, 30];
/// Most hosts a scan may run at once (Auto stops here too).
pub const MAX_HOSTS_AT_ONCE: u32 = 8;
const MAX_SKIP_PATHS: usize = 64;
const MAX_SKIP_PATH_LEN: usize = 200;
const MAX_LARGE_FILE_MB: u32 = 100_000;
const MAX_THRESHOLDS: usize = 32;
const MAX_THRESHOLD: f64 = 100_000.0;

impl ScanSettings {
    /// Checks what the scan reads: a path that could be taken for an option or hold a control
    /// character is refused with the name of the field, never its value.
    pub fn validate(&self) -> Result<(), AppError> {
        if !CONNECT_TIMEOUTS.contains(&self.connect_timeout_s) {
            return Err(invalid("scan.connect_timeout_s"));
        }
        if self
            .hosts_at_once
            .is_some_and(|n| n == 0 || n > MAX_HOSTS_AT_ONCE)
        {
            return Err(invalid("scan.hosts_at_once"));
        }
        if self.large_file_mb == 0 || self.large_file_mb > MAX_LARGE_FILE_MB {
            return Err(invalid("scan.large_file_mb"));
        }
        let path_ok = |p: &String| {
            let t = p.trim();
            !t.is_empty()
                && t == p
                && p.chars().count() <= MAX_SKIP_PATH_LEN
                && !p.starts_with('-')
                && !p.chars().any(char::is_control)
        };
        if self.skip_paths.len() > MAX_SKIP_PATHS || !self.skip_paths.iter().all(path_ok) {
            return Err(invalid("scan.skip_paths"));
        }
        let number_ok =
            |n: Option<f64>| n.is_none_or(|v| v.is_finite() && (0.0..=MAX_THRESHOLD).contains(&v));
        let threshold_ok = |o: &ThresholdOverride| {
            !o.check.is_empty()
                && o.check.len() <= 64
                && o.check
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
                && number_ok(o.warn)
                && number_ok(o.crit)
                && number_ok(o.min)
        };
        if self.thresholds.len() > MAX_THRESHOLDS || !self.thresholds.iter().all(threshold_ok) {
            return Err(invalid("scan.thresholds"));
        }
        Ok(())
    }

    pub fn group_enabled(&self, group: CheckGroup) -> bool {
        !group.can_disable() || !self.disabled_groups.contains(&group)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AiSettings {
    /// Selected provider id; `None` = AI off (the default).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// The user accepted the Claude Code (Beta) warning.
    pub claude_code_acknowledged: bool,
    /// A custom endpoint for the selected provider; `None` uses the profile's own.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

/// Longest provider id, model name or base URL kept in the file.
pub const MAX_AI_FIELD_CHARS: usize = 300;

impl AiSettings {
    /// Shape only: the provider id and the URL are checked against the profiles
    /// where they are used (`daminus_core::ai::view::check_ai_settings`).
    pub fn validate(&self) -> Result<(), AppError> {
        let fields = [
            ("ai.provider", &self.provider),
            ("ai.model", &self.model),
            ("ai.base_url", &self.base_url),
        ];
        for (name, value) in fields {
            let too_long = value
                .as_deref()
                .is_some_and(|v| v.chars().count() > MAX_AI_FIELD_CHARS || v.contains('\0'));
            if too_long {
                return Err(invalid(name));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct DataSettings {
    /// Snapshots to keep; `None` keeps all.
    pub keep_scans: Option<u32>,
    /// Days before AI replies are forgotten; `None` = never.
    pub forget_ai_after_days: Option<u32>,
}

/// Most scans Settings › Data may keep.
pub const MAX_KEEP_SCANS: u32 = 1000;
/// Most days AI replies may be kept.
pub const MAX_FORGET_DAYS: u32 = 3650;

impl DataSettings {
    /// A limit of zero would delete every scan the moment it ends; a huge one is a typo.
    pub fn validate(&self) -> Result<(), AppError> {
        if self
            .keep_scans
            .is_some_and(|n| n == 0 || n > MAX_KEEP_SCANS)
        {
            return Err(invalid("data.keep_scans"));
        }
        if self
            .forget_ai_after_days
            .is_some_and(|n| n == 0 || n > MAX_FORGET_DAYS)
        {
            return Err(invalid("data.forget_ai_after_days"));
        }
        Ok(())
    }
}

impl Default for DataSettings {
    fn default() -> Self {
        Self {
            keep_scans: Some(20),
            forget_ai_after_days: Some(30),
        }
    }
}
