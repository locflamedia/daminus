//! The real transport: the system `ssh`, one process group per run.
//!
//! Every argument is its own argv entry; nothing goes through a local shell.
//! The alias is a validated [`HostAlias`] after `--`, so it can never be read
//! as an option. The user's `~/.ssh/config` (ProxyJump, ControlMaster,
//! IdentityFile, agent) applies as in their terminal; only the options below
//! are forced.

use std::collections::HashSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use nix::sys::signal::{Signal, killpg};
use nix::unistd::Pid;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

use super::classify::{StderrClassifier, StderrVerdict};
use super::{BoxFuture, Failure, RunEnd, RunRequest, RunSignal, Transport};
use crate::domain::host::HostAlias;

/// How long authentication may sit between `Authenticating to` and
/// `Authenticated to` before the run reports an agent wait.
const AGENT_WAIT_AFTER: Duration = Duration::from_secs(2);

/// How long stdout and stderr may stay open after `ssh` itself exited.
const EXIT_DRAIN: Duration = Duration::from_secs(1);

/// Extra time the server-side `timeout` gives the bundle to exit after TERM.
const REMOTE_KILL_AFTER_S: u64 = 5;

/// Longest stderr line kept; the rest of an over-long line is skipped up to
/// the next newline. Stderr also carries the server's pre-auth banner, which
/// is untrusted input.
const STDERR_LINE_MAX: usize = 1024;

/// Options forced on every run, whatever `~/.ssh/config` says.
///
/// `StrictHostKeyChecking=yes` and `UpdateHostKeys=no` keep the app from ever
/// writing `known_hosts`: an unknown host is reported as `HostKeyUnknown`
/// even when the user's config says `accept-new` or `no`, and a successful
/// scan never adds the server's other keys. `LogLevel=VERBOSE` makes sure
/// errors are printed even with `LogLevel QUIET` in the user's config, and
/// adds the `Authenticating to` lines used to spot an agent waiting for
/// approval. Stderr never leaves this process.
const FORCED: &[&str] = &[
    "BatchMode=yes",
    "StrictHostKeyChecking=yes",
    "UpdateHostKeys=no",
    "ForwardAgent=no",
    "ForwardX11=no",
    "ClearAllForwardings=yes",
    "PermitLocalCommand=no",
    "RemoteCommand=none",
    "LogLevel=VERBOSE",
];

/// The system `ssh`.
#[derive(Debug, Clone)]
pub struct SshTransport {
    program: PathBuf,
    keygen: PathBuf,
    /// `ssh -F`; `None` reads the user's normal config.
    config: Option<PathBuf>,
    /// Process groups of runs still going.
    groups: Arc<Mutex<HashSet<i32>>>,
}

