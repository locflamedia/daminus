//! What the history screens read: one summary per kept scan, any past scan
//! as a report, and the raw facts of chosen checks across scans. Everything is
//! computed from the saved snapshots at read time, like `latest_report`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::checks::manifest;
use crate::domain::datetime::Timestamp;
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::evaluate::{Config, Counts, Item, Owner, Report, evaluate};
use crate::domain::fact::CheckFact;
use crate::domain::host::HostRef;
use crate::domain::manifest::Manifest;
use crate::domain::project::ProjectsFile;
use crate::domain::settings::Settings;
use crate::domain::severity::Level;
use crate::domain::snapshot::{HostOutcome, Snapshot};
use crate::store::FsStore;

/// The most scans one `history_facts` call returns facts for.
pub const MAX_FACT_SCANS: usize = 100;

/// How one host fared in one scan.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostSummary {
    pub outcome: HostOutcome,
    /// Wall time on this Mac, when the scan recorded it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ms: Option<u32>,
}

/// One project as one scan saw it: open issues by level, and the worst level
/// of each check that produced a result (a check that did not run is absent).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ProjectSummary {
    pub id: String,
    pub crit: u32,
    pub warn: u32,
    pub info: u32,
    pub checks: BTreeMap<String, Level>,
}

/// One kept scan.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ScanSummary {
    pub seq: u32,
    pub started_at: Timestamp,
    pub finished_at: Timestamp,
    pub hosts: BTreeMap<HostRef, HostSummary>,
    /// Open issues across everything, expected ones apart.
    pub counts: Counts,
    pub info: u32,
    pub projects: Vec<ProjectSummary>,
}

/// The kept scans, oldest first, and what the store holds.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HistoryView {
    pub scans: Vec<ScanSummary>,
    /// The retention limit from Settings; `None` keeps every scan.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keep: Option<u32>,
    /// Size of the snapshot files on disk, in bytes.
    pub bytes: u64,
}

/// A raw fact with the scan it came from.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ScanFact {
    pub seq: u32,
    pub at: Timestamp,
    pub host: HostRef,
    pub fact: CheckFact,
}

struct Loaded {
    projects: ProjectsFile,
    settings: Settings,
    manifest: Manifest,
    /// Newest first.
    history: Vec<Snapshot>,
}

fn load(store: &FsStore) -> Result<Loaded, AppError> {
    let projects = store.load_projects()?.value;
    let settings = store.load_settings()?.value;
    let manifest = manifest().map_err(|e| {
        AppError::from(ErrorCode::SchemaInvalid).with_param("detail", format!("manifest: {e}"))
    })?;
    let keep = settings
        .data
        .keep_scans
        .map(|k| usize::try_from(k).unwrap_or(usize::MAX));
    let history = store.load_history(keep)?;
    Ok(Loaded {
        projects,
        settings,
        manifest,
        history,
    })
}

impl Loaded {
    /// `evaluate` over the scans up to and including index `at` of `history`,
    /// read as of the moment that scan finished.
    fn report_from(&self, at: usize) -> Report {
        let slice = &self.history[at..];
        evaluate(
            slice,
            Config {
                projects: &self.projects,
                settings: &self.settings,
            },
            &self.manifest,
            slice[0].finished_at,
        )
    }
}

/// One summary per kept scan, oldest first.
pub fn history_view(store: &FsStore) -> Result<HistoryView, AppError> {
    let loaded = load(store)?;
    let mut scans: Vec<ScanSummary> = (0..loaded.history.len())
        .map(|i| summarize(&loaded.history[i], &loaded.report_from(i)))
        .collect();
    scans.reverse();
    Ok(HistoryView {
        scans,
        keep: loaded.settings.data.keep_scans,
        bytes: store.snapshot_bytes()?,
    })
}

fn summarize(snap: &Snapshot, report: &Report) -> ScanSummary {
    let hosts = snap
        .hosts
        .iter()
        .map(|(host, outcome)| {
            (
                host.clone(),
                HostSummary {
                    outcome: outcome.clone(),
                    ms: snap.timing.get(host).map(|t| t.ms),
                },
            )
        })
        .collect();
    let mut projects: BTreeMap<&str, ProjectSummary> = report
        .projects
        .iter()
        .map(|p| {
            (
                p.id.as_str(),
                ProjectSummary {
                    id: p.id.clone(),
                    ..ProjectSummary::default()
                },
            )
        })
        .collect();
    let mut info = 0;
    for item in &report.items {
        let level = item.severity.level();
        let open = item.is_open_issue();
        if level == Some(Level::Info) {
            info += 1;
        }
        let Owner::Project { id } = &item.owner else {
            continue;
        };
        let Some(p) = projects.get_mut(id.as_str()) else {
            continue;
        };
        add_to_project(p, item, level, open);
    }
    let order: Vec<&str> = report.projects.iter().map(|p| p.id.as_str()).collect();
    ScanSummary {
        seq: snap.seq,
        started_at: snap.started_at,
        finished_at: snap.finished_at,
        hosts,
        counts: report.counts.clone(),
        info,
        projects: order
            .into_iter()
            .filter_map(|id| projects.remove(id))
            .collect(),
    }
}

fn add_to_project(p: &mut ProjectSummary, item: &Item, level: Option<Level>, open: bool) {
    match level {
        Some(Level::Crit) if open => p.crit += 1,
        Some(Level::Warn) if open => p.warn += 1,
        Some(Level::Info) => p.info += 1,
        _ => {}
    }
    let shown = if open || matches!(level, Some(Level::Ok | Level::Info)) {
        level
    } else {
        Some(Level::Ok)
    };
    if let Some(level) = shown {
        let entry = p.checks.entry(item.key.check.clone()).or_insert(level);
        *entry = (*entry).max(level);
    }
}

/// The report as scan `seq` saw it: `evaluate` over the scans up to it.
pub fn report_at(store: &FsStore, seq: u32) -> Result<Report, AppError> {
    let loaded = load(store)?;
    let at = loaded
        .history
        .iter()
        .position(|s| s.seq == seq)
        .ok_or_else(|| {
            AppError::from(ErrorCode::Io {
                path: format!("snapshots/{seq:06}.json"),
            })
        })?;
    Ok(loaded.report_from(at))
}

/// The facts of `checks` in the newest `last` scans (at most [`MAX_FACT_SCANS`]), oldest scan first.
pub fn history_facts(
    store: &FsStore,
    checks: &[String],
    last: usize,
) -> Result<Vec<ScanFact>, AppError> {
    let last = last.clamp(1, MAX_FACT_SCANS);
    let history = store.load_history(Some(last))?;
    let mut out = Vec::new();
    for snap in history.iter().rev() {
        for (host, facts) in &snap.facts {
            for fact in facts.iter().filter(|f| checks.contains(&f.check)) {
                out.push(ScanFact {
                    seq: snap.seq,
                    at: snap.finished_at,
                    host: host.clone(),
                    fact: fact.clone(),
                });
            }
        }
    }
    Ok(out)
}
