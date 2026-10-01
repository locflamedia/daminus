use serde_json::json;

use super::*;

fn parse(v: serde_json::Value) -> Option<SetupRecord> {
    serde_json::from_value::<SetupRecord>(v).ok()?.sanitize()
}

#[test]
fn every_kind_reads_from_its_wire_shape() {
    let cases = [
        json!({"rec": "login", "os": "Linux", "kernel": "6.8.0", "arch": "x86_64",
               "distro": "Ubuntu 24.04", "user": "deploy", "uid": 1000, "root": false,
               "docker_group": true, "adm_group": false, "journal_group": false,
               "docker": "ok", "gnu_find": true}),
        json!({"rec": "path", "path": "/srv/shop", "state": "readable"}),
        json!({"rec": "vhost", "file": "/etc/nginx/sites-enabled/shop",
               "names": ["shop-x.com", "*.shop-x.com"], "root": "/srv/shop/public",
               "proxy": "127.0.0.1:3000", "ssl": true, "php": false, "listen": [80, 443]}),
        json!({"rec": "compose", "project": "shop", "dir": "/srv/shop", "services": ["api"],
               "running": 1, "total": 2, "ports": [8081]}),
        json!({"rec": "pm2", "app": "queue", "home": "/home/deploy/.pm2", "default": true,
               "instances": 2, "status": "online", "cwd": "/srv/shop"}),
        json!({"rec": "pm2_home", "home": "/home/www/.pm2", "state": "needs_perm"}),
        json!({"rec": "db", "engine": "postgres", "origin": "container",
               "name": "shop-db-1", "project": "shop"}),
        json!({"rec": "env", "path": "/srv/shop/.env", "readable": true}),
        json!({"rec": "port", "port": 3000, "bind": "loopback", "proc": "node", "cwd": "/srv/shop"}),
        json!({"rec": "note", "code": "docker_no_permission"}),
        json!({"rec": "note", "code": "nginx_no_permission"}),
    ];
    for c in cases {
        let record = parse(c.clone()).unwrap_or_else(|| panic!("not accepted: {c}"));
        // What was read is what goes back out (a round trip through the wire shape).
        assert_eq!(serde_json::to_value(&record).unwrap(), c, "{c}");
    }
}

#[test]
fn names_and_paths_that_projects_json_would_refuse_drop_the_record() {
    for bad in [
        json!({"rec": "compose", "project": "-p evil", "services": [], "running": 0, "total": 0, "ports": []}),
        json!({"rec": "compose", "project": "a b", "services": [], "running": 0, "total": 0, "ports": []}),
        json!({"rec": "pm2", "app": "app;reboot", "home": "/h/.pm2", "default": true,
               "instances": 1, "status": "online"}),
        json!({"rec": "pm2", "app": "api", "home": "~/.pm2", "default": true,
               "instances": 1, "status": "online"}),
        json!({"rec": "path", "path": "relative", "state": "readable"}),
        json!({"rec": "env", "path": "srv/.env", "readable": true}),
        json!({"rec": "env", "path": "/srv/a\u{7}b/.env", "readable": true}),
        json!({"rec": "pm2_home", "home": "no-slash", "state": "needs_perm"}),
        json!({"rec": "db", "engine": "mysql", "origin": "container", "name": "$(id)"}),
        json!({"rec": "db", "engine": "mysql", "origin": "process", "name": "has space"}),
    ] {
        assert_eq!(parse(bad.clone()), None, "{bad}");
    }
    // Unknown kinds, engines and codes do not parse at all.
    for bad in [
        json!({"rec": "shell", "cmd": "id"}),
        json!({"rec": "db", "engine": "oracle", "origin": "process", "name": "x"}),
        json!({"rec": "note", "code": "something_else"}),
        json!({"rec": "port", "port": 70000, "bind": "any"}),
        json!({"rec": "port", "port": 80, "bind": "everywhere"}),
    ] {
        assert!(
            serde_json::from_value::<SetupRecord>(bad.clone()).is_err(),
            "{bad}"
        );
    }
}

#[test]
fn bad_parts_are_cut_out_and_the_rest_kept() {
    let Some(SetupRecord::Vhost(v)) = parse(json!({
        "rec": "vhost", "file": "relative", "names": ["ok.example.com", "bad name", "x;y", "*.ok.com", ""],
        "root": "not/absolute", "proxy": "with space", "ssl": false, "php": false, "listen": [80]
    })) else {
        panic!("vhost dropped");
    };
    assert_eq!(v.names, ["ok.example.com", "*.ok.com"]);
    assert_eq!(v.root, None);
    assert_eq!(v.proxy, None);
    assert_eq!(v.file, "");

    let Some(SetupRecord::Compose(c)) = parse(json!({
        "rec": "compose", "project": "shop", "dir": "rel", "services": ["api", "$bad", "db"],
        "running": 1, "total": 1, "ports": []
    })) else {
        panic!("compose dropped");
    };
    assert_eq!(c.dir, None);
    assert_eq!(c.services, ["api", "db"]);

    let Some(SetupRecord::Pm2(a)) = parse(json!({
        "rec": "pm2", "app": "api", "home": "/h/.pm2", "default": false,
        "instances": 1, "status": "<script>", "cwd": "rel"
    })) else {
        panic!("pm2 dropped");
    };
    assert_eq!(a.status, "unknown");
    assert_eq!(a.cwd, None);
}

#[test]
fn long_text_is_cut() {
    let long = "x".repeat(500);
    let Some(SetupRecord::Login(l)) = parse(json!({
        "rec": "login", "os": long, "kernel": "k", "arch": "a", "distro": long, "user": long,
        "uid": 0, "root": true, "docker_group": false, "adm_group": false,
        "journal_group": false, "docker": "missing", "gnu_find": false
    })) else {
        panic!("login dropped");
    };
    assert_eq!(l.os.len(), 120);
    assert_eq!(l.user.len(), 120);
    assert_eq!(l.docker, DockerAccess::Missing);
    // Multi-byte text is cut on a character, not a byte.
    let mut s = "é".repeat(200);
    cut(&mut s, 120);
    assert_eq!(s.chars().count(), 120);
}

#[test]
fn caps_and_kinds_are_defined_for_every_record() {
    let sample = parse(json!({"rec": "note", "code": "docker_stopped"})).unwrap();
    assert_eq!(sample.kind(), "note");
    assert_eq!(sample.cap(), 20);
    let login = parse(json!({"rec": "path", "path": "/a", "state": "missing"})).unwrap();
    assert_eq!((login.kind(), login.cap()), ("path", 100));
}