impl Default for SshTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl SshTransport {
    /// Uses `ssh` and `ssh-keygen` from `PATH` and the user's `~/.ssh/config`.
    pub fn new() -> Self {
        Self {
            program: PathBuf::from("ssh"),
            keygen: PathBuf::from("ssh-keygen"),
            config: None,
            groups: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Reads this config file instead of `~/.ssh/config` (dev CLI, tests).
    pub fn with_config(mut self, path: impl Into<PathBuf>) -> Self {
        self.config = Some(path.into());
        self
    }

    /// The `sh -c` program the server runs: the bundle under `timeout` when
    /// the server has it, so the budget also holds on the server.
    pub fn remote_command(budget: Duration) -> String {
        let secs = budget.as_secs().max(1);
        format!(
            "sh -c 'if command -v timeout >/dev/null 2>&1; then exec timeout -k {REMOTE_KILL_AFTER_S} {secs} sh -s; else exec sh -s; fi'"
        )
    }

    /// Uses these programs in place of `ssh` and `ssh-keygen` (tests).
    #[cfg(test)]
    pub(crate) fn with_programs(
        mut self,
        ssh: impl Into<PathBuf>,
        keygen: impl Into<PathBuf>,
    ) -> Self {
        self.program = ssh.into();
        self.keygen = keygen.into();
        self
    }

    /// The argv after the program name. `extra` options come first: for a
    /// `-o` given twice, ssh keeps the first value, so the fingerprint run can
    /// replace `StrictHostKeyChecking`.
    pub fn args(
        &self,
        host: &HostAlias,
        connect_timeout: Duration,
        extra: &[String],
        remote: &str,
    ) -> Vec<OsString> {
        let mut args: Vec<OsString> = vec!["-T".into()];
        if let Some(cfg) = &self.config {
            args.push("-F".into());
            args.push(cfg.clone().into_os_string());
        }
        let connect = format!("ConnectTimeout={}", connect_timeout.as_secs().max(1));
        for opt in extra
            .iter()
            .cloned()
            .chain(FORCED.iter().map(|s| (*s).to_owned()))
            .chain(std::iter::once(connect))
        {
            args.push("-o".into());
            args.push(opt.into());
        }
        args.push("--".into());
        args.push(host.as_str().into());
        args.push(remote.into());
        args
    }

    fn command(&self, args: &[OsString]) -> Command {
        let mut cmd = Command::new(&self.program);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .process_group(0);
        cmd
    }

    /// Spawns `ssh` in its own process group and registers the group so it
    /// is killed when the returned guard drops or on [`Transport::kill_all`].
    fn spawn(&self, args: &[OsString]) -> Option<(Child, GroupGuard)> {
        let child = match self.command(args).spawn() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(error = %e, "could not start ssh");
                return None;
            }
        };
        let pgid = child.id().and_then(|id| i32::try_from(id).ok())?;
        if let Ok(mut g) = self.groups.lock() {
            g.insert(pgid);
        }
        Some((
            child,
            GroupGuard {
                pgid,
                groups: Arc::clone(&self.groups),
            },
        ))
    }

    async fn run_inner(&self, req: &RunRequest, out: mpsc::Sender<RunSignal>) -> RunEnd {
        let remote = Self::remote_command(req.budget);
        let args = self.args(&req.host, req.connect_timeout, &[], &remote);
        tracing::debug!(argv = ?args, "ssh");
        let Some((mut child, _guard)) = self.spawn(&args) else {
            return RunEnd {
                exit: None,
                failure: Some(Failure::Spawn),
            };
        };
        let (Some(mut stdin), Some(mut stdout), Some(stderr)) =
            (child.stdin.take(), child.stdout.take(), child.stderr.take())
        else {
            return RunEnd {
                exit: None,
                failure: Some(Failure::Spawn),
            };
        };
        let script = req.script.clone();
        // stdin stays open until the run ends: the bundle reads end of file
        // as "the client went away" and stops (see `bundle::HANGUP_VAR`).
        // The task is aborted when the run ends or its future is dropped
        // (cancel, host budget), which closes stdin.
        let writer = AbortOnDrop(tokio::spawn(async move {
            // A host that fails early closes the pipe; that is not an error here.
            let _ = stdin.write_all(script.as_bytes()).await;
            let _ = stdin.flush().await;
            std::future::pending::<()>().await;
            drop(stdin);
        }));

        let mut classifier = StderrClassifier::new();
        let mut stderr = stderr;
        let mut err_lines = LineSplitter::new(STDERR_LINE_MAX);
        let mut ebuf = vec![0u8; 4 * 1024];
        let mut buf = vec![0u8; 16 * 1024];
        let mut stdout_open = true;
        let mut stderr_open = true;
        let mut got_stdout = false;
        let mut auth_since: Option<Instant> = None;
        let mut agent_wait_sent = false;
        let mut tick = tokio::time::interval(Duration::from_millis(250));
        let mut exit: Option<Option<i32>> = None;
        let mut drain_until: Option<Instant> = None;
        while stdout_open || stderr_open {
            tokio::select! {
                status = child.wait(), if exit.is_none() => {
                    exit = Some(status.ok().and_then(|s| s.code()));
                    // Pipes held open by a leftover child must not stall the run.
                    drain_until = Some(Instant::now() + EXIT_DRAIN);
                },
                read = stdout.read(&mut buf), if stdout_open => match read {
                    Ok(0) | Err(_) => stdout_open = false,
                    Ok(n) => {
                        got_stdout = true;
                        if out.send(RunSignal::Stdout(buf[..n].to_vec())).await.is_err() {
                            break;
                        }
                    }
                },
                read = stderr.read(&mut ebuf), if stderr_open => {
                    let lines: Vec<String> = match read {
                        Ok(0) | Err(_) => {
                            stderr_open = false;
                            err_lines.finish().into_iter().collect()
                        }
                        Ok(n) => err_lines.push(&ebuf[..n]),
                    };
                    for line in lines {
                        classifier.line(&line);
                    }
                    auth_since = match (classifier.authenticating(), auth_since) {
                        (true, None) => Some(Instant::now()),
                        (true, since) => since,
                        (false, _) => None,
                    };
                },
                _ = tick.tick() => {
                    if drain_until.is_some_and(|t| Instant::now() >= t) {
                        break;
                    }
                    let waiting = auth_since.is_some_and(|t| t.elapsed() >= AGENT_WAIT_AFTER);
                    if waiting && !got_stdout && !agent_wait_sent {
                        agent_wait_sent = true;
                        let _ = out.send(RunSignal::AgentWait).await;
                    }
                }
            }
        }
        drop(writer);
        let exit = match exit {
            Some(code) => code,
            None => child.wait().await.ok().and_then(|s| s.code()),
        };
        let verdict = classifier.verdict();
        tracing::debug!(?exit, ?verdict, "ssh exited");
        let failure = match verdict {
            Some(StderrVerdict::HostKeyUnknown) => Some(Failure::HostKeyUnknown {
                fp: self.fingerprint(req).await,
            }),
            Some(StderrVerdict::HostKeyChanged) => Some(Failure::HostKeyChanged {
                fp: self.fingerprint(req).await,
            }),
            Some(v) => Some(v.failure()),
            None if exit == Some(255) && !got_stdout => Some(Failure::Unreachable(
                crate::domain::snapshot::NetCause::Other,
            )),
            None => None,
        };
        RunEnd { exit, failure }
    }

