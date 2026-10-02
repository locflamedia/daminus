//! Suggested projects from what discover found on every selected host.
//!
//! Pure: records in, a [`Proposal`] out. Items are linked when they share
//! evidence, and each linked group that has a public domain, or at least two
//! parts (server blocks without a public name do not count on their own),
//! becomes a project; the rest are listed as "Not in a project".
//!
//! The evidence, strongest first:
//! - **a domain**: nginx server blocks whose `server_name`s share a registered
//!   domain (`shop-x.com`, `api.shop-x.com`; by the Public Suffix List, so
//!   `beru.io.vn` and `robertnguyen.io.vn` are two) belong together, on any host;
//! - **a folder**: a web root, a compose working folder and a pm2 folder that
//!   are the same folder or one inside the other (after taking `public`,
//!   `dist`, `current`… off) belong together, on one host. Folders every site
//!   shares (`/var/www`, `/srv`, a home folder) never link anything;
//! - **a port**: a server block that proxies to a port on this server belongs
//!   with the compose project publishing it, and with the folder of the
//!   process listening on it.
//!
//! A `.env` file joins the group whose folder is closest to its own. A
//! database container joins its compose project. A database server that runs
//! as a process (or a container with no compose project) is used when exactly
//! one engine runs on a host where a project has a `.env`; with several
//! engines the choice is the user's, and they are listed as "Not in a project".
//!
//! The database name lives inside the `.env`, which discover never reads, so
//! a suggested database component names the engine, the `.env` and the
//! container, and leaves the database for the user.

mod names;

use std::collections::{BTreeMap, BTreeSet, HashSet};

use serde::{Deserialize, Serialize};

use self::names::{
    apex, base_name, first_label, is_public_domain, is_worker_name, local_proxy_port, parent,
    project_dir, related, slug,
};
use super::{
    ComposeProject, DbServer, DbSource, EnvFile, HostDiscovery, Pm2App, SetupRecord, Vhost,
};
use crate::domain::host::HostAlias;
use crate::domain::project::{Component, ComponentKind, DbEngine, Project, Role};

/// What kind of part a suggested component is. As [`ComponentKind`], but a
/// database may still lack its name.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum ProposedKind {
    Path {
        path: String,
    },
    Compose {
        project: String,
    },
    Pm2 {
        app: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pm2_home: Option<String>,
    },
    Db {
        engine: DbEngine,
        env_file: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        container: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ProposedComponent {
    pub role: Role,
    pub host: HostAlias,
    #[serde(flatten)]
    #[cfg_attr(feature = "ts", ts(flatten))]
    pub kind: ProposedKind,
}

/// A `.env` file found in a suggested project.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ProposedEnv {
    pub host: HostAlias,
    pub path: String,
    pub readable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ProposedProject {
    pub id: String,
    pub name: String,
    /// The public addresses of its server blocks.
    pub urls: Vec<String>,
    pub components: Vec<ProposedComponent>,
    /// Every `.env` that sits in it, the one a database component uses included.
    pub env_files: Vec<ProposedEnv>,
}

impl ProposedProject {
    /// The project as `projects.json` holds it. A database component needs
    /// the database name, which only the user knows: with `database` it is
    /// filled in for every database component, without it they are left out.
    /// Returns how many were left out.
    pub fn to_project(&self, database: Option<&str>) -> (Project, usize) {
        let mut components = Vec::new();
        let mut left_out = 0;
        for c in &self.components {
            let kind = match &c.kind {
                ProposedKind::Path { path } => ComponentKind::Path { path: path.clone() },
                ProposedKind::Compose { project } => ComponentKind::Compose {
                    project: project.clone(),
                },
                ProposedKind::Pm2 { app, pm2_home } => ComponentKind::Pm2 {
                    app: app.clone(),
                    pm2_home: pm2_home.clone(),
                },
                ProposedKind::Db {
                    engine,
                    env_file,
                    container,
                } => match database {
                    Some(name) => ComponentKind::Db {
                        engine: *engine,
                        database: name.to_owned(),
                        env_file: env_file.clone(),
                        container: container.clone(),
                    },
                    None => {
                        left_out += 1;
                        continue;
                    }
                },
            };
            components.push(Component {
                role: c.role,
                host: c.host.clone(),
                kind,
            });
        }
        let project = Project {
            id: self.id.clone(),
            name: self.name.clone(),
            color: None,
            urls: self.urls.clone(),
            components,
            overrides: Vec::new(),
        };
        (project, left_out)
    }
}

/// Something discover found that no suggested project owns.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Unassigned {
    pub host: HostAlias,
    /// A `vhost`, `compose`, `pm2`, `db` or `env` record.
    pub item: SetupRecord,
}

