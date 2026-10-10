use super::*;
use crate::discover::{Bind, ListenPort};

fn alias(s: &str) -> HostAlias {
    HostAlias::parse(s).unwrap()
}

fn vhost(names: &[&str], root: Option<&str>, proxy: Option<&str>, ssl: bool, php: bool) -> Vhost {
    Vhost {
        file: "/etc/nginx/sites-enabled/site".into(),
        names: names.iter().map(|n| (*n).to_owned()).collect(),
        root: root.map(str::to_owned),
        proxy: proxy.map(str::to_owned),
        ssl,
        php,
        listen: if ssl { vec![80, 443] } else { vec![80] },
    }
}

fn compose(project: &str, dir: &str, ports: &[u16]) -> ComposeProject {
    ComposeProject {
        project: project.into(),
        dir: Some(dir.into()),
        services: vec!["api".into()],
        running: 1,
        total: 1,
        ports: ports.to_vec(),
    }
}

fn pm2(app: &str, cwd: &str) -> Pm2App {
    Pm2App {
        app: app.into(),
        home: "/home/deploy/.pm2".into(),
        default: true,
        instances: 1,
        status: "online".into(),
        cwd: Some(cwd.into()),
    }
}

fn db(engine: DbEngine, origin: DbSource, name: &str, project: Option<&str>) -> DbServer {
    DbServer {
        engine,
        origin,
        name: name.into(),
        project: project.map(str::to_owned),
    }
}

fn env(path: &str) -> EnvFile {
    EnvFile {
        path: path.into(),
        readable: true,
    }
}

fn port(port: u16, bind: Bind, cwd: Option<&str>) -> ListenPort {
    ListenPort {
        port,
        bind,
        process: Some("node".into()),
        cwd: cwd.map(str::to_owned),
    }
}

fn found(f: impl FnOnce(&mut HostDiscovery)) -> HostDiscovery {
    let mut d = HostDiscovery::default();
    f(&mut d);
    d
}

fn comp(role: Role, host: &str, kind: ProposedKind) -> ProposedComponent {
    ProposedComponent {
        role,
        host: alias(host),
        kind,
    }
}

fn path(p: &str) -> ProposedKind {
    ProposedKind::Path { path: p.into() }
}

/// Five servers: a PHP shop with a host MySQL; a static front end and a cron
/// job; an API in compose with its Postgres container, plus a booking app;
/// the booking site's static front end; and a tools box with a default
/// server block, a monitor, a registry and a stray database container.
fn five_servers() -> Vec<(HostAlias, HostDiscovery)> {
    let hn3 = found(|d| {
        d.vhosts.push(vhost(
            &["khohang.vn", "www.khohang.vn"],
            Some("/var/www/khohang/public"),
            None,
            true,
            true,
        ));
        d.envs.push(env("/var/www/khohang/.env"));
        d.dbs
            .push(db(DbEngine::Mysql, DbSource::Process, "mysqld", None));
        d.ports.push(port(3306, Bind::Loopback, None));
    });
    let sg1 = found(|d| {
        d.vhosts.push(vhost(
            &["tiemtra.vn"],
            Some("/srv/tiemtra-web/dist"),
            None,
            true,
            false,
        ));
        d.pm2.push(pm2("tiemtra-cron", "/srv/tiemtra-web"));
    });
    let sg2 = found(|d| {
        d.vhosts.push(vhost(
            &["api.tiemtra.vn"],
            None,
            Some("127.0.0.1:8081"),
            true,
            false,
        ));
        d.compose
            .push(compose("tiemtra", "/srv/tiemtra-api", &[8081]));
        d.dbs.push(db(
            DbEngine::Postgres,
            DbSource::Container,
            "tiemtra-api-db-1",
            Some("tiemtra"),
        ));
        d.envs.push(env("/srv/tiemtra-api/.env"));
        d.vhosts.push(vhost(
            &["booking.vn"],
            Some("/srv/booking/public"),
            None,
            true,
            true,
        ));
        d.pm2.push(pm2("booking-queue", "/srv/booking"));
        d.envs.push(env("/srv/booking/.env"));
    });
    let sg3 = found(|d| {
        d.vhosts.push(vhost(
            &["booking.vn", "www.booking.vn"],
            Some("/var/www/booking-web"),
            None,
            false,
            false,
        ));
    });
    let tools = found(|d| {
        d.vhosts.push(vhost(
            &["_"],
            Some("/usr/share/nginx/html"),
            None,
            false,
            false,
        ));
        d.pm2.push(pm2("uptime-kuma", "/opt/uptime-kuma"));
        d.compose
            .push(compose("portainer", "/opt/portainer", &[9443]));
        d.dbs
            .push(db(DbEngine::Mysql, DbSource::Container, "legacy-db", None));
    });
    vec![
        (alias("vps-hn-3"), hn3),
        (alias("vps-sg-1"), sg1),
        (alias("vps-sg-2"), sg2),
        (alias("vps-sg-3"), sg3),
        (alias("vps-tools"), tools),
    ]
}

