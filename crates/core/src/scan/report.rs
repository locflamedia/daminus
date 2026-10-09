//! The report every caller reads after a scan: `evaluate` over the retained
//! snapshots with the current projects and settings.

use crate::checks::manifest;
use crate::domain::app_state::advance_streak;
use crate::domain::datetime::Timestamp;
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::evaluate::{Config, Report, evaluate};
use crate::store::FsStore;

/// Loads projects, settings and the retained history from `store` and
/// evaluates them at `now`. Before the first scan the report is empty.
pub fn latest_report(store: &FsStore, now: Timestamp) -> Result<Report, AppError> {
    let projects = store.load_projects()?.value;
    let settings = store.load_settings()?.value;
    let m = manifest().map_err(|e| {
        AppError::from(ErrorCode::SchemaInvalid).with_param("detail", format!("manifest: {e}"))
    })?;
    let keep = settings
        .data
        .keep_scans
        .map(|k| usize::try_from(k).unwrap_or(usize::MAX));
    let history = store.load_history(keep)?;
    Ok(evaluate(
        &history,
        Config {
            projects: &projects,
            settings: &settings,
        },
        &m,
        now,
    ))
}

/// Whether any project or host carries a critical finding in `report`.
pub fn has_critical(report: &Report) -> bool {
    report.counts.crit > 0
}

/// Moves the clear-week streak in `state.json` forward for a scan that just finished at
/// `now`, judged by the latest report. The week is the UTC ISO week of `now`.
pub fn record_scan_streak(store: &FsStore, now: Timestamp) -> Result<(), AppError> {
    let had_critical = has_critical(&latest_report(store, now)?);
    let week = now.date().week_start();
    store.update_state(|state| *state = advance_streak(state, week, had_critical))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::evaluate::Counts;

    fn store() -> (tempfile::TempDir, FsStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = FsStore::new(dir.path());
        (dir, store)
    }

    #[test]
    fn critical_is_read_from_the_counts() {
        let (_dir, store) = store();
        let mut report = latest_report(&store, Timestamp::from_unix(1_800_000_000)).unwrap();
        assert!(!has_critical(&report));
        report.counts = Counts {
            crit: 1,
            ..Counts::default()
        };
        assert!(has_critical(&report));
    }

    #[test]
    fn a_clean_scan_opens_the_week_and_the_next_week_counts_it() {
        let (_dir, store) = store();
        let week_one = Timestamp::from_unix(1_790_000_000);
        let week_two = Timestamp::from_unix(1_790_000_000 + 7 * 86_400);
        record_scan_streak(&store, week_one).unwrap();
        let state = store.load_state().unwrap();
        assert_eq!(state.streak_weeks, 0);
        assert_eq!(state.streak_week_start, Some(week_one.date().week_start()));
        record_scan_streak(&store, week_two).unwrap();
        assert_eq!(store.load_state().unwrap().streak_weeks, 1);
    }
}