/// The suggestion: projects, and "Not in a project".
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Proposal {
    pub projects: Vec<ProposedProject>,
    pub unassigned: Vec<Unassigned>,
}

/// Groups what `hosts` found, in the order the user listed them.
pub fn group(hosts: &[(HostAlias, HostDiscovery)]) -> Proposal {
    Grouper::new(hosts).run()
}

#[derive(Clone, Copy)]
enum What<'a> {
    Vhost(&'a Vhost),
    Compose(&'a ComposeProject),
    Pm2(&'a Pm2App),
}

impl What<'_> {
    /// Order of kinds inside a host's components.
    fn rank(&self) -> u8 {
        match self {
            What::Vhost(_) => 0,
            What::Compose(_) => 1,
            What::Pm2(_) => 2,
        }
    }
}

struct Node<'a> {
    host: usize,
    what: What<'a>,
    /// Project folders it sits in (never a shared folder).
    dirs: Vec<String>,
    /// Registered domains of its public names.
    domains: BTreeSet<String>,
}

#[derive(Default)]
struct Members {
    nodes: Vec<usize>,
    /// Index into `envs`.
    envs: Vec<usize>,
    /// (host, index into that host's `dbs`) of database containers.
    dbs: Vec<(usize, usize)>,
}

struct Grouper<'a> {
    hosts: &'a [(HostAlias, HostDiscovery)],
    nodes: Vec<Node<'a>>,
    /// (host, env file, its project folder).
    envs: Vec<(usize, &'a EnvFile, Option<String>)>,
    parent: Vec<usize>,
}

impl<'a> Grouper<'a> {
    fn new(hosts: &'a [(HostAlias, HostDiscovery)]) -> Self {
        let mut nodes = Vec::new();
        let mut envs = Vec::new();
        for (h, (_, found)) in hosts.iter().enumerate() {
            for v in &found.vhosts {
                let mut dirs: Vec<String> = v.root.iter().filter_map(|r| project_dir(r)).collect();
                // The folder of whatever listens where the block proxies to.
                if let Some(port) = v.proxy.as_deref().and_then(local_proxy_port) {
                    dirs.extend(
                        found
                            .ports
                            .iter()
                            .filter(|p| p.port == port)
                            .filter_map(|p| p.cwd.as_deref().and_then(project_dir)),
                    );
                }
                let domains = v
                    .names
                    .iter()
                    .filter(|n| is_public_domain(n))
                    .map(|n| apex(n))
                    .collect();
                nodes.push(Node {
                    host: h,
                    what: What::Vhost(v),
                    dirs,
                    domains,
                });
            }
            for c in &found.compose {
                nodes.push(Node {
                    host: h,
                    what: What::Compose(c),
                    dirs: c.dir.iter().filter_map(|d| project_dir(d)).collect(),
                    domains: BTreeSet::new(),
                });
            }
            for a in &found.pm2 {
                nodes.push(Node {
                    host: h,
                    what: What::Pm2(a),
                    dirs: a.cwd.iter().filter_map(|d| project_dir(d)).collect(),
                    domains: BTreeSet::new(),
                });
            }
            for e in &found.envs {
                let dir = parent(&e.path).and_then(project_dir);
                envs.push((h, e, dir));
            }
        }
        let parent = (0..nodes.len()).collect();
        Self {
            hosts,
            nodes,
            envs,
            parent,
        }
    }

    fn find(&mut self, mut i: usize) -> usize {
        while self.parent[i] != i {
            self.parent[i] = self.parent[self.parent[i]];
            i = self.parent[i];
        }
        i
    }

    fn union(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra != rb {
            // The earlier node stays the root, so groups keep their order.
            self.parent[ra.max(rb)] = ra.min(rb);
        }
    }

