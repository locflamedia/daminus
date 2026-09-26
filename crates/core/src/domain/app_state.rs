//! `state.json`: small bookkeeping the app keeps between launches. Not user
//! data: a damaged file is set aside and replaced by defaults.

use serde::{Deserialize, Serialize};

use super::datetime::{Day, Timestamp};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AppState {
    /// Last launch, to pick the intro stations (first run, back after days, daily).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened_at: Option<Timestamp>,
    /// Clean weeks in a row (sidebar streak, one star per week).
    pub streak_weeks: u32,
    /// First day of the last week counted into the streak.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streak_week_start: Option<Day>,
    /// AI requests sent after the payload review screen was shown.
    pub ai_reviewed_sends: u32,
}
