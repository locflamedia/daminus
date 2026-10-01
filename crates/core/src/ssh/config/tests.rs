use std::fs;

use tempfile::TempDir;

use super::*;

/// A temp "home" with `.ssh/` and a config file written from `text`.
struct Rig {
    dir: TempDir,
}

impl Rig {
    fn new(config: &str) -> Self {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join(".ssh")).unwrap();
        let rig = Self { dir };
        rig.write(".ssh/config", config);
        rig
    }

    fn write(&self, rel: &str, text: &str) {
        let path = self.dir.path().join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    fn source(&self) -> ConfigSource {
        ConfigSource {
            file: self.dir.path().join(".ssh/config"),
            include_base: self.dir.path().join(".ssh"),
            home: self.dir.path().to_path_buf(),
        }
    }

    fn list(&self) -> HostList {
        list_hosts(&self.source()).unwrap()
    }
}

fn aliases(list: &HostList) -> Vec<&str> {
    list.hosts.iter().map(|h| h.alias.as_str()).collect()
}

fn skipped(list: &HostList) -> Vec<(&str, SkipReason)> {
    list.skipped
        .iter()
        .map(|s| (s.pattern.as_str(), s.reason))
        .collect()
}

#[test]
fn lists_hosts_and_says_why_the_others_are_left_out() {
    let rig = Rig::new(
        "\
# my servers
Host vps-a vps-a-alt
    HostName 203.0.113.10
    User deploy

Host web-*
    HostName %h.example.com

Host *
    ServerAliveInterval 30

Host bare
    User nobody

Host !denied other-*
    Port 2222

Match host db-1 exec \"true\"
    HostName 203.0.113.99

Host user@bad
    HostName x.example.com

Host vps-b # the second one
    HostName vps-b.example.com
",
    );
    let list = rig.list();
    assert!(list.config_found);
    assert_eq!(list.empty, None);
    // vps-a-alt shares vps-a's block, so it has the HostName too.
    assert_eq!(aliases(&list), ["vps-a", "vps-a-alt", "vps-b"]);
    assert_eq!(
        skipped(&list),
        [
            ("web-*", SkipReason::Wildcard),
            ("*", SkipReason::Wildcard),
            ("bare", SkipReason::NoHostName),
            ("!denied", SkipReason::Wildcard),
            ("other-*", SkipReason::Wildcard),
            ("Match host db-1 exec true", SkipReason::Match),
            ("user@bad", SkipReason::InvalidAlias),
        ]
    );
    assert_eq!(list.hosts[0].line, 2);
    assert!(list.hosts[0].file.ends_with(".ssh/config"));
}

#[test]
fn a_pattern_block_can_supply_the_host_name() {
    let rig = Rig::new(
        "\
Host web-1 db-1 cache
Host web-*
    HostName %h.example.com
Host db-*
    User admin
",
    );
    // web-1 gets its HostName from `Host web-*`; db-1 and cache have none.
    let list = rig.list();
    assert_eq!(aliases(&list), ["web-1"]);
    assert_eq!(
        skipped(&list)
            .iter()
            .filter(|(_, r)| *r == SkipReason::NoHostName)
            .map(|(p, _)| *p)
            .collect::<Vec<_>>(),
        ["db-1", "cache"]
    );
}

#[test]
fn a_negated_pattern_keeps_a_host_out_of_a_block() {
    let rig = Rig::new(
        "\
Host a b
Host * !b
    HostName shared.example.com
",
    );
    assert_eq!(aliases(&rig.list()), ["a"]);
}

#[test]
fn keywords_may_use_equals_quotes_and_any_case() {
    let rig = Rig::new(
        "\
HOST=eq
    hostname=eq.example.com
Host \"quoted\"
    HostName quoted.example.com
  host   spaced
  HostName    spaced.example.com
",
    );
    assert_eq!(aliases(&rig.list()), ["eq", "quoted", "spaced"]);
}

