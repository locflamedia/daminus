//! The hosts in the user's `~/.ssh/config`, for the setup screens.
//!
//! Listing is a light read of the file text, following `Include`: which
//! `Host` aliases exist, and which entries are left out and why (a wildcard,
//! a `Match` block, no `HostName`, a name that cannot be an alias). The values
//! the connection really uses (HostName, User, Port, ProxyJump…) are never
//! worked out here: `ssh -G -- <alias>` computes them with ssh's own rules
//! ([`resolve`]). The app only reads this file; it never writes it.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::tools::SshTools;
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::host::HostAlias;

/// ssh stops following `Include` at this depth.
const MAX_INCLUDE_DEPTH: u32 = 16;
/// Most files read for one listing, against an `Include` fan-out.
const MAX_FILES: usize = 256;
/// Longest pattern or `Match` text kept for display.
const MAX_SHOWN: usize = 200;
/// How long `ssh -G` may take.
const RESOLVE_TIMEOUT: Duration = Duration::from_secs(10);
/// Most `ssh -G` processes at once.
const RESOLVE_AT_ONCE: usize = 8;

/// Why a `Host` entry is not offered.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum SkipReason {
    /// A pattern (`*`, `?`, `!`): it names no single server.
    Wildcard,
    /// A `Match` block: its settings depend on conditions.
    Match,
    /// No `HostName` applies, so the alias alone does not say where to connect.
    NoHostName,
    /// A name that cannot be used as an alias (letters, digits, `.`, `_`, `-`).
    InvalidAlias,
}

/// A host the user can pick.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ConfigHost {
    pub alias: HostAlias,
    /// The file that defines it (an included file, maybe).
    pub file: String,
    pub line: u32,
}

/// An entry that is left out, as written in the file.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SkippedHost {
    pub pattern: String,
    pub reason: SkipReason,
    pub file: String,
    pub line: u32,
}

/// Why the list is empty.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum EmptyReason {
    /// There is no config file.
    NoConfig,
    /// The file has no entry that can be used.
    NoUsableHosts,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostList {
    /// The config file exists.
    pub config_found: bool,
    pub hosts: Vec<ConfigHost>,
    pub skipped: Vec<SkippedHost>,
    /// Set when `hosts` is empty: the setup screen's empty state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub empty: Option<EmptyReason>,
}

/// Where the config is read from.
#[derive(Clone, Debug)]
pub struct ConfigSource {
    pub file: PathBuf,
    /// Relative `Include` paths start here (`~/.ssh`, as ssh does).
    pub include_base: PathBuf,
    /// What `~` means.
    pub home: PathBuf,
}

impl ConfigSource {
    /// The config `tools` reads: its `-F` file, else `$HOME/.ssh/config`. The
    /// home folder is `$HOME`, else the one the user database says (as ssh
    /// does); without either the `-F` file is still read, with its own folder
    /// standing in. `None` when `-F` is not set and there is no home at all.
    pub fn for_tools(tools: &SshTools) -> Option<Self> {
        let home = tools.var("HOME").map(PathBuf::from).or_else(passwd_home);
        Self::at(home, tools.config())
    }

    fn at(home: Option<PathBuf>, config: Option<&Path>) -> Option<Self> {
        match (home, config) {
            (Some(home), config) => {
                let include_base = home.join(".ssh");
                let file = config.map_or_else(|| include_base.join("config"), Path::to_path_buf);
                Some(Self {
                    file,
                    include_base,
                    home,
                })
            }
            (None, Some(file)) => {
                let dir = file.parent().map(Path::to_path_buf).unwrap_or_default();
                Some(Self {
                    file: file.to_path_buf(),
                    include_base: dir.clone(),
                    home: dir,
                })
            }
            (None, None) => None,
        }
    }
}

/// The home folder of the user running this process, from the user database.
fn passwd_home() -> Option<PathBuf> {
    nix::unistd::User::from_uid(nix::unistd::Uid::current())
        .ok()
        .flatten()
        .map(|u| u.dir)
}

