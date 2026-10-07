//! `FsStore`: the app's files in one folder (Tauri passes `app_config_dir`;
//! the dev CLI passes `--config-dir`).
//!
//! ```text
//! projects.json   projects, hosts, expected rules   (versioned, migrated)
//! settings.json   preferences, never a key          (versioned, migrated)
//! state.json      small bookkeeping                 (lenient)
//! snapshots/000123.json  raw scan results           (lenient, retention N)
//! ```
//!
//! Writes are atomic and serialized by an advisory lock. Saving a versioned
//! file needs the stamp it was loaded with, so a hand edit made meanwhile is
//! never overwritten.

mod files;
mod snapshots;
#[cfg(test)]
mod tests;
mod versioned;

use std::path::{Path, PathBuf};

pub use files::FileStamp;
pub use versioned::{Migration, Stamped};

use crate::domain::app_state::AppState;
use crate::domain::error::AppError;
use crate::domain::project::{PROJECTS_VERSION, ProjectsFile};
use crate::domain::settings::{SETTINGS_VERSION, Settings};
use crate::domain::snapshot::Snapshot;
use files::{StoreLock, read_opt, set_aside, to_pretty, write_atomic};
use versioned::Doc;

/// `projects.json` migration steps; `[i]` turns v`i+1` into v`i+2`. Empty while v1 is current.
pub const PROJECTS_MIGRATIONS: &[Migration] = &[];
/// `settings.json` migration steps; same indexing.
pub const SETTINGS_MIGRATIONS: &[Migration] = &[];

pub const PROJECTS_FILE: &str = "projects.json";
pub const SETTINGS_FILE: &str = "settings.json";
pub const STATE_FILE: &str = "state.json";
pub const SNAPSHOTS_DIR: &str = "snapshots";

#[derive(Clone, Debug)]
pub struct FsStore {
    root: PathBuf,
}

impl FsStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn projects_doc(&self) -> (PathBuf, u32, &'static [Migration]) {
        (
            self.root.join(PROJECTS_FILE),
            PROJECTS_VERSION,
            PROJECTS_MIGRATIONS,
        )
    }

    fn settings_doc(&self) -> (PathBuf, u32, &'static [Migration]) {
        (
            self.root.join(SETTINGS_FILE),
            SETTINGS_VERSION,
            SETTINGS_MIGRATIONS,
        )
    }

    fn snapshots_dir(&self) -> PathBuf {
        self.root.join(SNAPSHOTS_DIR)
    }

    /// Loads `projects.json`; a missing file gives an empty v1 document.
    pub fn load_projects(&self) -> Result<Stamped<ProjectsFile>, AppError> {
        let (path, current, migrations) = self.projects_doc();
        let _lock = StoreLock::acquire(&self.root)?;
        Doc {
            path: &path,
            current,
            migrations,
        }
        .load()
    }

    /// Saves `projects.json` if it is unchanged since the load that gave `base`.
    pub fn save_projects(
        &self,
        value: &ProjectsFile,
        base: Option<FileStamp>,
    ) -> Result<FileStamp, AppError> {
        let (path, current, migrations) = self.projects_doc();
        let _lock = StoreLock::acquire(&self.root)?;
        Doc {
            path: &path,
            current,
            migrations,
        }
        .save(value, base)
    }

    pub fn load_settings(&self) -> Result<Stamped<Settings>, AppError> {
        let (path, current, migrations) = self.settings_doc();
        let _lock = StoreLock::acquire(&self.root)?;
        Doc {
            path: &path,
            current,
            migrations,
        }
        .load()
    }

    pub fn save_settings(
        &self,
        value: &Settings,
        base: Option<FileStamp>,
    ) -> Result<FileStamp, AppError> {
        let (path, current, migrations) = self.settings_doc();
        let _lock = StoreLock::acquire(&self.root)?;
        Doc {
            path: &path,
            current,
            migrations,
        }
        .save(value, base)
    }

    /// Loads `state.json`. A damaged file is set aside and defaults are used.
    pub fn load_state(&self) -> Result<AppState, AppError> {
        let path = self.root.join(STATE_FILE);
        let _lock = StoreLock::acquire(&self.root)?;
        let Some(bytes) = read_opt(&path)? else {
            return Ok(AppState::default());
        };
        match serde_json::from_slice(&bytes) {
            Ok(state) => Ok(state),
            Err(_) => {
                set_aside(&path)?;
                Ok(AppState::default())
            }
        }
    }

    pub fn save_state(&self, state: &AppState) -> Result<(), AppError> {
        let _lock = StoreLock::acquire(&self.root)?;
        write_atomic(&self.root.join(STATE_FILE), &to_pretty(state)?)
    }

    /// Saves a finished scan as the next number, then keeps only the newest
    /// `keep` snapshots (`None` keeps all). Returns the new scan number.
    pub fn save_snapshot(&self, snapshot: Snapshot, keep: Option<u32>) -> Result<u32, AppError> {
        let dir = self.snapshots_dir();
        let _lock = StoreLock::acquire(&self.root)?;
        let seq = snapshots::append(&dir, snapshot)?;
        if let Some(keep) = keep {
            let keep = usize::try_from(keep.max(1)).unwrap_or(usize::MAX);
            let removed = snapshots::prune(&dir, keep)?;
            if !removed.is_empty() {
                tracing::debug!(?removed, "pruned old snapshots");
            }
        }
        Ok(seq)
    }

    /// Scan numbers on disk, ascending.
    pub fn snapshot_seqs(&self) -> Result<Vec<u32>, AppError> {
        snapshots::list(&self.snapshots_dir())
    }

    /// Total size of the snapshot files, in bytes.
    pub fn snapshot_bytes(&self) -> Result<u64, AppError> {
        snapshots::total_bytes(&self.snapshots_dir())
    }

    /// Reads one snapshot; `None` when missing or unreadable.
    pub fn load_snapshot(&self, seq: u32) -> Option<Snapshot> {
        snapshots::read(&self.snapshots_dir(), seq)
    }

    /// The retained history, newest first, as `evaluate` expects. Unreadable
    /// snapshots are skipped. `limit` caps how many are read.
    pub fn load_history(&self, limit: Option<usize>) -> Result<Vec<Snapshot>, AppError> {
        let dir = self.snapshots_dir();
        let seqs = snapshots::list(&dir)?;
        Ok(seqs
            .into_iter()
            .rev()
            .filter_map(|seq| snapshots::read(&dir, seq))
            .take(limit.unwrap_or(usize::MAX))
            .collect())
    }
}