    /// Whether a server block proxies to a port this compose project publishes.
    fn proxies_to(v: &Vhost, c: &ComposeProject) -> bool {
        v.proxy
            .as_deref()
            .and_then(local_proxy_port)
            .is_some_and(|p| c.ports.contains(&p))
    }

    fn link(&mut self) {
        for i in 0..self.nodes.len() {
            for j in (i + 1)..self.nodes.len() {
                let (a, b) = (&self.nodes[i], &self.nodes[j]);
                let same_host = a.host == b.host;
                let by_dir =
                    same_host && a.dirs.iter().any(|x| b.dirs.iter().any(|y| related(x, y)));
                let by_domain = a.domains.intersection(&b.domains).next().is_some();
                let by_port = same_host
                    && match (a.what, b.what) {
                        (What::Vhost(v), What::Compose(c)) | (What::Compose(c), What::Vhost(v)) => {
                            Self::proxies_to(v, c)
                        }
                        _ => false,
                    };
                if by_dir || by_domain || by_port {
                    self.union(i, j);
                }
            }
        }
    }

    /// Which group, by root node, owns `.env` number `e`: the one with a
    /// folder closest to the file's, on the same host. Folders of different
    /// groups never nest, so two groups are equally close only when the file
    /// sits above both (a monorepo's `.env`): it is then nobody's, and the
    /// user picks.
    fn env_owner(&mut self, e: usize) -> Option<usize> {
        let (host, _, dir) = &self.envs[e];
        let dir = dir.clone()?;
        let host = *host;
        let mut close: Vec<(usize, usize)> = Vec::new();
        for (i, n) in self.nodes.iter().enumerate() {
            if n.host != host {
                continue;
            }
            for d in n.dirs.iter().filter(|d| related(d, &dir)) {
                close.push((d.len().min(dir.len()), i));
            }
        }
        let best = close.iter().map(|(score, _)| *score).max()?;
        let owners: BTreeSet<usize> = close
            .into_iter()
            .filter(|(score, _)| *score == best)
            .map(|(_, i)| self.find(i))
            .collect();
        match owners.into_iter().collect::<Vec<_>>().as_slice() {
            [only] => Some(*only),
            _ => None,
        }
    }

    fn run(mut self) -> Proposal {
        self.link();
        let mut groups: BTreeMap<usize, Members> = BTreeMap::new();
        for i in 0..self.nodes.len() {
            let root = self.find(i);
            groups.entry(root).or_default().nodes.push(i);
        }
        for e in 0..self.envs.len() {
            if let Some(root) = self.env_owner(e) {
                groups.entry(root).or_default().envs.push(e);
            }
        }
        // A database container joins the compose project it belongs to.
        for (h, (_, found)) in self.hosts.iter().enumerate() {
            for (d, db) in found.dbs.iter().enumerate() {
                let Some(project) = &db.project else { continue };
                let owner = self.nodes.iter().position(
                    |n| matches!(n.what, What::Compose(c) if n.host == h && &c.project == project),
                );
                if let Some(i) = owner {
                    let root = self.find(i);
                    groups.entry(root).or_default().dbs.push((h, d));
                }
            }
        }

        let mut out = Proposal::default();
        let mut used_ids = BTreeSet::new();
        let mut owned_envs = BTreeSet::new();
        let mut used_dbs: BTreeSet<(usize, usize)> = BTreeSet::new();
        let mut rejected: Vec<usize> = Vec::new();
        for members in groups.values() {
            let has_domain = members
                .nodes
                .iter()
                .any(|&i| !self.nodes[i].domains.is_empty());
            let parts = members.nodes.len() + members.envs.len() + members.dbs.len();
            // Server blocks with no public name (`_`, `phpmyadmin`, an IP) are not
            // a project by themselves, however many there are; they need a
            // compose project, a pm2 app or a `.env` beside them.
            let only_nameless_blocks = members
                .nodes
                .iter()
                .all(|&i| matches!(self.nodes[i].what, What::Vhost(_)))
                && members.envs.is_empty();
            if !has_domain && (parts < 2 || only_nameless_blocks) {
                rejected.extend(&members.nodes);
                continue;
            }
            let project = self.build(members, &mut used_ids, &mut used_dbs);
            owned_envs.extend(members.envs.iter().copied());
            out.projects.push(project);
        }
        rejected.sort_unstable();
        for i in rejected {
            let n = &self.nodes[i];
            let item = match n.what {
                What::Vhost(v) => SetupRecord::Vhost(v.clone()),
                What::Compose(c) => SetupRecord::Compose(c.clone()),
                What::Pm2(a) => SetupRecord::Pm2(a.clone()),
            };
            out.unassigned.push(Unassigned {
                host: self.hosts[n.host].0.clone(),
                item,
            });
        }
        for (e, (h, env, _)) in self.envs.iter().enumerate() {
            if !owned_envs.contains(&e) {
                out.unassigned.push(Unassigned {
                    host: self.hosts[*h].0.clone(),
                    item: SetupRecord::Env((*env).clone()),
                });
            }
        }
        for (h, (alias, found)) in self.hosts.iter().enumerate() {
            for (d, db) in found.dbs.iter().enumerate() {
                if !used_dbs.contains(&(h, d)) {
                    out.unassigned.push(Unassigned {
                        host: alias.clone(),
                        item: SetupRecord::Db(db.clone()),
                    });
                }
            }
        }
        out
    }

