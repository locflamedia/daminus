//! `settings.json`: user preferences. Never holds an API key (keys live in the
//! Keychain). Every field has a default so a hand-trimmed file still loads.
//! Defaults follow the Settings boards (General, Appearance, Scan, AI, Data).

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

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

impl ScanSettings {
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

impl Default for DataSettings {
    fn default() -> Self {
        Self {
            keep_scans: Some(20),
            forget_ai_after_days: Some(30),
        }
    }
}
