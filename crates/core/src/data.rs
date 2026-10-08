//! What Settings › Data shows and does: how much the app's folder holds and of what kind, a
//! copy of the kept scans for the user to keep, and the two ways out (delete the history, reset
//! the settings). Nothing here reads a server or a key; the folder is the store's own.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::domain::error::AppError;
use crate::domain::redact::redact_secrets;
use crate::domain::settings::Settings;
use crate::domain::snapshot::Snapshot;
use crate::store::{FsStore, PROJECTS_FILE, SETTINGS_FILE, STATE_FILE};

/// The app's folder in numbers.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct DataUsage {
    /// The folder as shown to the user, with `~` for the home folder.
    pub path: String,
    /// JSON files in the folder: projects, settings, state and one per kept scan.
    pub files: u32,
    /// Kept scans.
    pub scans: u32,
    /// Bytes of the scan files.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub scans_bytes: u64,
    /// Bytes of projects, settings and state.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub config_bytes: u64,
    /// Bytes of the local log files.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub logs_bytes: u64,
    /// Bytes of each scan file, oldest first.
    #[cfg_attr(feature = "ts", ts(type = "Array<number>"))]
    pub scan_sizes: Vec<u64>,
}

/// Counts what the folder holds. `log_file` is the active log; its rotated files count too.
pub fn usage(store: &FsStore, log_file: Option<&Path>, home: Option<&Path>) -> DataUsage {
    let scan_sizes = store.snapshot_sizes().unwrap_or_default();
    let config: Vec<u64> = [PROJECTS_FILE, SETTINGS_FILE, STATE_FILE]
        .iter()
        .filter_map(|name| fs::metadata(store.root().join(name)).ok())
        .map(|m| m.len())
        .collect();
    DataUsage {
        path: shown_path(store.root(), home),
        files: u32::try_from(config.len() + scan_sizes.len()).unwrap_or(u32::MAX),
        scans: u32::try_from(scan_sizes.len()).unwrap_or(u32::MAX),
        scans_bytes: scan_sizes.iter().sum(),
        config_bytes: config.iter().sum(),
        logs_bytes: log_file.map_or(0, log_bytes),
        scan_sizes,
    }
}

/// `path` with the home folder written as `~`.
fn shown_path(path: &Path, home: Option<&Path>) -> String {
    match home.and_then(|h| path.strip_prefix(h).ok()) {
        Some(rest) if rest.as_os_str().is_empty() => "~".to_owned(),
        Some(rest) => format!("~/{}", rest.display()),
        None => path.display().to_string(),
    }
}

/// Size of the log file and its rotated copies (`daminus.log`, `daminus_2026-….log`).
fn log_bytes(file: &Path) -> u64 {
    let (Some(dir), Some(stem)) = (file.parent(), file.file_stem().and_then(|s| s.to_str())) else {
        return 0;
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .filter(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy();
            name.starts_with(stem) && name.ends_with(".log")
        })
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

/// The file an export wrote, by name; the folder is always Downloads.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ExportedFile {
    pub name: String,
}

/// What an export file starts with, so a later import can tell it apart.
pub const EXPORT_FORMAT: &str = "daminus-scans";

#[derive(Serialize)]
struct Export<'a> {
    format: &'static str,
    version: u32,
    scans: &'a [Snapshot],
}

/// Every kept scan as one JSON document, the whole text through `redact_secrets`.
pub fn export_scans(store: &FsStore) -> Result<String, AppError> {
    let mut scans = store.load_history(None)?;
    scans.reverse();
    let text = serde_json::to_string_pretty(&Export {
        format: EXPORT_FORMAT,
        version: 1,
        scans: &scans,
    })
    .map_err(|_| AppError::from(crate::domain::error::ErrorCode::Internal))?;
    Ok(redact_secrets(&text))
}

/// Deletes the scans and the "mark as expected" notes. Projects, host settings, ssh config and
/// keys stay. Answers how many scans went.
pub fn clear_history(store: &FsStore) -> Result<usize, AppError> {
    let loaded = store.load_projects()?;
    let mut projects = loaded.value;
    if !projects.rules.is_empty() {
        projects.rules.clear();
        store.save_projects(&projects, loaded.stamp)?;
    }
    store.clear_snapshots()
}