    /// Reads the key the host offers without touching the real `known_hosts`:
    /// a second `ssh` through the same config (so ProxyJump still applies)
    /// with an empty temporary known-hosts file and `accept-new`, stopped
    /// before any key is offered (`PreferredAuthentications=none`), then
    /// `ssh-keygen -lf` on that file. The file is deleted afterwards.
    async fn fingerprint(&self, req: &RunRequest) -> Option<String> {
        let file = tempfile::Builder::new()
            .prefix("daminus-hostkey-")
            .tempfile()
            .ok()?;
        let path = file.path().to_str()?.to_owned();
        // ssh splits UserKnownHostsFile on spaces and expands `%` and `~`.
        if path
            .chars()
            .any(|c| c.is_whitespace() || c == '%' || c == '~')
        {
            return None;
        }
        let extra = [
            format!("UserKnownHostsFile={path}"),
            "GlobalKnownHostsFile=/dev/null".to_owned(),
            "KnownHostsCommand=none".to_owned(),
            "StrictHostKeyChecking=accept-new".to_owned(),
            "UpdateHostKeys=no".to_owned(),
            "HashKnownHosts=no".to_owned(),
            "CheckHostIP=no".to_owned(),
            "PreferredAuthentications=none".to_owned(),
        ];
        let args = self.args(&req.host, req.connect_timeout, &extra, "true");
        let (mut child, _guard) = self.spawn(&args)?;
        drop(child.stdin.take());
        let limit = req.connect_timeout + Duration::from_secs(10);
        let _ = tokio::time::timeout(limit, child.wait()).await;
        drop(_guard);
        fingerprint_of(&self.keygen, file.path()).await
    }
}

