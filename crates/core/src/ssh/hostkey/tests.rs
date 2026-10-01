//! Real `ssh-keygen` on real keys in a temp folder; `ssh-keyscan` is a script
//! that prints a chosen key line, so nothing touches a network.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use tempfile::TempDir;

use super::*;

fn have_keygen() -> bool {
    std::process::Command::new("ssh-keygen")
        .arg("-?")
        .output()
        .is_ok()
}

/// A new key pair named `name`: its public key line and fingerprint.
fn make_key(dir: &Path, name: &str) -> (String, String) {
    let key = dir.join(name);
    let status = std::process::Command::new("ssh-keygen")
        .args(["-q", "-t", "ed25519", "-N", "", "-C", "test", "-f"])
        .arg(&key)
        .status()
        .unwrap();
    assert!(status.success());
    let public = std::fs::read_to_string(format!("{}.pub", key.display())).unwrap();
    let out = std::process::Command::new("ssh-keygen")
        .arg("-lf")
        .arg(format!("{}.pub", key.display()))
        .output()
        .unwrap();
    let fp = parse_keygen_all(&String::from_utf8_lossy(&out.stdout)).remove(0);
    (public.trim().to_owned(), fp)
}

struct Rig {
    dir: TempDir,
    known: PathBuf,
}

impl Rig {
    fn new() -> Self {
        let dir = TempDir::new().unwrap();
        let known = dir.path().join("known_hosts");
        std::fs::write(&known, "").unwrap();
        Self { dir, known }
    }

    fn record(&self, name: &str, public: &str) {
        let mut text = std::fs::read_to_string(&self.known).unwrap();
        text.push_str(&format!("{name} {public}\n"));
        std::fs::write(&self.known, text).unwrap();
    }

    /// A tools set whose `ssh-keyscan` prints `offered` (a public key line)
    /// for `host`, or fails when `None`, and leaves a marker file when run.
    fn tools(&self, offered: Option<(&str, &str)>) -> SshTools {
        let body = match offered {
            Some((host, key)) => {
                format!("echo '{host} {key}'; echo '# {host}:22 SSH-2.0-test' >&2")
            }
            None => "exit 1".to_owned(),
        };
        let scan = self.dir.path().join("fake-keyscan");
        std::fs::write(
            &scan,
            format!(
                "#!/bin/sh\ntouch '{}/scanned'\n{body}\n",
                self.dir.path().display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&scan, std::fs::Permissions::from_mode(0o755)).unwrap();
        SshTools::new().with_programs("ssh", "ssh-keygen", scan)
    }

    fn scanned(&self) -> bool {
        self.dir.path().join("scanned").exists()
    }

    fn host(&self) -> ResolvedHost {
        ResolvedHost {
            hostname: "vps-a.example.com".into(),
            user: Some("deploy".into()),
            port: 22,
            identity_files: Vec::new(),
            proxy_jump: None,
            proxy_command: false,
            known_hosts_files: vec![self.known.display().to_string()],
            host_key_alias: None,
        }
    }
}

#[tokio::test]
async fn an_unrecorded_host_shows_the_key_it_offers() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (public, fp) = make_key(rig.dir.path(), "server");
    let tools = rig.tools(Some(("vps-a.example.com", &public)));
    let info = check(&tools, &rig.host()).await;
    assert_eq!(info.state, HostKeyState::Unknown);
    assert_eq!(info.offered.as_deref(), Some(fp.as_str()));
    assert!(info.known.is_empty());
    // Looking never writes the known-hosts file.
    assert_eq!(std::fs::read_to_string(&rig.known).unwrap(), "");
}

#[tokio::test]
async fn a_recorded_key_that_the_host_offers_is_known() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (public, fp) = make_key(rig.dir.path(), "server");
    rig.record("vps-a.example.com", &public);
    let tools = rig.tools(Some(("vps-a.example.com", &public)));
    let info = check(&tools, &rig.host()).await;
    assert_eq!(info.state, HostKeyState::Known);
    assert_eq!(info.known, std::slice::from_ref(&fp));
    assert_eq!(info.offered.as_deref(), Some(fp.as_str()));
}

#[tokio::test]
async fn another_offered_key_means_the_key_changed() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (old_public, old_fp) = make_key(rig.dir.path(), "old");
    let (new_public, new_fp) = make_key(rig.dir.path(), "new");
    rig.record("vps-a.example.com", &old_public);
    let tools = rig.tools(Some(("vps-a.example.com", &new_public)));
    let info = check(&tools, &rig.host()).await;
    assert_eq!(info.state, HostKeyState::Changed);
    assert_eq!(info.known, [old_fp]);
    assert_eq!(info.offered.as_deref(), Some(new_fp.as_str()));
}