/// Puts every setting back to its default, and checks the whole file again.
pub fn reset_settings(store: &FsStore) -> Result<Settings, AppError> {
    store.update_settings(|s| *s = Settings::default())
}

/// The user's home folder, for `usage`.
pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::expected::ExpectedRule;

    fn store() -> (tempfile::TempDir, FsStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = FsStore::new(dir.path());
        (dir, store)
    }

    fn snapshot() -> Snapshot {
        serde_json::from_value(serde_json::json!({
            "started_at": "2026-09-26T06:41:00Z",
            "finished_at": "2026-09-26T06:42:00Z",
        }))
        .unwrap()
    }

    #[test]
    fn usage_counts_files_and_bytes_by_kind() {
        let (dir, store) = store();
        store.update_settings(|_| {}).unwrap();
        store.save_snapshot(snapshot(), None).unwrap();
        store.save_snapshot(snapshot(), None).unwrap();
        let logs = tempfile::tempdir().unwrap();
        fs::write(logs.path().join("daminus.log"), "12345").unwrap();
        fs::write(logs.path().join("daminus_2026.log"), "678").unwrap();
        fs::write(logs.path().join("other.txt"), "ignored").unwrap();

        let u = usage(&store, Some(&logs.path().join("daminus.log")), None);
        assert_eq!(u.scans, 2);
        assert_eq!(u.files, 3);
        assert_eq!(u.scan_sizes.len(), 2);
        assert_eq!(u.scans_bytes, u.scan_sizes.iter().sum::<u64>());
        assert!(u.config_bytes > 0);
        assert_eq!(u.logs_bytes, 8);
        assert_eq!(u.path, dir.path().display().to_string());
    }

    #[test]
    fn the_home_folder_is_written_as_a_tilde() {
        let home = Path::new("/Users/me");
        let inside = home.join("Library/Application Support/dev.daminus.app");
        assert_eq!(
            shown_path(&inside, Some(home)),
            "~/Library/Application Support/dev.daminus.app"
        );
        assert_eq!(shown_path(Path::new("/tmp/x"), Some(home)), "/tmp/x");
        assert_eq!(shown_path(home, Some(home)), "~");
    }

    #[test]
    fn an_export_holds_every_scan_oldest_first() {
        let (_dir, store) = store();
        store.save_snapshot(snapshot(), None).unwrap();
        store.save_snapshot(snapshot(), None).unwrap();
        let text = export_scans(&store).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(doc["format"], EXPORT_FORMAT);
        assert_eq!(doc["scans"][0]["seq"], 1);
        assert_eq!(doc["scans"][1]["seq"], 2);
    }

    #[test]
    fn clearing_the_history_keeps_the_projects_and_drops_scans_and_notes() {
        let (_dir, store) = store();
        store.save_snapshot(snapshot(), None).unwrap();
        let loaded = store.load_projects().unwrap();
        let mut file = loaded.value;
        file.rules.push(
            serde_json::from_value::<ExpectedRule>(serde_json::json!({
                "id": "r1",
                "host": "vps-a",
                "check": "disk.free",
                "target": "/var",
                "reason": "intended",
            }))
            .unwrap(),
        );
        store.save_projects(&file, loaded.stamp).unwrap();

        assert_eq!(clear_history(&store).unwrap(), 1);
        assert!(store.snapshot_seqs().unwrap().is_empty());
        assert!(store.load_projects().unwrap().value.rules.is_empty());
    }

    #[test]
    fn a_reset_writes_the_defaults_back() {
        let (_dir, store) = store();
        store
            .update_settings(|s| s.data.keep_scans = Some(50))
            .unwrap();
        let saved = reset_settings(&store).unwrap();
        assert_eq!(saved, Settings::default());
        assert_eq!(store.load_settings().unwrap().value, Settings::default());
    }

    #[test]
    fn data_limits_of_zero_or_absurd_size_are_refused() {
        let mut s = Settings::default();
        s.data.keep_scans = Some(0);
        assert!(s.validate().is_err());
        s.data.keep_scans = None;
        s.data.forget_ai_after_days = Some(99_999);
        assert!(s.validate().is_err());
        s.data.forget_ai_after_days = None;
        assert!(s.validate().is_ok());
    }
}
