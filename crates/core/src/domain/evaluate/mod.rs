//! `evaluate(history, config, manifest, now) -> Report`: the one pure function
//! that turns raw snapshots into what the user sees. Severity, stale results,
//! deltas, expected rules and rollups are all computed here, at read time, so a
//! threshold or rule change applies without a rescan.

mod report;
mod rollup;
#[cfg(test)]
mod tests;
mod timeline;

use std::collections::BTreeSet;

pub use report::{
    Counts, Delta, Disposition, Item, MainIssue, Owner, ProjectRollup, Report, ServerRollup,
};

use super::datetime::Timestamp;
use super::expected::RuleMatch;
use super::fact::CheckKey;
use super::host::HostRef;
use super::manifest::Manifest;
use super::project::ProjectsFile;
use super::settings::Settings;
use super::snapshot::Snapshot;

/// The user configuration `evaluate` reads.
#[derive(Clone, Copy, Debug)]
pub struct Config<'a> {
    pub projects: &'a ProjectsFile,
    pub settings: &'a Settings,
}

/// Evaluates the retained `history` (newest first, as the store returns it).
///
/// Keys are tracked across the whole history, so a result not re-checked for
/// several scans keeps its last severity as `Stale`. Results of checks missing
/// from the manifest, or in groups switched off in Settings, are not evaluated.
pub fn evaluate(
    history: &[Snapshot],
    config: Config<'_>,
    manifest: &Manifest,
    now: Timestamp,
) -> Report {
    let oldest_first: Vec<timeline::Indexed<'_>> =
        history.iter().rev().map(timeline::Indexed::new).collect();
    let latest = history.first();
    let scan = &config.settings.scan;

    let keys: BTreeSet<CheckKey> = history.iter().flat_map(Snapshot::keys).collect();
    let mut items = Vec::new();
    for key in keys {
        let Some(spec) = manifest.get(&key.check) else {
            continue;
        };
        if !scan.group_enabled(spec.group) {
            continue;
        }
        let owner = owner_of(&key, config.projects);
        let project_overrides = match &owner {
            Owner::Project { id } => config
                .projects
                .projects
                .iter()
                .find(|p| &p.id == id)
                .map(|p| p.overrides.as_slice())
                .unwrap_or_default(),
            Owner::Server { .. } => &[],
        };
        let rule = spec
            .rule
            .with_overrides(&key.check, &scan.thresholds)
            .with_overrides(&key.check, project_overrides);
        let Some(v) = timeline::walk(&oldest_first, &key, spec.group, &rule) else {
            continue;
        };

        let mut item = Item {
            key,
            group: spec.group,
            owner,
            severity: v.severity,
            disposition: v.disposition,
            delta: v.delta,
            fact: v.fact.cloned(),
            checked_seq: v.checked_seq,
            rule_broken: None,
        };
        apply_expected(&mut item, config.projects, now);
        items.push(item);
    }

    let rules_due = config
        .projects
        .rules
        .iter()
        .filter(|r| r.is_expired(now))
        .map(|r| r.id.clone())
        .collect();
    let disabled_groups = scan
        .disabled_groups
        .iter()
        .copied()
        .filter(|g| g.can_disable())
        .collect();

    Report {
        seq: latest.map(|s| s.seq),
        scanned_at: latest.map(|s| s.finished_at),
        evaluated_at: now,
        projects: rollup::projects(&items, config.projects, latest),
        servers: rollup::servers(&items, config.projects, history),
        counts: rollup::count(items.iter()),
        items,
        disabled_groups,
        rules_due,
    }
}

/// Each result has one owner so an issue is counted once: a URL belongs to
/// the project that lists it; a result under a component (path, compose
/// project, pm2 app, database) belongs to that project; a host-level result
/// belongs to the project when only one project uses the host, else to the server.
fn owner_of(key: &CheckKey, projects: &ProjectsFile) -> Owner {
    let server = Owner::Server {
        host: key.host.clone(),
    };
    match &key.host {
        HostRef::Local => projects
            .projects
            .iter()
            .find(|p| p.urls.iter().any(|u| url_owns(u, &key.target)))
            .map_or(server, |p| Owner::Project { id: p.id.clone() }),
        HostRef::Alias(alias) => {
            let by_component = projects.projects.iter().find(|p| {
                p.components
                    .iter()
                    .any(|c| &c.host == alias && c.owns_target(&key.target))
            });
            if let Some(p) = by_component {
                return Owner::Project { id: p.id.clone() };
            }
            let mut users = projects
                .projects
                .iter()
                .filter(|p| p.hosts().contains(&alias));
            match (users.next(), users.next()) {
                (Some(only), None) => Owner::Project {
                    id: only.id.clone(),
                },
                _ => server,
            }
        }
    }
}

/// A probe target belongs to a project URL when it is that URL or a path
/// under it (`https://shop.test/.env` under `https://shop.test`).
fn url_owns(url: &str, target: &str) -> bool {
    let base = url.trim_end_matches('/');
    !base.is_empty()
        && (target == url
            || target == base
            || target
                .strip_prefix(base)
                .is_some_and(|rest| rest.starts_with('/')))
}

/// An unexpired rule on the key makes an issue `Expected` while its evidence
/// matches; changed evidence is flagged and the issue stays active.
fn apply_expected(item: &mut Item, projects: &ProjectsFile, now: Timestamp) {
    if !item.severity.is_issue() {
        return;
    }
    let fp = item.fact.as_ref().and_then(|f| f.fp.as_deref());
    for rule in projects
        .rules
        .iter()
        .filter(|r| r.covers(&item.key) && !r.is_expired(now))
    {
        match rule.check_evidence(fp) {
            RuleMatch::Holds => {
                item.disposition = Disposition::Expected {
                    rule: rule.id.clone(),
                    stale_since: item.disposition.stale_since(),
                };
                item.rule_broken = None;
                return;
            }
            RuleMatch::EvidenceChanged => item.rule_broken = Some(rule.id.clone()),
        }
    }
}