#[test]
fn five_servers_make_three_projects_and_the_rest_is_not_in_a_project() {
    let p = group(&five_servers());
    let ids: Vec<&str> = p.projects.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["khohang", "tiemtra", "booking"]);

    let kho = &p.projects[0];
    assert_eq!(kho.urls, ["https://khohang.vn"]);
    assert_eq!(
        kho.components,
        [
            comp(Role::Be, "vps-hn-3", path("/var/www/khohang")),
            comp(
                Role::Db,
                "vps-hn-3",
                ProposedKind::Db {
                    engine: DbEngine::Mysql,
                    env_file: "/var/www/khohang/.env".into(),
                    container: None,
                }
            ),
        ]
    );

    let tiemtra = &p.projects[1];
    assert_eq!(tiemtra.name, "tiemtra");
    assert_eq!(
        tiemtra.urls,
        ["https://tiemtra.vn", "https://api.tiemtra.vn"]
    );
    assert_eq!(
        tiemtra.components,
        [
            comp(Role::Fe, "vps-sg-1", path("/srv/tiemtra-web")),
            comp(
                Role::Worker,
                "vps-sg-1",
                ProposedKind::Pm2 {
                    app: "tiemtra-cron".into(),
                    pm2_home: None
                }
            ),
            comp(
                Role::Be,
                "vps-sg-2",
                ProposedKind::Compose {
                    project: "tiemtra".into()
                }
            ),
            comp(
                Role::Db,
                "vps-sg-2",
                ProposedKind::Db {
                    engine: DbEngine::Postgres,
                    env_file: "/srv/tiemtra-api/.env".into(),
                    container: Some("tiemtra-api-db-1".into()),
                }
            ),
        ]
    );
    assert_eq!(tiemtra.env_files.len(), 1);

    let booking = &p.projects[2];
    assert_eq!(booking.urls, ["https://booking.vn"]);
    assert_eq!(
        booking.components,
        [
            comp(Role::Be, "vps-sg-2", path("/srv/booking")),
            comp(
                Role::Worker,
                "vps-sg-2",
                ProposedKind::Pm2 {
                    app: "booking-queue".into(),
                    pm2_home: None
                }
            ),
            comp(Role::Fe, "vps-sg-3", path("/var/www/booking-web")),
        ]
    );
    assert_eq!(booking.env_files[0].path, "/srv/booking/.env");

    let rest: Vec<(String, &str)> = p
        .unassigned
        .iter()
        .map(|u| (u.host.to_string(), u.item.kind()))
        .collect();
    assert_eq!(
        rest,
        [
            ("vps-tools".to_owned(), "vhost"),
            ("vps-tools".to_owned(), "compose"),
            ("vps-tools".to_owned(), "pm2"),
            ("vps-tools".to_owned(), "db"),
        ]
    );
    // Every id is a valid project id for projects.json.
    for project in &p.projects {
        assert!(crate::domain::project::is_plain_name(&project.id));
    }
}

