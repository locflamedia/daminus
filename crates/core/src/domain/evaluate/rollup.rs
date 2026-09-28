//! Project and server rollups: counts, card level and the main issue.

use std::collections::BTreeMap;

use serde_json::Value;

use super::report::{
    Counts, Delta, Disposition, Item, MainIssue, Owner, ProjectRollup, ServerRollup,
};
use crate::domain::host::{HostAlias, HostRef};
use crate::domain::project::ProjectsFile;
use crate::domain::severity::{Level, Severity, UnknownReason};
use crate::domain::snapshot::Snapshot;

pub(super) fn count<'a>(items: impl Iterator<Item = &'a Item>) -> Counts {
    let mut c = Counts::default();
    for item in items {
        if matches!(item.disposition, Disposition::Expected { .. }) {
            c.expected += 1;
        } else {
            match item.severity {
                Severity::Crit => c.crit += 1,
                Severity::Warn => c.warn += 1,
                Severity::Unknown(UnknownReason::NeedsPerm) => c.needs_perm += 1,
                Severity::Unknown(_) => c.unknown += 1,
                Severity::Ok | Severity::Info => {}
            }
        }
        if item.disposition.stale_since().is_some() {
            c.stale += 1;
        }
    }
    c
}

/// Only open issues colour a card: expected, unknown and needs-permission never do.
fn level<'a>(items: impl Iterator<Item = &'a Item>) -> Level {
    items
        .filter(|i| i.is_open_issue())
        .filter_map(|i| i.severity.level())
        .max()
        .unwrap_or(Level::Ok)
}

/// The worst open issue; on a tie, the one open longest, then key order.
fn main_issue<'a>(items: impl Iterator<Item = &'a Item>) -> Option<MainIssue> {
    let best = items.filter(|i| i.is_open_issue()).max_by(|a, b| {
        let rank = |i: &Item| (i.severity.level(), scans_open(i));
        rank(a).cmp(&rank(b)).then_with(|| b.key.cmp(&a.key))
    })?;
    let mut params = BTreeMap::new();
    params.insert("target".into(), Value::from(best.key.target.clone()));
    if let Some(f) = &best.fact {
        if let Some(v) = f.value {
            params.insert("value".into(), Value::from(v));
        }
        if let Some(u) = &f.unit {
            params.insert("unit".into(), Value::from(u.clone()));
        }
    }
    if let Disposition::Stale { since_seq } = best.disposition {
        params.insert("stale_since".into(), Value::from(since_seq));
    }
    if let Some(Delta::Still { scans_open }) = best.delta {
        params.insert("scans_open".into(), Value::from(scans_open));
    }
    Some(MainIssue {
        key: best.key.clone(),
        params,
        severity: best.severity,
    })
}

/// Scans in a row an issue has been open (1 when new or changed).
fn scans_open(item: &Item) -> u32 {
    match item.delta {
        Some(Delta::Still { scans_open }) => scans_open,
        _ => 1,
    }
}

pub(super) fn projects(
    items: &[Item],
    projects: &ProjectsFile,
    latest: Option<&Snapshot>,
) -> Vec<ProjectRollup> {
    projects
        .projects
        .iter()
        .map(|p| {
            let owned = || {
                items
                    .iter()
                    .filter(move |i| matches!(&i.owner, Owner::Project { id } if id == &p.id))
            };
            let mut unreachable_hosts = Vec::new();
            let mut not_scanned_hosts = Vec::new();
            for host in p.hosts() {
                match latest.and_then(|s| s.outcome(&HostRef::Alias(host.clone()))) {
                    Some(o) if o.answered() => {}
                    Some(_) => unreachable_hosts.push(host.clone()),
                    None => not_scanned_hosts.push(host.clone()),
                }
            }
            if latest.is_none() {
                not_scanned_hosts.clear();
            }
            ProjectRollup {
                id: p.id.clone(),
                level: level(owned()),
                counts: count(owned()),
                main_issue: main_issue(owned()),
                unreachable_hosts,
                not_scanned_hosts,
            }
        })
        .collect()
}

/// Every host named by a project, by host settings or by the latest scan.
pub(super) fn servers(
    items: &[Item],
    projects: &ProjectsFile,
    history: &[Snapshot],
) -> Vec<ServerRollup> {
    let mut hosts: Vec<HostAlias> = projects
        .projects
        .iter()
        .flat_map(|p| p.components.iter().map(|c| c.host.clone()))
        .chain(projects.hosts.keys().cloned())
        .chain(
            history
                .first()
                .into_iter()
                .flat_map(|s| s.hosts.keys().filter_map(HostRef::alias).cloned()),
        )
        .collect();
    hosts.sort();
    hosts.dedup();

    hosts
        .into_iter()
        .map(|host| {
            let r = HostRef::Alias(host.clone());
            let on_host = || items.iter().filter(|i| i.key.host == r);
            let last_reached = history
                .iter()
                .find(|s| s.outcome(&r).is_some_and(|o| o.is_reached()));
            ServerRollup {
                outcome: history.first().and_then(|s| s.outcome(&r)).cloned(),
                included: projects.host_included(&host),
                last_reached_seq: last_reached.map(|s| s.seq),
                last_reached_at: last_reached.map(|s| s.finished_at),
                level: level(on_host()),
                counts: count(on_host()),
                main_issue: main_issue(on_host()),
                used_by: projects
                    .projects
                    .iter()
                    .filter(|p| p.hosts().contains(&&host))
                    .map(|p| p.id.clone())
                    .collect(),
                host,
            }
        })
        .collect()
}
