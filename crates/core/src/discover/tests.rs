use super::*;
use crate::checks::bundle::BundleError;

#[test]
fn the_login_bundle_asks_about_the_given_folders() {
    let b = login_bundle(&["/srv/shop".into(), "/var/www/blog".into()], true).unwrap();
    assert!(
        b.text
            .contains("DAMINUS_PATHS='/srv/shop\n/var/www/blog'\n")
    );
    assert!(b.text.contains("DAMINUS_HANGUP='1'\n"));
    assert!(b.text.contains("c_login() (\n"));
    assert!(b.text.contains("\td_step login\n"));
    assert_eq!(b.checks, ["login"]);
    assert!(b.text.starts_with("exec 2>/dev/null\n"));
    // The hash does not depend on the folders, like a check bundle's.
    assert_eq!(b.hash, login_bundle(&[], true).unwrap().hash);
}

#[test]
fn folders_must_be_absolute_without_control_characters() {
    for bad in ["relative", "/srv/a\nb", "/srv/a\u{7}"] {
        assert_eq!(
            login_bundle(&[bad.into()], true).unwrap_err(),
            BundleError::BadPath(bad.into())
        );
    }
}

#[test]
fn the_discover_bundle_carries_the_skip_paths() {
    let scan = ScanSettings {
        skip_paths: vec!["/srv/big".into(), "cache".into()],
        ..ScanSettings::default()
    };
    let b = discover_bundle(&scan, true).unwrap();
    assert!(b.text.contains("DAMINUS_SKIP_PATHS='/srv/big\ncache'\n"));
    assert!(b.text.contains("c_discover() (\n"));
    assert_ne!(
        b.hash,
        login_bundle(&[], true).unwrap().hash,
        "each script has its own hash"
    );
}

#[test]
fn both_bundles_end_with_the_one_line_tail_that_runs_main_from_dev_null() {
    for b in [
        login_bundle(&[], true).unwrap(),
        discover_bundle(&ScanSettings::default(), true).unwrap(),
    ] {
        let last = b.text.lines().last().unwrap();
        assert!(
            last.starts_with("if [ \"${DAMINUS_HANGUP-}\" = 1 ]"),
            "{last}"
        );
        assert!(last.ends_with("exit 0"));
    }
}

#[test]
fn records_sort_into_their_hosts_lists() {
    let found = HostDiscovery::from_records([
        SetupRecord::Env(EnvFile {
            path: "/srv/a/.env".into(),
            readable: true,
        }),
        SetupRecord::Note(Note {
            code: NoteCode::DockerStopped,
        }),
        SetupRecord::Path(PathCheck {
            path: "/srv/a".into(),
            state: PathState::Readable,
        }),
    ]);
    assert_eq!(found.envs.len(), 1);
    assert_eq!(found.notes.len(), 1);
    assert!(!found.is_empty());
    assert!(HostDiscovery::default().is_empty());

    let login = LoginResult::from_records([SetupRecord::Path(PathCheck {
        path: "/srv/a".into(),
        state: PathState::Denied,
    })]);
    assert_eq!(login.login, None);
    assert_eq!(login.paths.len(), 1);
}

/// A database inside a container is found through its container; the host
/// also sees its processes, which must not be listed a second time.
#[test]
fn a_database_process_inside_a_container_is_not_listed_again_as_a_process() {
    let tmp = tempfile::tempdir().unwrap();
    let proc = tmp.path().join("proc");
    for (pid, comm, cgroup) in [
        (
            "100",
            "postgres",
            "0::/system.slice/docker-83ec0cf0c63e.scope",
        ),
        ("101", "postgres", "0::/kubepods/burstable/pod1/abc"),
        ("200", "mariadbd", "0::/system.slice/mariadb.service"),
    ] {
        let dir = proc.join(pid);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("comm"), format!("{comm}\n")).unwrap();
        std::fs::write(dir.join("cgroup"), format!("{cgroup}\n")).unwrap();
    }
    let b = discover_bundle(&ScanSettings::default(), false).unwrap();
    let mut child = std::process::Command::new("sh")
        .arg("-s")
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", tmp.path())
        .env("DAMINUS_PROC", &proc)
        .env("DAMINUS_NGINX_CONF", tmp.path().join("none.conf"))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    std::io::Write::write_all(child.stdin.as_mut().unwrap(), b.text.as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    let text = String::from_utf8_lossy(&out.stdout);
    let dbs: Vec<&str> = text
        .lines()
        .filter(|l| l.contains("\"rec\":\"db\"") && l.contains("\"origin\":\"process\""))
        .collect();
    assert_eq!(dbs.len(), 1, "{dbs:?}");
    assert!(dbs[0].contains("\"engine\":\"mysql\""), "{dbs:?}");
}