#[test]
fn grouping_does_not_depend_on_the_order_hosts_are_listed() {
    let mut hosts = five_servers();
    hosts.reverse();
    let p = group(&hosts);
    let mut ids: Vec<&str> = p.projects.iter().map(|p| p.id.as_str()).collect();
    ids.sort_unstable();
    assert_eq!(ids, ["booking", "khohang", "tiemtra"]);
    assert_eq!(p.unassigned.len(), 4);
}

#[test]
fn nothing_found_is_an_empty_proposal() {
    let p = group(&[(alias("vps-a"), HostDiscovery::default())]);
    assert_eq!(p, Proposal::default());
    assert_eq!(group(&[]), Proposal::default());
}

#[test]
fn a_proxy_joins_the_compose_project_that_publishes_its_port() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["shop-x.com"],
                None,
                Some("127.0.0.1:8081"),
                true,
                false,
            ));
            // A folder that says nothing about shop-x: only the port links them.
            d.compose.push(compose("stack", "/opt/stack-9", &[8081]));
            d.compose.push(compose("other", "/opt/other", &[9000]));
        }),
    )];
    let p = group(&hosts);
    assert_eq!(p.projects.len(), 1);
    let project = &p.projects[0];
    assert_eq!(project.name, "shop-x");
    assert_eq!(
        project.components,
        [comp(
            Role::Be,
            "vps-a",
            ProposedKind::Compose {
                project: "stack".into()
            }
        )]
    );
    // `other` is not linked to it and has nothing else: not in a project.
    assert_eq!(p.unassigned.len(), 1);
}

#[test]
fn a_proxy_joins_the_folder_of_the_process_listening_on_its_port() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["app.example.org"],
                None,
                Some("localhost:3000"),
                false,
                false,
            ));
            d.ports
                .push(port(3000, Bind::Loopback, Some("/srv/app/current")));
            d.pm2.push(pm2("app-server", "/srv/app"));
        }),
    )];
    let p = group(&hosts);
    assert_eq!(p.projects.len(), 1);
    assert_eq!(p.projects[0].name, "example");
    assert_eq!(p.projects[0].urls, ["http://app.example.org"]);
    // The block's code folder is the one the process runs in, and the app itself.
    assert_eq!(
        p.projects[0].components,
        [
            comp(Role::Be, "vps-a", path("/srv/app")),
            comp(
                Role::Be,
                "vps-a",
                ProposedKind::Pm2 {
                    app: "app-server".into(),
                    pm2_home: None
                }
            ),
        ]
    );
    assert!(p.unassigned.is_empty());
}

#[test]
fn a_proxy_only_block_gets_the_folder_of_its_process_even_with_nothing_else() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["app.example.org"],
                None,
                Some("127.0.0.1:3000"),
                true,
                false,
            ));
            d.ports
                .push(port(3000, Bind::Loopback, Some("/srv/app/current")));
        }),
    )];
    let p = group(&hosts);
    assert_eq!(p.projects.len(), 1);
    assert_eq!(
        p.projects[0].components,
        [comp(Role::Be, "vps-a", path("/srv/app"))]
    );
}

#[test]
fn a_block_on_a_shared_folder_is_a_url_and_never_a_folder_component() {
    for root in [
        "/var/www/html",
        "/usr/share/nginx/html",
        "/www/wwwroot",
        "/",
    ] {
        let hosts = vec![(
            alias("vps-a"),
            found(|d| {
                d.vhosts
                    .push(vhost(&["a.example.com"], Some(root), None, false, false));
            }),
        )];
        let p = group(&hosts);
        assert_eq!(p.projects.len(), 1, "{root}");
        assert_eq!(p.projects[0].urls, ["http://a.example.com"], "{root}");
        assert!(p.projects[0].components.is_empty(), "{root}");
    }
}