/// Lists the hosts of `source`. A missing file is the empty state, not an error.
pub fn list_hosts(source: &ConfigSource) -> Result<HostList, AppError> {
    let mut parser = Parser {
        source,
        blocks: Vec::new(),
        files: 0,
        global_host_name: false,
        chain: vec![canonical(&source.file)],
    };
    let found = match std::fs::read_to_string(&source.file) {
        Ok(text) => {
            parser.parse(&source.file, &text, 0, None);
            true
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => {
            return Err(AppError::from(ErrorCode::Io {
                path: source.file.display().to_string(),
            }));
        }
    };
    let mut list = parser.finish(found);
    if list.hosts.is_empty() {
        list.empty = Some(if found {
            EmptyReason::NoUsableHosts
        } else {
            EmptyReason::NoConfig
        });
    }
    Ok(list)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum BlockKind {
    Host,
    Match,
}

/// One `Host` or `Match` line and the `HostName` its body sets.
struct Block {
    kind: BlockKind,
    patterns: Vec<String>,
    host_name: bool,
    file: String,
    line: u32,
}

struct Parser<'a> {
    source: &'a ConfigSource,
    blocks: Vec<Block>,
    files: usize,
    /// A `HostName` before any `Host` or `Match` line: ssh applies it to
    /// every host.
    global_host_name: bool,
    /// The files being read, outermost first: an `Include` of one of them
    /// would only read it again.
    chain: Vec<PathBuf>,
}

/// `path` as the file system names it, so two spellings of one file match.
fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

impl Parser<'_> {
    /// Reads one file. `inherit` is the block an `Include` sits in: lines
    /// before the file's own first `Host`/`Match` belong to it. A block opened
    /// inside an included file ends with that file, as in ssh.
    fn parse(&mut self, path: &Path, text: &str, depth: u32, inherit: Option<usize>) {
        self.files += 1;
        let file = path.display().to_string();
        let mut current = inherit;
        for (n, raw) in text.lines().enumerate() {
            let line = u32::try_from(n + 1).unwrap_or(u32::MAX);
            let Some((key, args)) = split_line(raw) else {
                continue;
            };
            match key.to_ascii_lowercase().as_str() {
                "host" => {
                    self.blocks.push(Block {
                        kind: BlockKind::Host,
                        patterns: args,
                        host_name: false,
                        file: file.clone(),
                        line,
                    });
                    current = Some(self.blocks.len() - 1);
                }
                "match" => {
                    self.blocks.push(Block {
                        kind: BlockKind::Match,
                        patterns: vec![args.join(" ")],
                        host_name: false,
                        file: file.clone(),
                        line,
                    });
                    current = Some(self.blocks.len() - 1);
                }
                "hostname" => {
                    if !args.is_empty() {
                        match current {
                            Some(i) => self.blocks[i].host_name = true,
                            None => self.global_host_name = true,
                        }
                    }
                }
                "include" => {
                    if depth >= MAX_INCLUDE_DEPTH {
                        continue;
                    }
                    for pattern in &args {
                        for included in self.expand(pattern) {
                            if self.files >= MAX_FILES {
                                return;
                            }
                            let id = canonical(&included);
                            if self.chain.contains(&id) {
                                continue;
                            }
                            if let Ok(body) = std::fs::read_to_string(&included) {
                                self.chain.push(id);
                                self.parse(&included, &body, depth + 1, current);
                                self.chain.pop();
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    /// The files an `Include` pattern names, in name order: `~` is the home
    /// folder, a relative path starts in the include base, and `*` / `?` work
    /// in every path component. No match is not an error.
    fn expand(&self, pattern: &str) -> Vec<PathBuf> {
        let full = if let Some(rest) = pattern.strip_prefix("~/") {
            self.source.home.join(rest)
        } else if pattern == "~" {
            self.source.home.clone()
        } else if pattern.starts_with('/') {
            PathBuf::from(pattern)
        } else {
            self.source.include_base.join(pattern)
        };
        let mut paths = vec![PathBuf::new()];
        for comp in full.components() {
            let part = comp.as_os_str().to_string_lossy().into_owned();
            let mut next = Vec::new();
            if part.contains(['*', '?']) {
                for base in &paths {
                    let Ok(entries) = std::fs::read_dir(base) else {
                        continue;
                    };
                    let mut names: Vec<String> = entries
                        .filter_map(|e| e.ok())
                        .filter_map(|e| e.file_name().into_string().ok())
                        .filter(|name| glob_match(&part, name, false))
                        .collect();
                    names.sort();
                    next.extend(names.into_iter().map(|name| base.join(name)));
                }
            } else {
                next.extend(paths.iter().map(|base| base.join(&part)));
            }
            paths = next;
        }
        paths.into_iter().filter(|p| p.is_file()).collect()
    }

    fn finish(self, found: bool) -> HostList {
        let mut hosts: Vec<ConfigHost> = Vec::new();
        let mut skipped = Vec::new();
        // The same entry can come twice through an `Include` read from two places.
        fn skip(list: &mut Vec<SkippedHost>, entry: SkippedHost) {
            if !list.contains(&entry) {
                list.push(entry);
            }
        }
        for block in &self.blocks {
            if block.kind == BlockKind::Match {
                skip(
                    &mut skipped,
                    SkippedHost {
                        pattern: shown(&format!("Match {}", block.patterns.join(" "))),
                        reason: SkipReason::Match,
                        file: block.file.clone(),
                        line: block.line,
                    },
                );
                continue;
            }
            for pattern in &block.patterns {
                let entry = |reason| SkippedHost {
                    pattern: shown(pattern),
                    reason,
                    file: block.file.clone(),
                    line: block.line,
                };
                if pattern.contains(['*', '?', '!']) {
                    skip(&mut skipped, entry(SkipReason::Wildcard));
                    continue;
                }
                let Ok(alias) = HostAlias::parse(pattern) else {
                    skip(&mut skipped, entry(SkipReason::InvalidAlias));
                    continue;
                };
                if hosts.iter().any(|h| h.alias == alias) {
                    continue;
                }
                if !self.has_host_name(&alias) {
                    skip(&mut skipped, entry(SkipReason::NoHostName));
                    continue;
                }
                hosts.push(ConfigHost {
                    alias,
                    file: block.file.clone(),
                    line: block.line,
                });
            }
        }
        HostList {
            config_found: found,
            hosts,
            skipped,
            empty: None,
        }
    }

    /// Whether a `HostName` applies to `alias`: one set before any block, or
    /// by a `Host` block that applies to it (its own, or a pattern such as
    /// `Host web-*`).
    fn has_host_name(&self, alias: &HostAlias) -> bool {
        self.global_host_name
            || self.blocks.iter().any(|b| {
                b.kind == BlockKind::Host && b.host_name && applies(&b.patterns, alias.as_str())
            })
    }
}

/// ssh's rule for a `Host` line: some pattern matches and no `!pattern` does.
fn applies(patterns: &[String], name: &str) -> bool {
    let mut hit = false;
    for p in patterns {
        match p.strip_prefix('!') {
            Some(neg) => {
                if glob_match(neg, name, true) {
                    return false;
                }
            }
            None => hit |= glob_match(p, name, true),
        }
    }
    hit
}

fn shown(s: &str) -> String {
    s.chars().take(MAX_SHOWN).collect()
}

/// `*` and `?` matching; `fold` ignores ASCII case (host names do).
fn glob_match(pattern: &str, text: &str, fold: bool) -> bool {
    let norm = |c: char| if fold { c.to_ascii_lowercase() } else { c };
    let p: Vec<char> = pattern.chars().map(norm).collect();
    let t: Vec<char> = text.chars().map(norm).collect();
    let (mut pi, mut ti) = (0, 0);
    let (mut star, mut mark) = (None, 0);
    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) && p[pi] != '*' {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ti;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ti = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

/// A config line as ssh reads it: a keyword, then arguments separated by
/// spaces or one `=`, with `"` quoting; a `#` that starts an argument ends the
/// line. `None` for blank and comment lines.
fn split_line(line: &str) -> Option<(String, Vec<String>)> {
    let t = line.trim_start();
    if t.is_empty() || t.starts_with('#') {
        return None;
    }
    let end = t
        .find(|c: char| c.is_whitespace() || c == '=')
        .unwrap_or(t.len());
    let key = t[..end].to_owned();
    let rest = t[end..].trim_start();
    let rest = rest.strip_prefix('=').map_or(rest, str::trim_start);
    Some((key, tokens(rest)))
}

fn tokens(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut started = false;
    let mut quoted = false;
    for c in s.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                started = true;
            }
            '#' if !quoted && !started => break,
            c if c.is_whitespace() && !quoted => {
                if started {
                    out.push(std::mem::take(&mut cur));
                    started = false;
                }
            }
            c => {
                cur.push(c);
                started = true;
            }
        }
    }
    if started {
        out.push(cur);
    }
    out
}

/// What the connection to a host really uses, as `ssh -G` computes it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ResolvedHost {
    pub hostname: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    pub port: u16,
    pub identity_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_jump: Option<String>,
    /// A `ProxyCommand` is set (the connection does not go straight to the host).
    pub proxy_command: bool,
    /// The files ssh looks the host key up in: the user's, then the system's.
    pub known_hosts_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_key_alias: Option<String>,
}

impl ResolvedHost {
    /// Whether the TCP connection goes through another host or command, so
    /// the host's key cannot be read by connecting straight to `hostname`.
    pub fn proxied(&self) -> bool {
        self.proxy_jump.is_some() || self.proxy_command
    }

    /// Reads the `key value` lines of `ssh -G`. `None` without a host name.
    pub fn parse(output: &str) -> Option<Self> {
        let mut r = Self {
            hostname: String::new(),
            user: None,
            port: 22,
            identity_files: Vec::new(),
            proxy_jump: None,
            proxy_command: false,
            known_hosts_files: Vec::new(),
            host_key_alias: None,
        };
        // ssh -G lists its options alphabetically; the user's files come first.
        let (mut user_files, mut global_files) = (Vec::new(), Vec::new());
        for line in output.lines() {
            let Some((key, value)) = line.split_once(' ') else {
                continue;
            };
            let value = value.trim();
            let set = |v: &str| (!v.is_empty() && v != "none").then(|| v.to_owned());
            match key {
                "hostname" => r.hostname = value.to_owned(),
                "user" => r.user = set(value),
                "port" => r.port = value.parse().unwrap_or(22),
                "identityfile" => r.identity_files.push(value.to_owned()),
                "proxyjump" => r.proxy_jump = set(value),
                "proxycommand" => r.proxy_command = set(value).is_some(),
                "userknownhostsfile" => {
                    user_files.extend(tokens(value).into_iter().filter(|f| f != "none"));
                }
                "globalknownhostsfile" => {
                    global_files.extend(tokens(value).into_iter().filter(|f| f != "none"));
                }
                "hostkeyalias" => r.host_key_alias = set(value),
                _ => {}
            }
        }
        r.known_hosts_files = user_files.into_iter().chain(global_files).collect();
        (!r.hostname.is_empty()).then_some(r)
    }
}

/// Asks `ssh -G` what the connection to `alias` uses. `None` when ssh cannot
/// say (not installed, the config does not parse).
pub async fn resolve(tools: &SshTools, alias: &HostAlias) -> Option<ResolvedHost> {
    let mut cmd = tools.command(&tools.ssh);
    cmd.arg("-G");
    if let Some(cfg) = tools.config() {
        cmd.arg("-F").arg(cfg);
    }
    cmd.arg("--").arg(alias.as_str());
    let out = tools.capture(cmd, b"", RESOLVE_TIMEOUT).await?;
    if !out.ok() {
        return None;
    }
    ResolvedHost::parse(&out.stdout)
}

/// A listed host with what ssh resolves for it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostEntry {
    pub host: ConfigHost,
    pub resolved: Option<ResolvedHost>,
}

/// The host list with what `ssh -G` says about each host, as the setup screens read it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HostListing {
    pub list: HostList,
    /// One entry per listed host, in list order.
    pub entries: Vec<HostEntry>,
}

/// Resolves every host of `list` (a few at a time), in list order.
pub async fn resolve_all(tools: &SshTools, list: &HostList) -> Vec<HostEntry> {
    let mut out = Vec::with_capacity(list.hosts.len());
    for chunk in list.hosts.chunks(RESOLVE_AT_ONCE) {
        let mut set = tokio::task::JoinSet::new();
        for (i, host) in chunk.iter().enumerate() {
            let tools = tools.clone();
            let alias = host.alias.clone();
            set.spawn(async move { (i, resolve(&tools, &alias).await) });
        }
        let mut resolved: Vec<Option<ResolvedHost>> = vec![None; chunk.len()];
        while let Some(Ok((i, r))) = set.join_next().await {
            resolved[i] = r;
        }
        out.extend(
            chunk
                .iter()
                .cloned()
                .zip(resolved)
                .map(|(host, resolved)| HostEntry { host, resolved }),
        );
    }
    out
}

#[cfg(test)]
mod tests;
