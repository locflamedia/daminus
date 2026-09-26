//! Which hosts and URLs a scan covers.

use serde::{Deserialize, Serialize};

use crate::domain::error::{AppError, ErrorCode};
use crate::domain::host::HostAlias;
use crate::domain::project::ProjectsFile;

/// What the user asked to scan. Empty = everything.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ScanScope {
    /// Project ids: their hosts and URLs.
    pub projects: Vec<String>,
    /// Single hosts, scanned even when excluded in Settings › Hosts (the user
    /// named them). No URLs come with them.
    pub hosts: Vec<HostAlias>,
}

/// Resolved targets, in a stable order.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ScanTargets {
    pub hosts: Vec<HostAlias>,
    pub urls: Vec<String>,
}

impl ScanTargets {
    pub fn is_empty(&self) -> bool {
        self.hosts.is_empty() && self.urls.is_empty()
    }
}

/// Resolves `scope` against `projects.json`.
///
/// With an empty scope: every included host (used by a project or listed in
/// Settings › Hosts) and every project URL. Unknown project ids are an error,
/// so a typo never silently scans nothing.
pub fn resolve(projects: &ProjectsFile, scope: &ScanScope) -> Result<ScanTargets, AppError> {
    let mut t = ScanTargets::default();
    let everything = scope.projects.is_empty() && scope.hosts.is_empty();
    let push_host = |t: &mut ScanTargets, h: &HostAlias| {
        if !t.hosts.contains(h) {
            t.hosts.push(h.clone());
        }
    };
    let push_url = |t: &mut ScanTargets, u: &str| {
        let u = u.trim();
        if !u.is_empty() && !t.urls.iter().any(|x| x == u) {
            t.urls.push(u.to_owned());
        }
    };
    for id in &scope.projects {
        let Some(p) = projects.projects.iter().find(|p| &p.id == id) else {
            return Err(AppError::from(ErrorCode::NothingToScan).with_param("project", id.clone()));
        };
        for h in p.hosts() {
            if projects.host_included(h) {
                push_host(&mut t, h);
            }
        }
        p.urls.iter().for_each(|u| push_url(&mut t, u));
    }
    for h in &scope.hosts {
        push_host(&mut t, h);
    }
    if everything {
        for p in &projects.projects {
            for h in p.hosts() {
                if projects.host_included(h) {
                    push_host(&mut t, h);
                }
            }
            p.urls.iter().for_each(|u| push_url(&mut t, u));
        }
        for (h, s) in &projects.hosts {
            if s.include {
                push_host(&mut t, h);
            }
        }
    }
    if t.is_empty() {
        return Err(ErrorCode::NothingToScan.into());
    }
    Ok(t)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn file() -> ProjectsFile {
        serde_json::from_value(json!({
            "version": 1,
            "projects": [
                {"id": "shop", "name": "Shop", "urls": ["https://shop.example", " https://shop.example "],
                 "components": [
                    {"role": "fe", "host": "vps-a", "kind": "path", "path": "/srv/shop"},
                    {"role": "db", "host": "vps-b", "kind": "compose", "project": "shopdb"}]},
                {"id": "blog", "name": "Blog", "urls": ["https://blog.example"],
                 "components": [{"role": "fe", "host": "vps-a", "kind": "pm2", "app": "blog"}]}
            ],
            "hosts": {"vps-b": {"include": false}, "vps-c": {"include": true}}
        }))
        .unwrap()
    }

    fn alias(s: &str) -> HostAlias {
        HostAlias::parse(s).unwrap()
    }

    #[test]
    fn everything_skips_excluded_and_adds_listed_hosts() {
        let t = resolve(&file(), &ScanScope::default()).unwrap();
        assert_eq!(t.hosts, vec![alias("vps-a"), alias("vps-c")]);
        assert_eq!(t.urls, vec!["https://shop.example", "https://blog.example"]);
    }

    #[test]
    fn project_and_host_scopes() {
        let t = resolve(
            &file(),
            &ScanScope {
                projects: vec!["blog".into()],
                hosts: vec![alias("vps-b")],
            },
        )
        .unwrap();
        assert_eq!(t.hosts, vec![alias("vps-a"), alias("vps-b")]);
        assert_eq!(t.urls, vec!["https://blog.example"]);
    }

    #[test]
    fn unknown_project_and_empty_config_are_nothing_to_scan() {
        let e = resolve(
            &file(),
            &ScanScope {
                projects: vec!["nope".into()],
                hosts: vec![],
            },
        )
        .unwrap_err();
        assert_eq!(e.code, ErrorCode::NothingToScan);
        let e = resolve(&ProjectsFile::default(), &ScanScope::default()).unwrap_err();
        assert_eq!(e.code, ErrorCode::NothingToScan);
    }
}