#[test]
fn includes_are_followed_relative_absolute_and_by_pattern() {
    let rig = Rig::new(
        "\
Include conf.d/*.conf
Include ~/more/extra
Include missing/*
Host top
    HostName top.example.com
",
    );
    rig.write(
        ".ssh/conf.d/10-a.conf",
        "Host inc-a\n  HostName a.example.com\n",
    );
    rig.write(
        ".ssh/conf.d/20-b.conf",
        "Host inc-b\n  HostName b.example.com\n  Include nested\n",
    );
    rig.write(".ssh/conf.d/skip.txt", "Host not-included\n HostName x\n");
    rig.write(".ssh/nested", "Host nested\n  HostName n.example.com\n");
    rig.write("more/extra", "Host extra\n  HostName e.example.com\n");
    let list = rig.list();
    assert_eq!(aliases(&list), ["inc-a", "inc-b", "nested", "extra", "top"]);
    assert!(list.hosts[0].file.ends_with("10-a.conf"));
    assert!(list.hosts[2].file.ends_with("nested"));
}

#[test]
fn an_include_that_includes_itself_stops() {
    let rig = Rig::new("Include config\nHost loop\n  HostName l.example.com\n");
    let list = rig.list();
    assert_eq!(aliases(&list), ["loop"]);
}

#[test]
fn a_block_opened_in_an_included_file_does_not_leak_out() {
    let rig = Rig::new(
        "\
Host outer
    Include part
    HostName outer.example.com
Host later
",
    );
    // `part` opens `Host inner` without a HostName; the HostName after the
    // Include still belongs to `outer`, not to `inner`.
    rig.write(".ssh/part", "Host inner\n  User u\n");
    let list = rig.list();
    assert_eq!(aliases(&list), ["outer"]);
    assert_eq!(
        skipped(&list),
        [
            ("inner", SkipReason::NoHostName),
            ("later", SkipReason::NoHostName)
        ]
    );
}

#[test]
fn a_host_defined_twice_is_listed_once() {
    let rig = Rig::new("Host a\n HostName a1\nHost a\n HostName a2\n");
    let list = rig.list();
    assert_eq!(aliases(&list), ["a"]);
    assert_eq!(list.hosts[0].line, 1);
}

#[test]
fn no_config_file_is_the_empty_state() {
    let dir = TempDir::new().unwrap();
    let source = ConfigSource {
        file: dir.path().join(".ssh/config"),
        include_base: dir.path().join(".ssh"),
        home: dir.path().to_path_buf(),
    };
    let list = list_hosts(&source).unwrap();
    assert!(!list.config_found);
    assert!(list.hosts.is_empty());
    assert_eq!(list.empty, Some(EmptyReason::NoConfig));
}

#[test]
fn a_config_without_usable_hosts_is_the_empty_state() {
    let rig = Rig::new("Host *\n  ServerAliveInterval 30\nMatch all\n  User x\n");
    let list = rig.list();
    assert!(list.config_found);
    assert_eq!(list.empty, Some(EmptyReason::NoUsableHosts));
    assert_eq!(
        skipped(&list),
        [
            ("*", SkipReason::Wildcard),
            ("Match all", SkipReason::Match)
        ]
    );
    // Reading again after the user adds a host (the "read again" button).
    rig.write(".ssh/config", "Host new\n  HostName n.example.com\n");
    assert_eq!(aliases(&rig.list()), ["new"]);
    assert_eq!(rig.list().empty, None);
}

#[test]
fn an_unreadable_config_is_an_io_error_not_the_empty_state() {
    let dir = TempDir::new().unwrap();
    // A directory where the file should be: read_to_string fails, not NotFound.
    fs::create_dir_all(dir.path().join(".ssh/config")).unwrap();
    let source = ConfigSource {
        file: dir.path().join(".ssh/config"),
        include_base: dir.path().join(".ssh"),
        home: dir.path().to_path_buf(),
    };
    let err = list_hosts(&source).unwrap_err();
    assert!(matches!(err.code, ErrorCode::Io { .. }));
}

#[test]
fn glob_matching_covers_star_question_and_case() {
    for (pat, text, fold, want) in [
        ("*", "anything", true, true),
        ("web-*", "web-1", true, true),
        ("web-*", "db-1", true, false),
        ("web-?", "web-12", true, false),
        ("*.example.com", "a.b.example.com", true, true),
        ("A*", "abc", true, true),
        ("A*", "abc", false, false),
        ("a*b*c", "aXXbYYc", true, true),
        ("a*b*c", "aXXbYY", true, false),
        ("", "", true, true),
    ] {
        assert_eq!(glob_match(pat, text, fold), want, "{pat} vs {text}");
    }
}

#[test]
fn ssh_g_output_is_read_into_the_resolved_host() {
    let r = ResolvedHost::parse(
        "\
user deploy
hostname 203.0.113.10
port 2222
identityfile ~/.ssh/id_ed25519
identityfile ~/.ssh/id_rsa
proxyjump bastion
userknownhostsfile ~/.ssh/known_hosts ~/.ssh/known_hosts2
globalknownhostsfile /etc/ssh/ssh_known_hosts
hostkeyalias vps-a-key
proxycommand none
",
    )
    .unwrap();
    assert_eq!(r.hostname, "203.0.113.10");
    assert_eq!(r.user.as_deref(), Some("deploy"));
    assert_eq!(r.port, 2222);
    assert_eq!(r.identity_files.len(), 2);
    assert_eq!(r.proxy_jump.as_deref(), Some("bastion"));
    assert!(!r.proxy_command);
    assert!(r.proxied());
    assert_eq!(
        r.known_hosts_files,
        [
            "~/.ssh/known_hosts",
            "~/.ssh/known_hosts2",
            "/etc/ssh/ssh_known_hosts"
        ]
    );
    assert_eq!(r.host_key_alias.as_deref(), Some("vps-a-key"));
    assert_eq!(ResolvedHost::parse("port 22\n"), None);
}

/// The real `ssh -G` on a temp config: the same rules as a connection, no network.
#[tokio::test]
async fn resolve_asks_the_real_ssh() {
    if std::process::Command::new("ssh")
        .arg("-V")
        .output()
        .is_err()
    {
        return;
    }
    let rig = Rig::new(
        "\
Host vps-a
    HostName 203.0.113.10
    User deploy
    Port 2200
    ProxyJump jump.example.com
    HostKeyAlias key-a
    UserKnownHostsFile /tmp/daminus-test-known-hosts
",
    );
    let tools = SshTools::new()
        .with_config(rig.dir.path().join(".ssh/config"))
        .with_env([("HOME", rig.dir.path().as_os_str())]);
    let alias = HostAlias::parse("vps-a").unwrap();
    let r = resolve(&tools, &alias).await.unwrap();
    assert_eq!(r.hostname, "203.0.113.10");
    assert_eq!(r.user.as_deref(), Some("deploy"));
    assert_eq!(r.port, 2200);
    assert_eq!(r.proxy_jump.as_deref(), Some("jump.example.com"));
    assert_eq!(r.host_key_alias.as_deref(), Some("key-a"));
    assert_eq!(r.known_hosts_files[0], "/tmp/daminus-test-known-hosts");

    let list = list_hosts(&ConfigSource::for_tools(&tools).unwrap()).unwrap();
    let entries = resolve_all(&tools, &list).await;
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].resolved.as_ref().unwrap().port, 2200);
}

#[test]
fn the_default_source_is_the_users_ssh_folder() {
    let tools = SshTools::new().with_env([("HOME", "/Users/someone")]);
    let s = ConfigSource::for_tools(&tools).unwrap();
    assert_eq!(s.file, PathBuf::from("/Users/someone/.ssh/config"));
    assert_eq!(s.include_base, PathBuf::from("/Users/someone/.ssh"));
    let with_f = tools.with_config("/tmp/test-hosts/ssh_config");
    let s = ConfigSource::for_tools(&with_f).unwrap();
    assert_eq!(s.file, PathBuf::from("/tmp/test-hosts/ssh_config"));
    assert_eq!(s.include_base, PathBuf::from("/Users/someone/.ssh"));
}
