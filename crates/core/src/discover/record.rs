//! What the setup scripts print: one JSON record per line, the kind in `rec`.
//!
//! The server is untrusted. Every record is checked after it is parsed: names
//! and paths must be what `projects.json` would accept (so a suggestion can
//! never turn into a component that is later passed to a server script as
//! something else), strings are short, and a record that does not fit is
//! dropped and counted rather than repaired.

use serde::{Deserialize, Serialize};

use crate::domain::project::{DbEngine, is_abs_path, is_plain_name};

/// Longest free text kept from a server (OS name, process name, proxy target).
const MAX_TEXT: usize = 120;
/// Longest host name kept (the DNS limit).
const MAX_HOSTNAME: usize = 253;
/// Longest list kept in one record.
const MAX_LIST: usize = 30;

/// One line of discover or login output.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "rec", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum SetupRecord {
    Login(LoginReport),
    Path(PathCheck),
    Vhost(Vhost),
    Compose(ComposeProject),
    Pm2(Pm2App),
    Pm2Home(Pm2Home),
    Db(DbServer),
    Env(EnvFile),
    Port(ListenPort),
    Note(Note),
}

/// Whether the SSH user can use the docker daemon.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum DockerAccess {
    /// The daemon answers.
    Ok,
    /// The socket is there but the user is not in the `docker` group.
    NoPermission,
    /// Docker is installed, no daemon runs.
    Stopped,
    /// No docker command.
    Missing,
}

/// The login test: who the SSH user is on this host and what it may do.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LoginReport {
    /// `uname -s`; Daminus v0.1 supports `Linux`.
    pub os: String,
    pub kernel: String,
    pub arch: String,
    /// `PRETTY_NAME` of `/etc/os-release`.
    pub distro: String,
    pub user: String,
    pub uid: u32,
    pub root: bool,
    pub docker_group: bool,
    /// Can read system logs (`/var/log`).
    pub adm_group: bool,
    /// Can read the systemd journal.
    pub journal_group: bool,
    pub docker: DockerAccess,
    /// `find` is GNU find (the security checks need it).
    pub gnu_find: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum PathState {
    Readable,
    /// It exists, or sits inside a folder, that this user cannot enter.
    Denied,
    Missing,
}

/// A project folder the login test was asked about.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct PathCheck {
    pub path: String,
    pub state: PathState,
}

/// An nginx `server` block.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Vhost {
    /// The config file it is in.
    pub file: String,
    /// `server_name` values (wildcards and `_` included; the grouping decides).
    pub names: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub root: Option<String>,
    /// `proxy_pass` as `host[:port]` (scheme and path dropped, an `upstream`
    /// name resolved to its first server).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy: Option<String>,
    pub ssl: bool,
    /// `fastcgi_pass` is used (PHP-FPM).
    pub php: bool,
    pub listen: Vec<u16>,
}

/// A docker compose project, from the labels of its containers.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ComposeProject {
    pub project: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dir: Option<String>,
    pub services: Vec<String>,
    pub running: u32,
    pub total: u32,
    /// Host ports its containers publish.
    pub ports: Vec<u16>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Pm2App {
    pub app: String,
    /// The daemon's `PM2_HOME`.
    pub home: String,
    /// It is the SSH user's own daemon (`$PM2_HOME` or `~/.pm2`).
    pub default: bool,
    pub instances: u32,
    /// One of pm2's own states, or `unknown`.
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Pm2HomeState {
    /// A daemon of another user: its apps cannot be listed from this login.
    NeedsPerm,
}

/// A pm2 daemon this user may not ask.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Pm2Home {
    pub home: String,
    pub state: Pm2HomeState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum DbSource {
    Process,
    Container,
}

/// A database server running on the host.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct DbServer {
    pub engine: DbEngine,
    pub origin: DbSource,
    /// The process name (`mariadbd`) or the container name.
    pub name: String,
    /// The compose project of the container, if it has one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
}

/// A `.env` file. Only where it is and whether it can be read; its content
/// is never read by discover.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct EnvFile {
    pub path: String,
    pub readable: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Bind {
    /// `0.0.0.0` or `::`: every interface.
    Any,
    /// `127.0.0.0/8` or `::1`.
    Loopback,
    /// One specific address.
    Other,
}

/// A listening TCP port.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ListenPort {
    pub port: u16,
    pub bind: Bind,
    /// The process that holds it, when it is one of the SSH user's own.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "proc")]
    pub process: Option<String>,
    /// That process's working folder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum NoteCode {
    /// Docker is there, but the user is not in the `docker` group.
    DockerNoPermission,
    DockerStopped,
    /// A pm2 daemon runs, but there is no `pm2` command on this user's `PATH`.
    Pm2Missing,
    /// `nginx.conf` is there, but this user may not read it.
    NginxNoPermission,
}