/// `ssh-keygen -lf <file>` → `ED25519 SHA256:…` for the first key in it.
async fn fingerprint_of(keygen: &Path, file: &Path) -> Option<String> {
    let out = Command::new(keygen)
        .arg("-lf")
        .arg(file)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .ok()?;
    parse_keygen(&String::from_utf8_lossy(&out.stdout))
}

/// Parses one `ssh-keygen -l` line: `256 SHA256:abc host (ED25519)`.
pub(crate) fn parse_keygen(text: &str) -> Option<String> {
    let line = text.lines().next()?;
    let mut parts = line.split_whitespace();
    let _bits = parts.next()?;
    let fp = parts.next()?;
    if !fp.starts_with("SHA256:") {
        return None;
    }
    let kind = line
        .rsplit_once('(')
        .and_then(|(_, k)| k.strip_suffix(')'))
        .filter(|k| k.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    Some(match kind {
        Some(k) => format!("{k} {fp}"),
        None => fp.to_owned(),
    })
}

/// Aborts a spawned task when dropped, so it never outlives its run.
struct AbortOnDrop(tokio::task::JoinHandle<()>);

impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// Splits raw stderr bytes into lines of at most `max` bytes, decoded
/// lossily, so a non-UTF-8 banner never stops the reading and an endless
/// line never grows memory.
struct LineSplitter {
    max: usize,
    cur: Vec<u8>,
    /// The current line passed `max`; bytes are dropped up to the newline.
    skipping: bool,
}

impl LineSplitter {
    fn new(max: usize) -> Self {
        Self {
            max,
            cur: Vec::new(),
            skipping: false,
        }
    }

    fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        let mut lines = Vec::new();
        for &b in bytes {
            if b == b'\n' {
                if !self.skipping {
                    lines.push(self.take());
                }
                self.skipping = false;
            } else if self.skipping {
            } else if self.cur.len() < self.max {
                self.cur.push(b);
            } else {
                // Classify the kept prefix now; the rest is dropped.
                lines.push(self.take());
                self.skipping = true;
            }
        }
        lines
    }

    fn take(&mut self) -> String {
        let line = String::from_utf8_lossy(&self.cur);
        let line = line.strip_suffix('\r').unwrap_or(&line).to_owned();
        self.cur.clear();
        line
    }

    /// The last line when stderr closed without a newline.
    fn finish(&mut self) -> Option<String> {
        (!self.cur.is_empty()).then(|| self.take())
    }
}

/// Kills a run's whole process group (ssh, a ProxyJump child, a
/// ControlMaster it started) when the run ends or is dropped.
struct GroupGuard {
    pgid: i32,
    groups: Arc<Mutex<HashSet<i32>>>,
}

impl Drop for GroupGuard {
    fn drop(&mut self) {
        if let Ok(mut g) = self.groups.lock() {
            g.remove(&self.pgid);
        }
        let _ = killpg(Pid::from_raw(self.pgid), Signal::SIGKILL);
    }
}