#[tokio::test]
async fn hashed_entries_are_found_too() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (public, fp) = make_key(rig.dir.path(), "server");
    rig.record("vps-a.example.com", &public);
    let hashed = std::process::Command::new("ssh-keygen")
        .args(["-H", "-f"])
        .arg(&rig.known)
        .output()
        .unwrap();
    assert!(hashed.status.success());
    assert!(
        std::fs::read_to_string(&rig.known)
            .unwrap()
            .starts_with("|1|")
    );
    let tools = rig.tools(None);
    let info = check(&tools, &rig.host()).await;
    // The host cannot be asked (the fake scan fails): what is recorded stands.
    assert_eq!(info.state, HostKeyState::Known);
    assert_eq!(info.known, [fp]);
    assert_eq!(info.offered, None);
}

#[tokio::test]
async fn a_port_other_than_22_is_filed_as_host_in_brackets() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (public, fp) = make_key(rig.dir.path(), "server");
    rig.record("[vps-a.example.com]:2222", &public);
    let mut host = rig.host();
    host.port = 2222;
    let info = check(&rig.tools(None), &host).await;
    assert_eq!(info.known, [fp]);
    // On the default port the same file has nothing for the host.
    host.port = 22;
    assert!(check(&rig.tools(None), &host).await.known.is_empty());
}

#[tokio::test]
async fn host_key_alias_replaces_the_host_name() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (public, fp) = make_key(rig.dir.path(), "server");
    rig.record("key-a", &public);
    let mut host = rig.host();
    host.host_key_alias = Some("key-a".into());
    let info = check(&rig.tools(None), &host).await;
    assert_eq!(info.known, [fp]);
}

#[tokio::test]
async fn a_host_key_alias_may_be_any_word() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (public, fp) = make_key(rig.dir.path(), "server");
    rig.record("prod@eu", &public);
    let mut host = rig.host();
    host.host_key_alias = Some("prod@eu".into());
    let info = check(&rig.tools(None), &host).await;
    assert_eq!(info.known, [fp]);
}

#[tokio::test]
async fn a_proxied_host_is_not_scanned_directly() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (public, _) = make_key(rig.dir.path(), "server");
    let mut host = rig.host();
    host.proxy_jump = Some("bastion".into());
    let tools = rig.tools(Some(("vps-a.example.com", &public)));
    let info = check(&tools, &host).await;
    assert_eq!(info.state, HostKeyState::Unknown);
    assert_eq!(info.offered, None);
    assert!(
        !rig.scanned(),
        "ssh-keyscan ignores ProxyJump; it must not run"
    );
}

#[tokio::test]
async fn a_host_name_that_could_be_an_option_is_never_passed_on() {
    if !have_keygen() {
        return;
    }
    let rig = Rig::new();
    let (public, _) = make_key(rig.dir.path(), "server");
    let mut host = rig.host();
    host.hostname = "-oProxyCommand=touch".into();
    let tools = rig.tools(Some(("x", &public)));
    let info = check(&tools, &host).await;
    assert_eq!(info.state, HostKeyState::Unknown);
    assert_eq!(info.offered, None);
    assert!(!rig.scanned());
}

#[test]
fn the_nicest_key_is_shown() {
    assert_eq!(
        preferred(vec![
            "RSA SHA256:r".into(),
            "ECDSA SHA256:e".into(),
            "ED25519 SHA256:d".into()
        ])
        .as_deref(),
        Some("ED25519 SHA256:d")
    );
    assert_eq!(
        preferred(vec!["RSA SHA256:r".into(), "ECDSA SHA256:e".into()]).as_deref(),
        Some("ECDSA SHA256:e")
    );
    assert_eq!(
        preferred(vec!["RSA SHA256:r".into()]).as_deref(),
        Some("RSA SHA256:r")
    );
    assert_eq!(preferred(vec![]), None);
}

#[test]
fn tilde_paths_expand_with_the_home_in_the_environment() {
    let tools = SshTools::new().with_env([("HOME", "/Users/someone")]);
    assert_eq!(
        expand(&tools, "~/.ssh/known_hosts"),
        Some(PathBuf::from("/Users/someone/.ssh/known_hosts"))
    );
    assert_eq!(
        expand(&tools, "/etc/ssh/known"),
        Some(PathBuf::from("/etc/ssh/known"))
    );
    assert_eq!(expand(&tools, "~/.ssh/%h"), None);
}
