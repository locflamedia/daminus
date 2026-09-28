//! The report every caller reads after a scan: `evaluate` over the retained
//! snapshots with the current projects and settings.

use crate::checks::manifest;
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
