//! Loading and saving the versioned source-of-truth files (`projects.json`,
//! `settings.json`): migration chain, backups, newer-version read-only mode,
//! corrupt-file handling and the changed-on-disk check.

use std::path::Path;

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use super::files::{FileStamp, read_opt, set_aside, to_pretty, write_atomic};
use crate::domain::error::{AppError, ErrorCode};

/// One pure migration step: the JSON of version N in, version N+1 out.
pub type Migration = fn(Value) -> Result<Value, String>;

/// A loaded document and what is needed to save it back safely.
#[derive(Clone, Debug, PartialEq)]
pub struct Stamped<T> {
    pub value: T,
    /// Content stamp at load; `None` when the file did not exist.
    pub stamp: Option<FileStamp>,
    /// Written by a newer Daminus: shown, never saved over.
    pub read_only: bool,
}

pub(super) struct Doc<'a> {
    pub path: &'a Path,
    pub current: u32,
    /// `migrations[i]` turns version `i + 1` into version `i + 2`.
    pub migrations: &'a [Migration],
}

fn path_str(path: &Path) -> String {
    path.display().to_string()
}

fn invalid(path: &Path, line: Option<usize>, moved_to: &Path) -> AppError {
    AppError::from(ErrorCode::ConfigInvalid {
        path: path_str(path),
        line: line.and_then(|l| u32::try_from(l).ok()),
    })
    .with_param("moved_to", path_str(moved_to))
}

fn version_of(v: &Value) -> u32 {
    v.get("version")
        .and_then(Value::as_u64)
        .and_then(|n| u32::try_from(n).ok())
        .unwrap_or(1)
}

impl Doc<'_> {
    pub fn load<T: DeserializeOwned + Default>(&self) -> Result<Stamped<T>, AppError> {
        let Some(bytes) = read_opt(self.path)? else {
            return Ok(Stamped {
                value: T::default(),
                stamp: None,
                read_only: false,
            });
        };
        let raw: Value = match serde_json::from_slice(&bytes) {
            Ok(v) => v,
            Err(e) => return Err(self.corrupt(Some(e.line()))),
        };
        let version = version_of(&raw);
        if version == 0 {
            // Versions start at 1; a hand-edited 0 has no migration path.
            return Err(self.corrupt(None));
        }

        if version > self.current {
            return match serde_json::from_value::<T>(raw) {
                Ok(value) => Ok(Stamped {
                    value,
                    stamp: Some(FileStamp::of(&bytes)),
                    read_only: true,
                }),
                Err(_) => Err(ErrorCode::ConfigFromNewerVersion {
                    path: path_str(self.path),
                    version,
                }
                .into()),
            };
        }
        if version == self.current {
            // Parse the text itself so errors carry a line number.
            return match serde_json::from_slice::<T>(&bytes) {
                Ok(value) => Ok(Stamped {
                    value,
                    stamp: Some(FileStamp::of(&bytes)),
                    read_only: false,
                }),
                Err(e) => Err(self.corrupt(Some(e.line()))),
            };
        }
        self.migrate(raw, version, &bytes)
    }

    fn corrupt(&self, line: Option<usize>) -> AppError {
        match set_aside(self.path) {
            Ok(moved) => invalid(self.path, line, &moved),
            Err(e) => e,
        }
    }

    /// Backs the file up as `<name>.bak-v<N>`, runs every step up to the
    /// current version and writes the result.
    fn migrate<T: DeserializeOwned>(
        &self,
        raw: Value,
        from: u32,
        bytes: &[u8],
    ) -> Result<Stamped<T>, AppError> {
        let name = self
            .path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let backup = self.path.with_file_name(format!("{name}.bak-v{from}"));
        if read_opt(&backup)?.is_none() {
            write_atomic(&backup, bytes)?;
        }
        let mut doc = raw;
        for v in from..self.current {
            let step = v
                .checked_sub(1)
                .and_then(|i| usize::try_from(i).ok())
                .and_then(|i| self.migrations.get(i));
            let Some(step) = step else {
                return Err(self.corrupt(None));
            };
            doc = match step(doc) {
                Ok(next) => next,
                Err(reason) => {
                    tracing::warn!(path = %self.path.display(), from = v, %reason, "migration failed");
                    return Err(self.corrupt(None));
                }
            };
            if let Some(obj) = doc.as_object_mut() {
                obj.insert("version".into(), Value::from(v + 1));
            }
        }
        let value: T = match serde_json::from_value(doc.clone()) {
            Ok(v) => v,
            Err(_) => return Err(self.corrupt(None)),
        };
        let out = to_pretty(&doc)?;
        write_atomic(self.path, &out)?;
        tracing::info!(path = %self.path.display(), from, to = self.current, "migrated");
        Ok(Stamped {
            value,
            stamp: Some(FileStamp::of(&out)),
            read_only: false,
        })
    }

    /// Saves `value` if the file on disk is still the one loaded as `base`.
    /// The caller holds the store lock.
    pub fn save<T: Serialize>(
        &self,
        value: &T,
        base: Option<FileStamp>,
    ) -> Result<FileStamp, AppError> {
        let on_disk = read_opt(self.path)?;
        if let Some(bytes) = &on_disk
            && let Ok(raw) = serde_json::from_slice::<Value>(bytes)
            && version_of(&raw) > self.current
        {
            let version = version_of(&raw);
            return Err(ErrorCode::ConfigFromNewerVersion {
                path: path_str(self.path),
                version,
            }
            .into());
        }
        if on_disk.as_deref().map(FileStamp::of) != base {
            return Err(ErrorCode::ConfigChangedOnDisk {
                path: path_str(self.path),
            }
            .into());
        }
        let out = to_pretty(value)?;
        write_atomic(self.path, &out)?;
        Ok(FileStamp::of(&out))
    }
}
