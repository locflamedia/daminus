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
fn a_file_that_includes_itself_lists_what_it_leaves_out_once() {
    let rig = Rig::new(
        "\
Include config
Include other
Host *
    User deploy
Match host db-1
    User root
Host bare
    User nobody
",
    );
    rig.write(".ssh/other", "Include config\nInclude other\n");
    let list = rig.list();
    assert_eq!(
        skipped(&list),
        [
            ("*", SkipReason::Wildcard),
            ("Match host db-1", SkipReason::Match),
            ("bare", SkipReason::NoHostName),
        ]
    );
}

#[test]
fn a_host_name_before_the_first_host_applies_to_every_alias() {
    let rig = Rig::new("HostName shared.example.com\nHost a\n  User u\nHost b\n");
    let list = rig.list();
    assert_eq!(aliases(&list), ["a", "b"]);
    assert!(list.skipped.is_empty());
    // One inside a block still belongs to that block only.
    let rig = Rig::new("Host a\n  HostName a.example.com\nHost b\n");
    assert_eq!(aliases(&rig.list()), ["a"]);
}

#[test]
fn the_f_file_is_read_without_a_home_folder() {
    let s = ConfigSource::at(None, Some(Path::new("/tmp/hosts/ssh_config"))).unwrap();
    assert_eq!(s.file, PathBuf::from("/tmp/hosts/ssh_config"));
    assert_eq!(s.include_base, PathBuf::from("/tmp/hosts"));
    assert!(ConfigSource::at(None, None).is_none());
    let s = ConfigSource::at(Some("/Users/x".into()), None).unwrap();
    assert_eq!(s.file, PathBuf::from("/Users/x/.ssh/config"));
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
    let listing = resolve_listing(&tools, list).await;
    assert_eq!(listing.entries.len(), 1);
    assert_eq!(listing.entries[0].resolved.as_ref().unwrap().port, 2200);
    assert_eq!(listing.config_error, None);
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

/// What OpenSSH prints when it cannot read a config file, as captured from
/// `ssh -G` (OpenSSH 9.x and 10.x): the file and the line come back, the rest
/// of the message does not.
#[test]
fn a_bad_config_line_is_named_by_file_and_line() {
    let cases = [
        (
            "/u/.ssh/config line 11: Bad port '99999'.\n/u/.ssh/config: terminating, 1 bad configuration options\n",
            Some(11),
        ),
        (
            "/u/.ssh/config: line 10: Bad configuration option: hostname:\n/u/.ssh/config: terminating, 1 bad configuration options\n",
            Some(10),
        ),
        (
            "/u/.ssh/config line 7: unsupported option \"yesHost\".\n/u/.ssh/config: terminating, 1 bad configuration options\n",
            Some(7),
        ),
        (
            "/u/.ssh/config line 2: Deprecated option \"useroaming\"\n/u/.ssh/config line 9: Bad port '0'.\n/u/.ssh/config: terminating, 1 bad configuration options\n",
            Some(9),
        ),
        (
            "/u/.ssh/config: terminating, 1 bad configuration options\n",
            None,
        ),
        // Some errors stop ssh at once, with no "terminating" line.
        (
            "/u/.ssh/config line 3: bad port number in permitremoteopen\n",
            Some(3),
        ),
        (
            "Can't open user config file /u/.ssh/config: Permission denied\n",
            None,
        ),
    ];
    for (stderr, line) in cases {
        assert_eq!(
            ssh_config_problem(stderr),
            Some(ErrorCode::SshConfigInvalid {
                path: "/u/.ssh/config".into(),
                line,
            }),
            "{stderr}"
        );
    }
}

#[test]
fn other_ssh_messages_are_not_config_problems() {
    for stderr in [
        "",
        "Pseudo-terminal will not be allocated because stdin is not a terminal.\n",
        "ssh: Could not resolve hostname vps-a: nodename nor servname provided\n",
        "Warning: Permanently added '[203.0.113.10]:22' (ED25519) to the list of known hosts.\n",
    ] {
        assert_eq!(ssh_config_problem(stderr), None, "{stderr}");
    }
}

/// One bad line makes `ssh -G` refuse every host of the file, the good ones
/// too. The listing says which file and line, so the person can fix it.
#[tokio::test]
async fn a_bad_line_in_the_config_is_reported_with_the_listing() {
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

Host vps-b
    HostName 203.0.113.11
    Port 99999
",
    );
    let config = rig.dir.path().join(".ssh/config");
    let tools = SshTools::new()
        .with_config(&config)
        .with_env([("HOME", rig.dir.path().as_os_str())]);
    let list = list_hosts(&ConfigSource::for_tools(&tools).unwrap()).unwrap();
    let listing = resolve_listing(&tools, list).await;
    assert_eq!(listing.entries.len(), 2);
    assert!(listing.entries.iter().all(|e| e.resolved.is_none()));
    let problem = listing.config_error.expect("a config error");
    assert_eq!(
        problem.error.code,
        ErrorCode::SshConfigInvalid {
            path: config.to_string_lossy().into_owned(),
            line: Some(6),
        }
    );
    assert!(!problem.error.retryable);
    // The refused line with one line of context each side, nothing more.
    assert_eq!(
        problem.excerpt,
        vec![
            ConfigLine {
                number: 5,
                text: "    HostName 203.0.113.11".into()
            },
            ConfigLine {
                number: 6,
                text: "    Port 99999".into()
            },
        ]
    );
}

#[test]
fn the_excerpt_is_the_line_and_one_line_each_side() {
    let rig = Rig::new("a\nb\nc\nd\ne\n");
    let file = rig.dir.path().join(".ssh/config");
    let numbers = |line| {
        config_excerpt(&file, line)
            .into_iter()
            .map(|l| l.number)
            .collect::<Vec<_>>()
    };
    assert_eq!(numbers(3), vec![2, 3, 4]);
    assert_eq!(numbers(1), vec![1, 2]);
    assert_eq!(numbers(5), vec![4, 5]);
    assert_eq!(numbers(9), Vec::<u32>::new());
    assert_eq!(config_excerpt(&file, 2)[1].text, "b");
    // A long line is cut, never sent whole.
    rig.write(".ssh/config", &format!("{}\n", "x".repeat(5000)));
    assert!(config_excerpt(&file, 1)[0].text.chars().count() <= EXCERPT_LINE_CHARS);
    assert!(config_excerpt(&rig.dir.path().join("missing"), 1).is_empty());
}

#[tokio::test]
async fn a_good_config_has_no_config_error() {
    if std::process::Command::new("ssh")
        .arg("-V")
        .output()
        .is_err()
    {
        return;
    }
    let rig = Rig::new("Host vps-a\n    HostName 203.0.113.10\n");
    let tools = SshTools::new()
        .with_config(rig.dir.path().join(".ssh/config"))
        .with_env([("HOME", rig.dir.path().as_os_str())]);
    let list = list_hosts(&ConfigSource::for_tools(&tools).unwrap()).unwrap();
    let listing = resolve_listing(&tools, list).await;
    assert!(listing.entries[0].resolved.is_some());
    assert_eq!(listing.config_error, None);
}