#[test]
fn an_env_above_two_apps_belongs_to_neither_and_one_inside_an_app_to_that_app() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["web.example.com"],
                Some("/srv/mono/front/public"),
                None,
                false,
                false,
            ));
            d.vhosts.push(vhost(
                &["api.other.org"],
                Some("/srv/mono/back/public"),
                None,
                false,
                false,
            ));
            // Above both apps: a tie between two groups.
            d.envs.push(env("/srv/mono/.env"));
            // Inside one of them.
            d.envs.push(env("/srv/mono/back/.env"));
        }),
    )];
    let p = group(&hosts);
    assert_eq!(p.projects.len(), 2);
    assert!(p.projects[0].env_files.is_empty());
    let api: Vec<&str> = p.projects[1]
        .env_files
        .iter()
        .map(|e| e.path.as_str())
        .collect();
    assert_eq!(api, ["/srv/mono/back/.env"]);
    let loose: Vec<&str> = p
        .unassigned
        .iter()
        .filter_map(|u| match &u.item {
            SetupRecord::Env(e) => Some(e.path.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(loose, ["/srv/mono/.env"]);
}

#[test]
fn shared_folders_link_nothing() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["a.example.com"],
                Some("/var/www/html"),
                None,
                false,
                false,
            ));
            d.vhosts.push(vhost(
                &["b.example.net"],
                Some("/var/www/html"),
                None,
                false,
                false,
            ));
            d.pm2.push(pm2("tool", "/var/www"));
            d.envs.push(env("/var/www/.env"));
        }),
    )];
    let p = group(&hosts);
    // Two domains, two projects; the pm2 app and the `.env` are nobody's.
    assert_eq!(p.projects.len(), 2);
    assert_eq!(p.projects[0].name, "example");
    assert_eq!(p.projects[1].name, "example");
    assert_eq!(p.projects[1].id, "example-2");
    let kinds: Vec<&str> = p.unassigned.iter().map(|u| u.item.kind()).collect();
    assert_eq!(kinds, ["pm2", "env"]);
}

#[test]
fn a_lone_app_is_not_a_project_but_an_app_with_its_env_is() {
    let lone = vec![(
        alias("vps-a"),
        found(|d| d.pm2.push(pm2("grafana-agent", "/opt/grafana-agent"))),
    )];
    let p = group(&lone);
    assert!(p.projects.is_empty());
    assert_eq!(p.unassigned.len(), 1);

    let with_env = vec![(
        alias("vps-a"),
        found(|d| {
            d.pm2.push(pm2("grafana-agent", "/opt/grafana-agent"));
            d.envs.push(env("/opt/grafana-agent/.env"));
        }),
    )];
    let p = group(&with_env);
    assert_eq!(p.projects.len(), 1);
    assert_eq!(p.projects[0].name, "grafana-agent");
    assert!(p.unassigned.is_empty());
}

#[test]
fn two_engines_on_a_host_leave_the_database_to_the_user() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["shop.example.com"],
                Some("/srv/shop/public"),
                None,
                true,
                true,
            ));
            d.envs.push(env("/srv/shop/.env"));
            d.dbs
                .push(db(DbEngine::Mysql, DbSource::Process, "mariadbd", None));
            d.dbs
                .push(db(DbEngine::Postgres, DbSource::Process, "postgres", None));
        }),
    )];
    let p = group(&hosts);
    assert_eq!(p.projects.len(), 1);
    assert_eq!(p.projects[0].components.len(), 1, "no database component");
    assert_eq!(p.unassigned.len(), 2);
    assert!(p.unassigned.iter().all(|u| u.item.kind() == "db"));
}

