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

/// Seconds in a day.
const DAY_SECS: i64 = 86_400;

/// Days away after which a launch counts as a return rather than a daily one.
pub const RETURNING_AFTER_DAYS: i64 = 3;

/// Which journey the intro plays.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum LaunchKind {
    /// Never opened before.
    First,
    /// Back after at least [`RETURNING_AFTER_DAYS`] days.
    Returning,
    /// Opened recently.
    Daily,
}

/// What a launch found: the journey and when the app was last opened.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LaunchInfo {
    pub kind: LaunchKind,
    pub previous: Option<Timestamp>,
}

/// The journey for a launch at `now`, given the previous launch. A `previous` in the future
/// (the clock went backwards) counts as a daily launch.
pub fn launch_kind(previous: Option<Timestamp>, now: Timestamp) -> LaunchKind {
    let Some(previous) = previous else {
        return LaunchKind::First;
    };
    if now.unix().saturating_sub(previous.unix()) >= RETURNING_AFTER_DAYS * DAY_SECS {
        LaunchKind::Returning
    } else {
        LaunchKind::Daily
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000;

    fn kind(ago_secs: Option<i64>) -> LaunchKind {
        launch_kind(
            ago_secs.map(|s| Timestamp::from_unix(NOW - s)),
            Timestamp::from_unix(NOW),
        )
    }

    #[test]
    fn no_previous_launch_is_first() {
        assert_eq!(kind(None), LaunchKind::First);
    }

    #[test]
    fn three_days_exactly_is_returning() {
        assert_eq!(kind(Some(3 * DAY_SECS)), LaunchKind::Returning);
        assert_eq!(kind(Some(30 * DAY_SECS)), LaunchKind::Returning);
    }

    #[test]
    fn just_under_three_days_is_daily() {
        assert_eq!(kind(Some(2 * DAY_SECS + 23 * 3600)), LaunchKind::Daily);
        assert_eq!(kind(Some(3 * DAY_SECS - 1)), LaunchKind::Daily);
        assert_eq!(kind(Some(0)), LaunchKind::Daily);
    }

    #[test]
    fn a_previous_launch_in_the_future_is_daily() {
        assert_eq!(kind(Some(-DAY_SECS)), LaunchKind::Daily);
        assert_eq!(kind(Some(-10 * DAY_SECS)), LaunchKind::Daily);
    }

    #[test]
    fn kinds_serialize_in_snake_case() {
        let info = LaunchInfo {
            kind: LaunchKind::Returning,
            previous: None,
        };
        assert_eq!(
            serde_json::to_string(&info).unwrap(),
            r#"{"kind":"returning","previous":null}"#
        );
    }
}