impl Transport for SshTransport {
    fn run<'a>(
        &'a self,
        req: &'a RunRequest,
        out: mpsc::Sender<RunSignal>,
    ) -> BoxFuture<'a, RunEnd> {
        Box::pin(self.run_inner(req, out))
    }

    fn kill_all(&self) {
        let groups: Vec<i32> = match self.groups.lock() {
            Ok(mut g) => g.drain().collect(),
            Err(_) => return,
        };
        for pgid in groups {
            let _ = killpg(Pid::from_raw(pgid), Signal::SIGKILL);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argv_has_forced_options_then_alias_after_double_dash() {
        let t = SshTransport::new();
        let host = HostAlias::parse("vps-a").unwrap();
        let remote = SshTransport::remote_command(Duration::from_secs(90));
        let args: Vec<String> = t
            .args(&host, Duration::from_secs(10), &[], &remote)
            .into_iter()
            .map(|a| a.into_string().unwrap())
            .collect();
        assert_eq!(args[0], "-T");
        for want in [
            "BatchMode=yes",
            "StrictHostKeyChecking=yes",
            "UpdateHostKeys=no",
            "ConnectTimeout=10",
            "ForwardAgent=no",
            "ForwardX11=no",
            "ClearAllForwardings=yes",
            "PermitLocalCommand=no",
            "RemoteCommand=none",
        ] {
            let i = args.iter().position(|a| a == want).unwrap();
            assert_eq!(args[i - 1], "-o", "{want}");
        }
        let dd = args.iter().position(|a| a == "--").unwrap();
        assert_eq!(&args[dd + 1..], ["vps-a", remote.as_str()]);
        assert_eq!(
            remote,
            "sh -c 'if command -v timeout >/dev/null 2>&1; then exec timeout -k 5 90 sh -s; else exec sh -s; fi'"
        );
    }

    #[test]
    fn extra_options_come_before_forced_ones() {
        let t = SshTransport::new();
        let host = HostAlias::parse("vps-a").unwrap();
        let extra = ["StrictHostKeyChecking=accept-new".to_owned()];
        let args: Vec<String> = t
            .args(&host, Duration::from_secs(10), &extra, "true")
            .into_iter()
            .map(|a| a.into_string().unwrap())
            .collect();
        let accept = args
            .iter()
            .position(|a| a == "StrictHostKeyChecking=accept-new");
        let strict = args.iter().position(|a| a == "StrictHostKeyChecking=yes");
        assert!(accept.unwrap() < strict.unwrap());
    }

    #[test]
    fn line_splitter_decodes_lossily_and_caps_length() {
        let mut s = LineSplitter::new(16);
        let mut lines = s.push(b"\xff\xfe banner\r\nPermission");
        lines.extend(s.push(b" denied (\n"));
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with('\u{fffd}'));
        assert!(lines[0].ends_with("banner"));
        assert_eq!(lines[1], "Permission denie");
        let long = vec![b'x'; 100_000];
        assert_eq!(s.push(&long), vec!["x".repeat(16)]);
        assert!(s.cur.is_empty());
        assert_eq!(s.push(b"more\nnext\nlast"), vec!["next".to_owned()]);
        assert_eq!(s.finish().as_deref(), Some("last"));
        assert_eq!(s.finish(), None);
    }

    #[tokio::test]
    async fn abort_on_drop_releases_the_task() {
        let held = Arc::new(());
        let inner = Arc::clone(&held);
        let guard = AbortOnDrop(tokio::spawn(async move {
            let _keep = inner;
            std::future::pending::<()>().await;
        }));
        tokio::task::yield_now().await;
        assert_eq!(Arc::strong_count(&held), 2);
        drop(guard);
        for _ in 0..50 {
            if Arc::strong_count(&held) == 1 {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("task still holds its state after the guard dropped");
    }

    /// A scripted stand-in for `ssh`/`ssh-keygen` in a temp dir.
    fn script(dir: &Path, name: &str, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    fn fake_ssh(body: &str, keygen: &str) -> (tempfile::TempDir, SshTransport) {
        let dir = tempfile::tempdir().unwrap();
        let ssh = script(dir.path(), "ssh", body);
        let kg = script(dir.path(), "ssh-keygen", keygen);
        (dir, SshTransport::new().with_programs(ssh, kg))
    }

    fn request() -> RunRequest {
        RunRequest {
            host: HostAlias::parse("vps-a").unwrap(),
            script: "echo hi\n".to_owned(),
            connect_timeout: Duration::from_secs(2),
            budget: Duration::from_secs(30),
        }
    }

    async fn run(t: &SshTransport) -> (RunEnd, Vec<RunSignal>) {
        let (tx, mut rx) = mpsc::channel(64);
        let req = request();
        let end = t.run(&req, tx).await;
        let mut signals = Vec::new();
        while let Ok(s) = rx.try_recv() {
            signals.push(s);
        }
        (end, signals)
    }

    #[tokio::test]
    async fn stdout_and_exit_code_come_through() {
        let (_d, t) = fake_ssh("cat >/dev/null & printf 'out\\n'; exit 0", "true");
        let (end, signals) = run(&t).await;
        assert_eq!(
            end,
            RunEnd {
                exit: Some(0),
                failure: None
            }
        );
        assert_eq!(signals, vec![RunSignal::Stdout(b"out\n".to_vec())]);
    }

    #[tokio::test]
    async fn exit_255_without_output_is_unreachable() {
        let (_d, t) = fake_ssh("exit 255", "true");
        let (end, _) = run(&t).await;
        assert_eq!(
            end.failure,
            Some(Failure::Unreachable(
                crate::domain::snapshot::NetCause::Other
            ))
        );
    }

    #[tokio::test]
    async fn stderr_verdict_wins_over_exit_code() {
        let (_d, t) = fake_ssh(
            "printf 'ssh: connect to host x port 22: Connection refused\\n' >&2; exit 0",
            "true",
        );
        let (end, _) = run(&t).await;
        assert_eq!(end.exit, Some(0));
        assert_eq!(
            end.failure,
            Some(Failure::Unreachable(
                crate::domain::snapshot::NetCause::Refused
            ))
        );
    }

    #[tokio::test]
    async fn non_utf8_banner_does_not_hide_an_auth_failure() {
        let (_d, t) = fake_ssh(
            "printf '\\377\\376 welcome \\351\\n' >&2; printf 'user@x: Permission denied (publickey).\\n' >&2; exit 255",
            "true",
        );
        let (end, _) = run(&t).await;
        assert_eq!(end.failure, Some(Failure::Auth));
    }

    #[tokio::test]
    async fn slow_authentication_reports_agent_wait_once() {
        let (_d, t) = fake_ssh(
            "printf 'Authenticating to x:22 as u\\n' >&2; sleep 3; printf 'Permission denied (publickey).\\n' >&2; exit 255",
            "true",
        );
        let (end, signals) = run(&t).await;
        assert_eq!(end.failure, Some(Failure::Auth));
        assert_eq!(signals, vec![RunSignal::AgentWait]);
    }

    #[tokio::test]
    async fn unknown_host_key_reruns_for_the_fingerprint() {
        let (_d, t) = fake_ssh(
            "printf 'Host key verification failed.\\n' >&2; exit 255",
            "echo '256 SHA256:abc vps-a (ED25519)'",
        );
        let (end, _) = run(&t).await;
        assert_eq!(
            end.failure,
            Some(Failure::HostKeyUnknown {
                fp: Some("ED25519 SHA256:abc".to_owned())
            })
        );
    }

    #[tokio::test]
    async fn dropping_the_run_kills_its_process_group() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("pid");
        let body = format!(
            "sleep 60 & echo $! > '{}'; printf 'started\\n'; wait",
            pidfile.display()
        );
        let (_d, t) = fake_ssh(&body, "true");
        let req = request();
        let (tx, mut rx) = mpsc::channel(64);
        {
            let fut = t.run(&req, tx);
            tokio::pin!(fut);
            tokio::select! {
                _ = &mut fut => panic!("run ended early"),
                s = rx.recv() => assert_eq!(s, Some(RunSignal::Stdout(b"started\n".to_vec()))),
            }
        }
        let pid: i32 = std::fs::read_to_string(&pidfile)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        for _ in 0..100 {
            if nix::sys::signal::kill(Pid::from_raw(pid), None).is_err() {
                assert!(t.groups.lock().unwrap().is_empty());
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("background process {pid} survived the dropped run");
    }

    #[test]
    fn keygen_lines_parse() {
        assert_eq!(
            parse_keygen("256 SHA256:Zm9vYmFy+/x vps-a (ED25519)\n").as_deref(),
            Some("ED25519 SHA256:Zm9vYmFy+/x")
        );
        assert_eq!(
            parse_keygen("3072 SHA256:abc [127.0.0.1]:2222 (RSA)").as_deref(),
            Some("RSA SHA256:abc")
        );
        assert_eq!(parse_keygen("/tmp/x is not a key file.\n"), None);
        assert_eq!(parse_keygen(""), None);
    }
}