    fn build(
        &self,
        m: &Members,
        used_ids: &mut BTreeSet<String>,
        used_dbs: &mut BTreeSet<(usize, usize)>,
    ) -> ProposedProject {
        let mut nodes = m.nodes.clone();
        nodes.sort_by_key(|&i| (self.nodes[i].host, self.nodes[i].what.rank(), i));
        let name = self.name_of(m);
        let mut id = slug(&name);
        let base = id.clone();
        let mut n = 1;
        while !used_ids.insert(id.clone()) {
            n += 1;
            id = format!("{base}-{n}");
        }
        let mut components: Vec<ProposedComponent> = Vec::new();
        let mut push = |c: ProposedComponent| {
            if !components.contains(&c) {
                components.push(c);
            }
        };
        for &i in &nodes {
            let node = &self.nodes[i];
            let host = self.hosts[node.host].0.clone();
            match node.what {
                What::Vhost(v) => {
                    // The block's own folder; a shared one (`/var/www/html`, `/`) is
                    // not a project folder, so the block is then a URL only, unless
                    // it proxies to a process that has a folder of its own.
                    let Some(path) = node.dirs.first().cloned() else {
                        continue;
                    };
                    let role = if v.php || v.root.is_none() {
                        Role::Be
                    } else {
                        Role::Fe
                    };
                    push(ProposedComponent {
                        role,
                        host,
                        kind: ProposedKind::Path { path },
                    });
                }
                What::Compose(c) => push(ProposedComponent {
                    role: Role::Be,
                    host,
                    kind: ProposedKind::Compose {
                        project: c.project.clone(),
                    },
                }),
                What::Pm2(a) => push(ProposedComponent {
                    role: if is_worker_name(&a.app) {
                        Role::Worker
                    } else {
                        Role::Be
                    },
                    host,
                    kind: ProposedKind::Pm2 {
                        app: a.app.clone(),
                        pm2_home: (!a.default).then(|| a.home.clone()),
                    },
                }),
            }
        }
        let env_files: Vec<ProposedEnv> = m
            .envs
            .iter()
            .map(|&e| {
                let (h, env, _) = &self.envs[e];
                ProposedEnv {
                    host: self.hosts[*h].0.clone(),
                    path: env.path.clone(),
                    readable: env.readable,
                }
            })
            .collect();
        self.databases(m, &mut push, used_dbs);
        ProposedProject {
            id,
            name,
            urls: self.urls_of(&nodes),
            components,
            env_files,
        }
    }