#[test]
fn the_database_component_uses_the_best_env_file() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["shop.example.com"],
                Some("/srv/shop/public"),
                None,
                true,
                true,
            ));
            d.envs.push(EnvFile {
                path: "/srv/shop/.env.production".into(),
                readable: true,
            });
            d.envs.push(EnvFile {
                path: "/srv/shop/.env".into(),
                readable: false,
            });
            d.envs.push(EnvFile {
                path: "/srv/shop/api/.env".into(),
                readable: true,
            });
            d.dbs
                .push(db(DbEngine::Mysql, DbSource::Process, "mysqld", None));
        }),
    )];
    let p = group(&hosts);
    let Some(ProposedComponent {
        kind: ProposedKind::Db { env_file, .. },
        ..
    }) = p.projects[0].components.last().cloned()
    else {
        panic!("no database component: {:?}", p.projects[0].components);
    };
    // A readable file beats an unreadable one (the database check could not
    // use it); then the plain `.env` beats `.env.production`; then the shortest path.
    assert_eq!(env_file, "/srv/shop/api/.env");
    assert_eq!(p.projects[0].env_files.len(), 3);
}

#[test]
fn urls_prefer_https_and_drop_www_when_the_bare_name_exists() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &[
                    "Shop.example.com",
                    "www.shop.example.com",
                    "*.shop.example.com",
                ],
                None,
                None,
                false,
                false,
            ));
            d.vhosts.push(vhost(
                &[
                    "shop.example.com",
                    "www.shop.example.com",
                    "admin.shop.example.com",
                ],
                Some("/srv/shop/public"),
                None,
                true,
                false,
            ));
            d.vhosts.push(vhost(
                &["www.solo.example.org"],
                Some("/srv/solo"),
                None,
                false,
                false,
            ));
        }),
    )];
    let p = group(&hosts);
    assert_eq!(
        p.projects[0].urls,
        ["https://shop.example.com", "https://admin.shop.example.com"]
    );
    assert_eq!(p.projects[1].urls, ["http://www.solo.example.org"]);
}

#[test]
fn pm2_apps_of_another_daemon_name_their_home() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["api.example.com"],
                Some("/srv/api/public"),
                None,
                true,
                false,
            ));
            let mut a = pm2("api-queue", "/srv/api");
            a.default = false;
            a.home = "/home/www/.pm2".into();
            d.pm2.push(a);
        }),
    )];
    let p = group(&hosts);
    assert!(p.projects[0].components.contains(&comp(
        Role::Worker,
        "vps-a",
        ProposedKind::Pm2 {
            app: "api-queue".into(),
            pm2_home: Some("/home/www/.pm2".into())
        }
    )));
}

#[test]
fn a_proposal_becomes_projects_json_with_or_without_the_database() {
    let p = group(&five_servers());
    let tiemtra = &p.projects[1];
    // Without a name the database is kept (the user added it), only not read yet.
    let (without, incomplete) = tiemtra.to_project(None);
    assert_eq!(incomplete, 1);
    assert_eq!(without.components.len(), 4);
    assert_eq!(without.urls, tiemtra.urls);
    assert!(matches!(
        without.components.last().map(|c| &c.kind),
        Some(ComponentKind::Db {
            database: None,
            env_file: Some(_),
            ..
        })
    ));

    let (with, incomplete) = tiemtra.to_project(Some("tiemtra"));
    assert_eq!(incomplete, 0);
    assert_eq!(with.components.len(), 4);
    let Some(ComponentKind::Db {
        engine,
        database,
        env_file,
        container,
    }) = with.components.last().map(|c| c.kind.clone())
    else {
        panic!("last component is not a database");
    };
    assert_eq!(engine, DbEngine::Postgres);
    assert_eq!(database.as_deref(), Some("tiemtra"));
    assert_eq!(env_file.as_deref(), Some("/srv/tiemtra-api/.env"));
    assert_eq!(container.as_deref(), Some("tiemtra-api-db-1"));
    // It round-trips through the file format, which re-checks every string.
    let file = crate::domain::project::ProjectsFile {
        projects: vec![with],
        ..Default::default()
    };
    let json = serde_json::to_string(&file).unwrap();
    assert_eq!(
        serde_json::from_str::<crate::domain::project::ProjectsFile>(&json).unwrap(),
        file
    );
}