/// A source discover could not read, so what it lists is incomplete.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Note {
    pub code: NoteCode,
}

impl SetupRecord {
    /// The record with every string checked and cut, or `None` when it cannot
    /// be used (a name or path that `projects.json` would refuse).
    pub fn sanitize(self) -> Option<Self> {
        Some(match self {
            SetupRecord::Login(mut l) => {
                for s in [
                    &mut l.os,
                    &mut l.kernel,
                    &mut l.arch,
                    &mut l.distro,
                    &mut l.user,
                ] {
                    cut(s, MAX_TEXT);
                }
                SetupRecord::Login(l)
            }
            SetupRecord::Path(p) => is_abs_path(&p.path).then_some(SetupRecord::Path(p))?,
            SetupRecord::Vhost(mut v) => {
                v.names.retain(|n| hostname(n));
                v.names.truncate(MAX_LIST);
                v.root = v.root.filter(|r| is_abs_path(r));
                v.proxy = v
                    .proxy
                    .filter(|p| p.len() <= MAX_HOSTNAME && !p.chars().any(char::is_whitespace));
                if !is_abs_path(&v.file) {
                    v.file.clear();
                }
                v.listen.truncate(MAX_LIST);
                SetupRecord::Vhost(v)
            }
            SetupRecord::Compose(mut c) => {
                if !is_plain_name(&c.project) {
                    return None;
                }
                c.dir = c.dir.filter(|d| is_abs_path(d));
                c.services.retain(|s| is_plain_name(s));
                c.services.truncate(MAX_LIST);
                c.ports.truncate(MAX_LIST);
                SetupRecord::Compose(c)
            }
            SetupRecord::Pm2(mut a) => {
                if !is_plain_name(&a.app) || !is_abs_path(&a.home) {
                    return None;
                }
                a.cwd = a.cwd.filter(|d| is_abs_path(d));
                if !PM2_STATES.contains(&a.status.as_str()) {
                    a.status = "unknown".into();
                }
                SetupRecord::Pm2(a)
            }
            SetupRecord::Pm2Home(h) => is_abs_path(&h.home).then_some(SetupRecord::Pm2Home(h))?,
            SetupRecord::Db(mut d) => {
                let named = match d.origin {
                    DbSource::Container => is_plain_name(&d.name),
                    DbSource::Process => {
                        !d.name.is_empty() && d.name.chars().all(|c| c.is_ascii_graphic())
                    }
                };
                if !named || d.name.len() > MAX_TEXT {
                    return None;
                }
                d.project = d.project.filter(|p| is_plain_name(p));
                SetupRecord::Db(d)
            }
            SetupRecord::Env(e) => is_abs_path(&e.path).then_some(SetupRecord::Env(e))?,
            SetupRecord::Port(mut p) => {
                if let Some(name) = &mut p.process {
                    cut(name, MAX_TEXT);
                }
                p.cwd = p.cwd.filter(|d| is_abs_path(d));
                SetupRecord::Port(p)
            }
            SetupRecord::Note(n) => SetupRecord::Note(n),
        })
    }

    /// The most records of this kind kept from one host.
    pub fn cap(&self) -> usize {
        match self {
            SetupRecord::Login(_) => 1,
            SetupRecord::Path(_)
            | SetupRecord::Env(_)
            | SetupRecord::Compose(_)
            | SetupRecord::Pm2(_) => 100,
            SetupRecord::Vhost(_) => 200,
            SetupRecord::Port(_) => 60,
            SetupRecord::Db(_) => 40,
            SetupRecord::Pm2Home(_) | SetupRecord::Note(_) => 20,
        }
    }

    /// A key that tells kinds apart, for counting against [`SetupRecord::cap`].
    pub fn kind(&self) -> &'static str {
        match self {
            SetupRecord::Login(_) => "login",
            SetupRecord::Path(_) => "path",
            SetupRecord::Vhost(_) => "vhost",
            SetupRecord::Compose(_) => "compose",
            SetupRecord::Pm2(_) => "pm2",
            SetupRecord::Pm2Home(_) => "pm2_home",
            SetupRecord::Db(_) => "db",
            SetupRecord::Env(_) => "env",
            SetupRecord::Port(_) => "port",
            SetupRecord::Note(_) => "note",
        }
    }
}

/// pm2's own process states.
const PM2_STATES: &[&str] = &[
    "online",
    "stopping",
    "stopped",
    "launching",
    "errored",
    "one-launch-status",
    "waiting restart",
    "unknown",
];

/// A server name as nginx allows it, wildcards included.
fn hostname(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_HOSTNAME
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '*'))
}

fn cut(s: &mut String, max: usize) {
    if let Some((i, _)) = s.char_indices().nth(max) {
        s.truncate(i);
    }
}

#[cfg(test)]
mod tests;
