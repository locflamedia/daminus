//! Setup: what the user's servers run, turned into suggested projects.
//!
//! Two scripts run on a host through the same `Transport` as a scan, built
//! into the same kind of bundle (prelude, variables, one subshell function,
//! the hang-up watcher) and held to the same rules (read-only, no `sudo`,
//! allowlisted commands, shellcheck, the read-only container harness):
//! `login.sh` says who the SSH user is and what it may do, `discover.sh` lists
//! nginx server blocks, compose projects, pm2 apps, database servers, `.env`
//! paths and listening ports. [`RecordParser`] reads their output,
//! [`grouping`] turns the records of all hosts into suggested projects.
//!
//! discover never reads a `.env` and never prints an environment, a command
//! line or file content. The database name is a value inside the `.env`, so
//! a suggested database component has the engine and the `.env` path and
//! leaves the name for the user.

pub mod grouping;
mod parse;
mod record;

use serde::{Deserialize, Serialize};

pub use parse::{RecordOutput, RecordParser};
pub use record::{
    Bind, ComposeProject, DbServer, DbSource, DockerAccess, EnvFile, ListenPort, LoginReport, Note,
    NoteCode, PathCheck, PathState, Pm2App, Pm2Home, Pm2HomeState, SetupRecord, Vhost,
};

use crate::checks::bundle::{self, Bundle, BundleError, BundleVars};
use crate::domain::project::is_abs_path;
use crate::domain::settings::ScanSettings;

/// `login.sh`, the body of the login test.
pub const LOGIN_SCRIPT: &str = include_str!("../../discover/login.sh");
/// `discover.sh`, the body of discover.
pub const DISCOVER_SCRIPT: &str = include_str!("../../discover/discover.sh");

/// External commands `login.sh` may run (besides builtins and the prelude).
pub const LOGIN_NEEDS: &[&str] = &["uname", "id", "awk"];
/// External commands `discover.sh` may run.
pub const DISCOVER_NEEDS: &[&str] = &["awk", "docker", "find", "pm2", "sort", "tr"];

/// The login test's bundle, asking about `paths` (project folders, absolute).
/// `hangup` is for a transport that keeps stdin open after the script: the
/// bundle then stops when the client goes away (see `bundle::HANGUP_VAR`).
pub fn login_bundle(paths: &[String], hangup: bool) -> Result<Bundle, BundleError> {
    let mut vars = BundleVars::new();
    if let Some(bad) = paths.iter().find(|p| !is_abs_path(p)) {
        return Err(BundleError::BadPath(bad.clone()));
    }
    vars.set("DAMINUS_PATHS", paths.join("\n"))?;
    if hangup {
        vars.set(bundle::HANGUP_VAR, "1")?;
    }
    bundle::build_script("login", LOGIN_SCRIPT, &vars)
}

/// The discover bundle (`hangup` as for [`login_bundle`]). Folders in
/// Settings › Scan skip paths are not searched for `.env` files.
pub fn discover_bundle(scan: &ScanSettings, hangup: bool) -> Result<Bundle, BundleError> {
    let mut vars = BundleVars::from_scan(scan)?;
    if hangup {
        vars.set(bundle::HANGUP_VAR, "1")?;
    }
    bundle::build_script("discover", DISCOVER_SCRIPT, &vars)
}

/// What one host's discover run found, by kind.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostDiscovery {
    pub vhosts: Vec<Vhost>,
    pub compose: Vec<ComposeProject>,
    pub pm2: Vec<Pm2App>,
    pub pm2_homes: Vec<Pm2Home>,
    pub dbs: Vec<DbServer>,
    pub envs: Vec<EnvFile>,
    pub ports: Vec<ListenPort>,
    pub notes: Vec<Note>,
}

impl HostDiscovery {
    /// Adds a record of a discover run. Login records do not belong here.
    pub fn push(&mut self, record: SetupRecord) {
        match record {
            SetupRecord::Vhost(v) => self.vhosts.push(v),
            SetupRecord::Compose(c) => self.compose.push(c),
            SetupRecord::Pm2(a) => self.pm2.push(a),
            SetupRecord::Pm2Home(h) => self.pm2_homes.push(h),
            SetupRecord::Db(d) => self.dbs.push(d),
            SetupRecord::Env(e) => self.envs.push(e),
            SetupRecord::Port(p) => self.ports.push(p),
            SetupRecord::Note(n) => self.notes.push(n),
            SetupRecord::Login(_) | SetupRecord::Path(_) => {}
        }
    }

    pub fn from_records(records: impl IntoIterator<Item = SetupRecord>) -> Self {
        let mut found = Self::default();
        for r in records {
            found.push(r);
        }
        found
    }

    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

/// What one host's login test found.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LoginResult {
    pub login: Option<LoginReport>,
    /// The project folders that were asked about.
    pub paths: Vec<PathCheck>,
}

impl LoginResult {
    pub fn from_records(records: impl IntoIterator<Item = SetupRecord>) -> Self {
        let mut result = Self::default();
        for r in records {
            match r {
                SetupRecord::Login(l) => result.login = Some(l),
                SetupRecord::Path(p) => result.paths.push(p),
                _ => {}
            }
        }
        result
    }
}

#[cfg(test)]
mod tests;
