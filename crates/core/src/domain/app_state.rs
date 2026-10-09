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
    /// The week in `streak_week_start` had a critical finding, so it does not count.
    pub streak_week_critical: bool,
    /// AI requests sent after the payload review screen was shown.
    pub ai_reviewed_sends: u32,
}

/// The streak as the UI shows it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct StreakInfo {
    pub weeks: u32,
}

/// Days in a week.
const WEEK_DAYS: i64 = 7;

/// The state after a completed scan in the ISO week starting `week_start` (a Monday, see
/// `Day::week_start`). `streak_weeks` counts completed clean weeks in a row:
///
/// - first scan ever: the week becomes the current one; the count stays 0.
/// - same week as `streak_week_start`: a critical finding resets the count to 0 and marks the
///   week as not clean; otherwise nothing changes.
/// - a later week: the previous week is closed. If it was clean the count grows by one when it
///   directly precedes this week, and restarts at 1 when weeks went unscanned in between; if it
///   had a critical the count stays 0. Then this week opens, and a critical in it resets to 0.
/// - an earlier week (the clock went backwards): nothing changes.
pub fn advance_streak(state: &AppState, week_start: Day, had_critical: bool) -> AppState {
    let mut next = state.clone();
    match state.streak_week_start {
        None => {
            next.streak_week_start = Some(week_start);
            next.streak_week_critical = had_critical;
            next.streak_weeks = 0;
        }
        Some(current) if week_start == current => {
            if had_critical {
                next.streak_weeks = 0;
                next.streak_week_critical = true;
            }
        }
        Some(current) if week_start > current => {
            next.streak_weeks = if state.streak_week_critical {
                0
            } else if current.plus_days(WEEK_DAYS) == week_start {
                state.streak_weeks.saturating_add(1)
            } else {
                1
            };
            next.streak_week_start = Some(week_start);
            next.streak_week_critical = had_critical;
            if had_critical {
                next.streak_weeks = 0;
            }
        }
        Some(_) => {}
    }
    next
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
    use time::macros::date;

    fn monday(n: i64) -> Day {
        Day::new(date!(2026 - 10 - 05)).plus_days(7 * n)
    }

    fn state(weeks: u32, at: i64, critical: bool) -> AppState {
        AppState {
            streak_weeks: weeks,
            streak_week_start: Some(monday(at)),
            streak_week_critical: critical,
            ..AppState::default()
        }
    }

    #[test]
    fn first_scan_opens_the_week_without_counting_it() {
        let next = advance_streak(&AppState::default(), monday(0), false);
        assert_eq!(next, state(0, 0, false));
        let next = advance_streak(&AppState::default(), monday(0), true);
        assert_eq!(next, state(0, 0, true));
    }

    #[test]
    fn same_week_clean_changes_nothing() {
        let before = state(4, 3, false);
        assert_eq!(advance_streak(&before, monday(3), false), before);
    }

    #[test]
    fn same_week_critical_resets_and_marks_the_week() {
        let next = advance_streak(&state(4, 3, false), monday(3), true);
        assert_eq!(next, state(0, 3, true));
        // A later clean scan in that week does not undo it.
        assert_eq!(advance_streak(&next, monday(3), false), next);
    }

    #[test]
    fn next_week_closes_a_clean_week() {
        assert_eq!(
            advance_streak(&state(4, 3, false), monday(4), false),
            state(5, 4, false)
        );
    }

    #[test]
    fn next_week_after_a_critical_week_stays_at_zero() {
        assert_eq!(
            advance_streak(&state(0, 3, true), monday(4), false),
            state(0, 4, false)
        );
        assert_eq!(
            advance_streak(&state(0, 3, true), monday(4), true),
            state(0, 4, true)
        );
    }

    #[test]
    fn next_week_with_a_critical_closes_the_old_one_then_resets() {
        assert_eq!(
            advance_streak(&state(4, 3, false), monday(4), true),
            state(0, 4, true)
        );
    }

    #[test]
    fn a_gap_restarts_at_one() {
        assert_eq!(
            advance_streak(&state(9, 3, false), monday(6), false),
            state(1, 6, false)
        );
    }

    #[test]
    fn an_earlier_week_changes_nothing() {
        let before = state(4, 3, false);
        assert_eq!(advance_streak(&before, monday(2), true), before);
    }

    #[test]
    fn the_input_is_left_alone() {
        let before = state(4, 3, false);
        let _ = advance_streak(&before, monday(4), true);
        assert_eq!(before, state(4, 3, false));
    }

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
