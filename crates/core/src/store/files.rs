//! Low-level file helpers: atomic writes, the advisory lock, content stamps.

use std::fs::{self, File, OpenOptions, TryLockError};
use std::hash::{Hash, Hasher};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::domain::error::{AppError, ErrorCode};

/// How long a writer waits for another process to release the lock.
const LOCK_WAIT: Duration = Duration::from_secs(2);
const LOCK_POLL: Duration = Duration::from_millis(50);

pub(super) fn io_error(path: &Path, err: &std::io::Error) -> AppError {
    tracing::warn!(path = %path.display(), error = %err, "store io error");
    AppError::from(ErrorCode::Io {
        path: path.display().to_string(),
    })
    .with_param("kind", format!("{:?}", err.kind()))
}

/// Reads a file; `None` when it does not exist.
pub(super) fn read_opt(path: &Path) -> Result<Option<Vec<u8>>, AppError> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(io_error(path, &e)),
    }
}

/// Writes `bytes` to `path` so readers see the old or the new file, never a
/// torn one: temp file in the same folder → fsync → rename → fsync folder.
pub(super) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let dir = path.parent().unwrap_or(Path::new("."));
    fs::create_dir_all(dir).map_err(|e| io_error(dir, &e))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let tmp = dir.join(format!(".{name}.tmp-{}", std::process::id()));
    let result = (|| {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        fs::rename(&tmp, path)?;
        File::open(dir)?.sync_all()
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(io_error(path, &e));
    }
    Ok(())
}

/// Serializes as pretty JSON with a trailing newline. Struct fields keep
/// their declared order and maps are sorted, so output is stable.
pub(super) fn to_pretty<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, AppError> {
    let mut bytes =
        serde_json::to_vec_pretty(value).map_err(|_| AppError::from(ErrorCode::SchemaInvalid))?;
    bytes.push(b'\n');
    Ok(bytes)
}

/// Identity of a file's content, taken when it was read. A save compares it
/// with the file on disk to catch a hand edit made in between.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileStamp {
    len: u64,
    hash: u64,
}

impl FileStamp {
    pub(super) fn of(bytes: &[u8]) -> Self {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        bytes.hash(&mut h);
        Self {
            len: bytes.len() as u64,
            hash: h.finish(),
        }
    }
}

/// Moves a file that cannot be parsed out of the way (`<name>.corrupt-<unix>`)
/// so it is kept for the user and never overwritten.
pub(super) fn set_aside(path: &Path) -> Result<PathBuf, AppError> {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut target = path.with_file_name(format!("{name}.corrupt-{secs}"));
    let mut n = 1;
    while target.exists() {
        target = path.with_file_name(format!("{name}.corrupt-{secs}-{n}"));
        n += 1;
    }
    fs::rename(path, &target).map_err(|e| io_error(path, &e))?;
    tracing::warn!(from = %path.display(), to = %target.display(), "unreadable file set aside");
    Ok(target)
}

/// Exclusive advisory lock on `<root>/.lock`, held while writing so two
/// Daminus processes (app and dev CLI) never interleave writes.
pub(super) struct StoreLock {
    _file: File,
}

impl StoreLock {
    pub(super) fn acquire(root: &Path) -> Result<Self, AppError> {
        fs::create_dir_all(root).map_err(|e| io_error(root, &e))?;
        let path = root.join(".lock");
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&path)
            .map_err(|e| io_error(&path, &e))?;
        let deadline = std::time::Instant::now() + LOCK_WAIT;
        loop {
            match file.try_lock() {
                Ok(()) => return Ok(Self { _file: file }),
                Err(TryLockError::WouldBlock) if std::time::Instant::now() < deadline => {
                    thread::sleep(LOCK_POLL);
                }
                Err(TryLockError::WouldBlock) => return Err(ErrorCode::StoreBusy.into()),
                Err(TryLockError::Error(e)) => return Err(io_error(&path, &e)),
            }
        }
    }
}