#[test]
fn proposal_survives_json() {
    let p = group(&five_servers());
    let json = serde_json::to_string(&p).unwrap();
    assert_eq!(serde_json::from_str::<Proposal>(&json).unwrap(), p);
}

#[test]
fn an_aapanel_site_is_a_project_with_its_folder_and_env() {
    let hosts = vec![(
        alias("vps-a"),
        found(|d| {
            d.vhosts.push(vhost(
                &["shop.example"],
                Some("/www/wwwroot/shop.example/public"),
                None,
                false,
                true,
            ));
            d.envs.push(env("/www/wwwroot/shop.example/.env"));
            d.envs.push(env("/www/wwwroot/.env"));
        }),
    )];
    let p = group(&hosts);
    assert_eq!(p.projects.len(), 1);
    assert_eq!(p.projects[0].urls, ["http://shop.example"]);
    assert_eq!(
        p.projects[0].components,
        [comp(Role::Be, "vps-a", path("/www/wwwroot/shop.example"))]
    );
    // The `.env` of the site joins it; the one in the shared folder is nobody's.
    let loose: Vec<&str> = p.unassigned.iter().map(|u| u.item.kind()).collect();
    assert_eq!(loose, ["env"]);
}

#[test]
fn sites_under_one_public_suffix_are_separate_projects() {
    let host = found(|d| {
        d.vhosts.push(vhost(
            &["beru.io.vn"],
            Some("/www/wwwroot/beru.io.vn"),
            None,
            true,
            false,
        ));
        d.vhosts.push(vhost(
            &["robertnguyen.io.vn", "www.robertnguyen.io.vn"],
            Some("/www/wwwroot/robertnguyen.io.vn"),
            None,
            true,
            false,
        ));
        d.vhosts.push(vhost(
            &["api.beru.io.vn"],
            None,
            Some("127.0.0.1:3000"),
            true,
            false,
        ));
    });
    let p = group(&[(alias("vps-a"), host)]);
    let ids: Vec<&str> = p.projects.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["beru", "robertnguyen"]);
    assert_eq!(
        p.projects[0].urls,
        ["https://beru.io.vn", "https://api.beru.io.vn"]
    );
    assert_eq!(p.projects[1].urls, ["https://robertnguyen.io.vn"]);
}

#[test]
fn blocks_without_a_public_name_are_not_a_project_by_themselves() {
    // The aaPanel phpMyAdmin tool: two blocks on one folder, no public name.
    let host = found(|d| {
        d.vhosts.push(vhost(
            &["phpmyadmin"],
            Some("/www/server/phpmyadmin"),
            None,
            false,
            true,
        ));
        d.vhosts.push(vhost(
            &["_", "localhost", "203.0.113.5"],
            Some("/www/server/phpmyadmin"),
            None,
            false,
            true,
        ));
    });
    let p = group(&[(alias("vps-a"), host)]);
    assert!(p.projects.is_empty(), "{p:#?}");
    assert_eq!(p.unassigned.len(), 2);
    assert!(
        p.unassigned
            .iter()
            .all(|u| matches!(u.item, SetupRecord::Vhost(_)))
    );
}

#[test]
fn a_block_without_a_public_name_stays_with_its_compose_project() {
    let host = found(|d| {
        d.vhosts
            .push(vhost(&["_"], None, Some("127.0.0.1:8081"), false, false));
        d.compose.push(compose("api", "/srv/api", &[8081]));
    });
    let p = group(&[(alias("vps-a"), host)]);
    assert_eq!(p.projects.len(), 1, "{p:#?}");
    assert_eq!(p.projects[0].id, "api");
    assert!(p.unassigned.is_empty());
}
