//! `projects.json`: projects, their components, per-host settings and the
//! "mark as expected" rules. Holds no secrets: a database component names the
//! `.env` path on the server, never a value from it.

use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize};

use super::expected::ExpectedRule;
use super::host::HostAlias;
use super::rule::ThresholdOverride;

/// Current `projects.json` format version.
pub const PROJECTS_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Role {
    Fe,
    Be,
    Worker,
    Db,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum DbEngine {
    Mysql,
    Postgres,
}

/// What a component is on its host. Written flat into the component with a
/// `kind` tag: `{"role":"fe","host":"vps-a","kind":"path","path":"/var/www/shop"}`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
///
/// Every string here is later passed to server-side scripts and `docker exec`
/// as an argument, so loading rejects values that could be read as an option
/// or break out of an argument: names must match `[A-Za-z0-9][A-Za-z0-9._-]*`
/// and paths must be absolute with no control characters.
pub enum ComponentKind {
    /// A code folder.
    Path {
        #[serde(deserialize_with = "abs_path")]
        path: String,
    },
    /// A docker compose project (label `com.docker.compose.project`).
    Compose {
        #[serde(deserialize_with = "plain_name")]
        project: String,
    },
    /// A pm2 app.
    Pm2 {
        #[serde(deserialize_with = "plain_name")]
        app: String,
    },
    /// A database reached with credentials read on the server from `env_file`,
    /// optionally through `docker exec` into `container`.
    Db {
        engine: DbEngine,
        #[serde(deserialize_with = "plain_name")]
        database: String,
        #[serde(deserialize_with = "abs_path")]
        env_file: String,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "opt_plain_name"
        )]
        container: Option<String>,
    },
}

/// Longest name or path accepted in a component.
const MAX_ARG_LEN: usize = 1024;

/// Whether `s` is a container, compose project, pm2 app or database name
/// that is safe to pass as one argument.
pub fn is_plain_name(s: &str) -> bool {
    let mut chars = s.chars();
    s.len() <= MAX_ARG_LEN
        && chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Whether `s` is an absolute path with no control characters.
pub fn is_abs_path(s: &str) -> bool {
    s.len() <= MAX_ARG_LEN && s.starts_with('/') && !s.chars().any(char::is_control)
}

fn checked<'de, D: Deserializer<'de>>(
    d: D,
    ok: fn(&str) -> bool,
    what: &str,
) -> Result<String, D::Error> {
    let raw = String::deserialize(d)?;
    if ok(&raw) {
        Ok(raw)
    } else {
        Err(serde::de::Error::custom(format!("invalid {what}: {raw:?}")))
    }
}

fn plain_name<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    checked(d, is_plain_name, "name (letters, digits, '.', '_', '-')")
}

fn abs_path<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    checked(d, is_abs_path, "path (absolute, no control characters)")
}

fn opt_plain_name<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    match Option::<String>::deserialize(d)? {
        None => Ok(None),
        Some(raw) if is_plain_name(&raw) => Ok(Some(raw)),
        Some(raw) => Err(serde::de::Error::custom(format!(
            "invalid container name: {raw:?}"
        ))),
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Component {
    pub role: Role,
    pub host: HostAlias,
    #[serde(flatten)]
    #[cfg_attr(feature = "ts", ts(flatten))]
    pub kind: ComponentKind,
}

impl Component {
    /// The check target this component owns: results whose target equals it
    /// or sits under it (`<key>/…`) belong to the component.
    pub fn target_key(&self) -> &str {
        match &self.kind {
            ComponentKind::Path { path } => path.trim_end_matches('/'),
            ComponentKind::Compose { project } => project,
            ComponentKind::Pm2 { app } => app,
            ComponentKind::Db { database, .. } => database,
        }
    }

    /// Whether a result target on this component's host belongs to it.
    pub fn owns_target(&self, target: &str) -> bool {
        let key = self.target_key();
        !key.is_empty()
            && (target == key
                || target
                    .strip_prefix(key)
                    .is_some_and(|rest| rest.starts_with('/')))
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Checked from this Mac (`url.*`).
    #[serde(default)]
    pub urls: Vec<String>,
    #[serde(default)]
    pub components: Vec<Component>,
    /// Threshold overrides for this project's results (project sheet).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub overrides: Vec<ThresholdOverride>,
}

impl Project {
    /// Hosts this project uses, deduplicated, in component order.
    pub fn hosts(&self) -> Vec<&HostAlias> {
        let mut out: Vec<&HostAlias> = Vec::new();
        for c in &self.components {
            if !out.contains(&&c.host) {
                out.push(&c.host);
            }
        }
        out
    }
}

/// Per-host settings (Settings › Hosts). Connection details stay in `~/.ssh/config`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostSettings {
    /// Include in scans. Excluded hosts show "not scanned" on their projects.
    #[serde(default = "yes")]
    pub include: bool,
}

impl Default for HostSettings {
    fn default() -> Self {
        Self { include: true }
    }
}

fn yes() -> bool {
    true
}

/// The whole `projects.json`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ProjectsFile {
    pub version: u32,
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub hosts: BTreeMap<HostAlias, HostSettings>,
    /// "Mark as expected" rules. Kept here, not in snapshots, so they survive every scan.
    #[serde(default)]
    pub rules: Vec<ExpectedRule>,
}

impl Default for ProjectsFile {
    fn default() -> Self {
        Self {
            version: PROJECTS_VERSION,
            projects: Vec::new(),
            hosts: BTreeMap::new(),
            rules: Vec::new(),
        }
    }
}

impl ProjectsFile {
    pub fn host_included(&self, host: &HostAlias) -> bool {
        self.hosts.get(host).is_none_or(|h| h.include)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn component_strings_are_validated_on_load() {
        let ok = [
            json!({"kind": "path", "path": "/var/www/shop"}),
            json!({"kind": "compose", "project": "shop"}),
            json!({"kind": "pm2", "app": "shop-queue"}),
            json!({"kind": "db", "engine": "mysql", "database": "shop_1",
                   "env_file": "/srv/shop/.env", "container": "shop-db-1"}),
            json!({"kind": "db", "engine": "postgres", "database": "shop",
                   "env_file": "/srv/shop/.env"}),
        ];
        for v in ok {
            assert!(
                serde_json::from_value::<ComponentKind>(v.clone()).is_ok(),
                "{v}"
            );
        }
        let bad = [
            json!({"kind": "path", "path": "var/www"}),
            json!({"kind": "path", "path": "/var/www\nrm"}),
            json!({"kind": "path", "path": "/srv/a\u{0}b"}),
            json!({"kind": "compose", "project": "-p evil"}),
            json!({"kind": "compose", "project": ""}),
            json!({"kind": "pm2", "app": "app;reboot"}),
            json!({"kind": "pm2", "app": "a b"}),
            json!({"kind": "db", "engine": "mysql", "database": "--all",
                   "env_file": "/srv/.env"}),
            json!({"kind": "db", "engine": "mysql", "database": "shop",
                   "env_file": "./.env"}),
            json!({"kind": "db", "engine": "mysql", "database": "shop",
                   "env_file": "/srv/.env", "container": "$(id)"}),
        ];
        for v in bad {
            assert!(
                serde_json::from_value::<ComponentKind>(v.clone()).is_err(),
                "{v}"
            );
        }
    }
}