    /// The database components: on each host where the project has a `.env`,
    /// its own database containers, else the one engine the host runs.
    fn databases(
        &self,
        m: &Members,
        push: &mut impl FnMut(ProposedComponent),
        used_dbs: &mut BTreeSet<(usize, usize)>,
    ) {
        let hosts: BTreeSet<usize> = m.envs.iter().map(|&e| self.envs[e].0).collect();
        for h in hosts {
            let Some(env) = self.best_env(m, h) else {
                continue;
            };
            let found = &self.hosts[h].1;
            let own: Vec<usize> = m
                .dbs
                .iter()
                .filter(|(dh, _)| *dh == h)
                .map(|(_, d)| *d)
                .collect();
            let chosen: Vec<usize> = if own.is_empty() {
                // Host-level servers: a process, or a container with no compose
                // project here. One engine is an answer; several are not.
                let level: Vec<usize> = (0..found.dbs.len())
                    .filter(|&d| !self.in_a_group(h, d))
                    .collect();
                let engines: HashSet<DbEngine> =
                    level.iter().map(|&d| found.dbs[d].engine).collect();
                if engines.len() == 1 {
                    level
                } else {
                    Vec::new()
                }
            } else {
                own
            };
            // One component per engine and container (a process-run server twice
            // listed, as `mysqld` and `mariadbd`, is still one suggestion).
            let mut seen = HashSet::new();
            for d in chosen {
                let db: &DbServer = &found.dbs[d];
                let container = (db.origin == DbSource::Container).then(|| db.name.clone());
                used_dbs.insert((h, d));
                if !seen.insert((db.engine, container.clone())) {
                    continue;
                }
                push(ProposedComponent {
                    role: Role::Db,
                    host: self.hosts[h].0.clone(),
                    kind: ProposedKind::Db {
                        engine: db.engine,
                        env_file: env.path.clone(),
                        container,
                    },
                });
            }
        }
    }

    /// Whether database `d` of host `h` is a container of a compose project listed on that host.
    fn in_a_group(&self, h: usize, d: usize) -> bool {
        let db = &self.hosts[h].1.dbs[d];
        db.project.as_ref().is_some_and(|p| {
            self.nodes
                .iter()
                .any(|n| n.host == h && matches!(n.what, What::Compose(c) if &c.project == p))
        })
    }

    /// The `.env` a database component on host `h` reads: a readable one, then
    /// one named exactly `.env`, then the shortest path.
    fn best_env(&self, m: &Members, h: usize) -> Option<&'a EnvFile> {
        m.envs
            .iter()
            .map(|&e| &self.envs[e])
            .filter(|(eh, _, _)| *eh == h)
            .map(|(_, env, _)| *env)
            .min_by_key(|env| {
                (
                    !env.readable,
                    base_name(&env.path) != ".env",
                    env.path.len(),
                )
            })
    }

    fn name_of(&self, m: &Members) -> String {
        let mut count: BTreeMap<&str, usize> = BTreeMap::new();
        for &i in &m.nodes {
            for d in &self.nodes[i].domains {
                *count.entry(d).or_default() += 1;
            }
        }
        if let Some((domain, _)) = count
            .iter()
            .max_by(|a, b| a.1.cmp(b.1).then_with(|| b.0.cmp(a.0)))
        {
            return first_label(domain).to_owned();
        }
        for &i in &m.nodes {
            match self.nodes[i].what {
                What::Compose(c) => return c.project.clone(),
                What::Pm2(_) | What::Vhost(_) => {}
            }
        }
        for &i in &m.nodes {
            if let What::Pm2(a) = self.nodes[i].what {
                return a.app.clone();
            }
        }
        m.nodes
            .iter()
            .find_map(|&i| self.nodes[i].dirs.first())
            .or_else(|| m.envs.iter().find_map(|&e| self.envs[e].2.as_ref()))
            .map_or("project".to_owned(), |d| base_name(d).to_owned())
    }

    /// The public addresses of the group's server blocks: `https` when any
    /// block for the name has TLS, and `www.` left out when the bare name is there.
    fn urls_of(&self, nodes: &[usize]) -> Vec<String> {
        let mut names: Vec<(String, bool)> = Vec::new();
        for &i in nodes {
            let What::Vhost(v) = self.nodes[i].what else {
                continue;
            };
            for n in v.names.iter().filter(|n| is_public_domain(n)) {
                let n = n.to_ascii_lowercase();
                match names.iter_mut().find(|(x, _)| *x == n) {
                    Some((_, ssl)) => *ssl |= v.ssl,
                    None => names.push((n, v.ssl)),
                }
            }
        }
        let all: BTreeSet<String> = names.iter().map(|(n, _)| n.clone()).collect();
        names
            .into_iter()
            .filter(|(n, _)| {
                n.strip_prefix("www.")
                    .is_none_or(|rest| !all.contains(rest))
            })
            .map(|(n, ssl)| format!("{}://{n}", if ssl { "https" } else { "http" }))
            .collect()
    }
}

#[cfg(test)]
mod tests;
