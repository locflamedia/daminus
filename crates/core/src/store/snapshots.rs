//! Snapshot files: `snapshots/000123.json`, named by scan number. Read
//! leniently: a damaged or unreadable snapshot is skipped and logged, never
//! migrated and never fatal.

use std::fs;
use std::path::{Path, PathBuf};

use super::files::{io_error, read_opt, to_pretty, write_atomic};
use crate::domain::error::AppError;
use crate::domain::snapshot::Snapshot;

pub(super) fn file_name(seq: u32) -> String {
    format!("{seq:06}.json")
}

fn seq_of(path: &Path) -> Option<u32> {
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_suffix(".json")?;
    if stem.len() < 6 || !stem.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    stem.parse().ok()
}

/// Scan numbers present on disk, ascending.
pub(super) fn list(dir: &Path) -> Result<Vec<u32>, AppError> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(io_error(dir, &e)),
    };
    let mut seqs: Vec<u32> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| seq_of(&e.path()))
        .collect();
    seqs.sort_unstable();
    Ok(seqs)
}

pub(super) fn read(dir: &Path, seq: u32) -> Option<Snapshot> {
    let path = dir.join(file_name(seq));
    let bytes = match read_opt(&path) {
        Ok(Some(b)) => b,
        Ok(None) => return None,
        Err(_) => return None,
    };
    match serde_json::from_slice::<Snapshot>(&bytes) {
        Ok(mut snap) => {
            // The file name is the source of truth for the number.
            snap.seq = seq;
            Some(snap)
        }
        Err(e) => {
            tracing::warn!(path = %path.display(), line = e.line(), error = %e, "skipping unreadable snapshot");
            None
        }
    }
}

/// Writes `snap` as the next scan number. The caller holds the store lock.
pub(super) fn append(dir: &Path, mut snap: Snapshot) -> Result<u32, AppError> {
    let seq = list(dir)?.last().copied().unwrap_or(0).saturating_add(1);
    snap.seq = seq;
    write_atomic(&dir.join(file_name(seq)), &to_pretty(&snap)?)?;
    Ok(seq)
}

/// Deletes the oldest snapshots so at most `keep` remain.
pub(super) fn prune(dir: &Path, keep: usize) -> Result<Vec<u32>, AppError> {
    let seqs = list(dir)?;
    let excess = seqs.len().saturating_sub(keep);
    let mut removed = Vec::new();
    for seq in seqs.into_iter().take(excess) {
        let path: PathBuf = dir.join(file_name(seq));
        fs::remove_file(&path).map_err(|e| io_error(&path, &e))?;
        removed.push(seq);
    }
    Ok(removed)
}

/// Bytes the snapshot files take on disk; a file that vanished meanwhile counts as zero.
pub(super) fn total_bytes(dir: &Path) -> Result<u64, AppError> {
    Ok(list(dir)?
        .into_iter()
        .filter_map(|seq| fs::metadata(dir.join(file_name(seq))).ok())
        .map(|m| m.len())
        .sum())
}
