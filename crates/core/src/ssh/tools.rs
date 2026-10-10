//! The OpenSSH programs and how they are started: which `ssh` and
//! `ssh-keygen` / `ssh-keyscan`, which config file, which environment. The
//! transport, the config reader and the host key lookup all start their
//! processes here, so a GUI app's login-shell `PATH` and `SSH_AUTH_SOCK`
//! apply to every one of them.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use nix::sys::signal::{Signal, killpg};
use nix::unistd::Pid;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

/// Most stdout read from a helper program; the rest is dropped.
const MAX_CAPTURE: usize = 256 * 1024;

/// What a finished helper program printed.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Captured {
    pub stdout: String,
    /// Exit code, `None` when a signal ended it.
    pub code: Option<i32>,
}

impl Captured {
    pub fn ok(&self) -> bool {
        self.code == Some(0)
    }
}

/// Kills a process group when dropped: whatever the program started (a
/// ProxyCommand, a `Match exec`) goes with it. Only held while the program's
/// group leader has not been waited on, so the id is still its own.
struct KillGroup(Option<i32>);

impl Drop for KillGroup {
    fn drop(&mut self) {
        if let Some(pgid) = self.0 {
            let _ = killpg(Pid::from_raw(pgid), Signal::SIGKILL);
        }
    }
}

/// Where the OpenSSH programs are and how to start them.
#[derive(Debug, Clone)]
pub struct SshTools {
    pub(crate) ssh: PathBuf,
    pub(crate) keygen: PathBuf,
    pub(crate) keyscan: PathBuf,
    pub(crate) ssh_add: PathBuf,
    /// `ssh -F`; `None` reads the user's normal config.
    pub(crate) config: Option<PathBuf>,
    /// Variables set on every process (a GUI app's login-shell `PATH`,
    /// `SSH_AUTH_SOCK`, `HOME`); the rest is inherited.
    pub(crate) env: Vec<(OsString, OsString)>,
}

impl Default for SshTools {
    fn default() -> Self {
        Self::new()
    }
}

impl SshTools {
    /// Uses `ssh`, `ssh-keygen` and `ssh-keyscan` from `PATH` and the user's `~/.ssh/config`.
    pub fn new() -> Self {
        Self {
            ssh: PathBuf::from("ssh"),
            keygen: PathBuf::from("ssh-keygen"),
            keyscan: PathBuf::from("ssh-keyscan"),
            ssh_add: PathBuf::from("ssh-add"),
            config: None,
            env: Vec::new(),
        }
    }

    /// Reads this config file instead of `~/.ssh/config` (dev CLI, tests).
    pub fn with_config(mut self, path: impl Into<PathBuf>) -> Self {
        self.config = Some(path.into());
        self
    }

    /// Sets these variables on every process. A `PATH` here is also where the
    /// programs are looked up.
    pub fn with_env<K, V>(mut self, vars: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Into<OsString>,
        V: Into<OsString>,
    {
        self.env = vars
            .into_iter()
            .map(|(k, v)| (k.into(), v.into()))
            .collect();
        self
    }

    /// Uses these programs in place of the real ones (tests).
    #[cfg(test)]
    pub(crate) fn with_programs(
        mut self,
        ssh: impl Into<PathBuf>,
        keygen: impl Into<PathBuf>,
        keyscan: impl Into<PathBuf>,
    ) -> Self {
        self.ssh = ssh.into();
        self.keygen = keygen.into();
        self.keyscan = keyscan.into();
        self
    }

    /// `ssh-add`, which asks the agent what it holds.
    pub(crate) fn ssh_add(&self) -> &Path {
        &self.ssh_add
    }

    /// The home folder: `HOME` as set here or in this process.
    pub(crate) fn home(&self) -> Option<PathBuf> {
        self.var("HOME").map(PathBuf::from)
    }

    /// The config file given with `-F`, if any.
    pub fn config(&self) -> Option<&Path> {
        self.config.as_deref()
    }

    /// What `ssh -V` prints (OpenSSH writes it to stderr), first line only.
    /// `None` when `ssh` is not found or does not answer within `limit`.
    pub(crate) async fn ssh_version(&self, limit: Duration) -> Option<String> {
        let mut cmd = self.command(&self.ssh);
        cmd.arg("-V")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let out = tokio::time::timeout(limit, cmd.output()).await.ok()?.ok()?;
        let text = [out.stderr, out.stdout]
            .into_iter()
            .map(|b| String::from_utf8_lossy(&b).trim().to_owned())
            .find(|t| !t.is_empty())?;
        text.lines().next().map(str::to_owned)
    }

    /// The value of `name` in the variables set here, else in this process.
    pub(crate) fn var(&self, name: &str) -> Option<OsString> {
        self.env
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.clone())
            .or_else(|| std::env::var_os(name))
    }

    /// A command for `program` with the environment applied, in its own
    /// process group (so a timeout can stop whatever it started).
    pub(crate) fn command(&self, program: &Path) -> Command {
        let mut cmd = Command::new(program);
        cmd.envs(self.env.iter().map(|(k, v)| (k, v)))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .process_group(0);
        cmd
    }

    /// Runs `cmd` to the end, feeding it `stdin`, and returns its stdout (at
    /// most 256 KiB) and exit code. `None` when it could not start or did not
    /// finish within `limit`; its process group is killed then. Stderr is
    /// never read.
    pub(crate) async fn capture(
        &self,
        cmd: Command,
        stdin: &[u8],
        limit: Duration,
    ) -> Option<Captured> {
        run_captured(cmd, stdin, limit, false)
            .await
            .map(|(out, _)| out)
    }

    /// [`Self::capture`], also keeping the first [`STDERR_KEPT`] bytes of
    /// stderr. Only for a caller that turns them into a verdict at once; the
    /// text itself must not be stored, logged or sent anywhere.
    pub(crate) async fn capture_with_stderr(
        &self,
        cmd: Command,
        stdin: &[u8],
        limit: Duration,
    ) -> Option<(Captured, String)> {
        run_captured(cmd, stdin, limit, true)
            .await
            .map(|(out, err)| (out, String::from_utf8_lossy(&err).into_owned()))
    }
}

/// Most stderr kept by [`SshTools::capture_with_stderr`].
pub(crate) const STDERR_KEPT: usize = 4 * 1024;

/// Reads `reader` to its end, keeping at most `max` bytes.
async fn read_capped(reader: &mut (impl tokio::io::AsyncRead + Unpin), max: usize) -> Vec<u8> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if buf.len() < max {
                    buf.extend_from_slice(&chunk[..n.min(max - buf.len())]);
                }
            }
        }
    }
    buf
}

async fn run_captured(
    mut cmd: Command,
    stdin: &[u8],
    limit: Duration,
    keep_stderr: bool,
) -> Option<(Captured, Vec<u8>)> {
    if keep_stderr {
        cmd.stderr(Stdio::piped());
    }
    let mut child = spawn_retrying(&mut cmd).ok()?;
    let pgid = child.id().and_then(|id| i32::try_from(id).ok());
    let mut input = child.stdin.take()?;
    let mut output = child.stdout.take()?;
    let mut errors = child.stderr.take();
    let data = stdin.to_vec();
    let run = async {
        // A program that ignores its input closes the pipe; not an error.
        let write = async {
            let _ = input.write_all(&data).await;
            drop(input);
        };
        let read = read_capped(&mut output, MAX_CAPTURE);
        let read_err = async {
            match errors.as_mut() {
                Some(e) => read_capped(e, STDERR_KEPT).await,
                None => Vec::new(),
            }
        };
        let ((), buf, err) = tokio::join!(write, read, read_err);
        let status = child.wait().await.ok();
        (buf, err, status)
    };
    // Dropped while the program has not been reaped (a timeout, or the
    // caller giving up on this future), the guard stops its group.
    let mut guard = KillGroup(pgid);
    let done = tokio::time::timeout(limit, run).await;
    if done.is_ok() {
        // Reaped: the group id may be another group's by now.
        guard.0 = None;
    }
    let (buf, err, status) = done.ok()?;
    Some((
        Captured {
            stdout: String::from_utf8_lossy(&buf).into_owned(),
            code: status.and_then(|s| s.code()),
        },
        err,
    ))
}

/// Spawns `cmd`. A program file that was just written can be briefly busy
/// while another thread's freshly forked child still holds it open for
/// writing; that is retried a few times.
pub(crate) fn spawn_retrying(cmd: &mut Command) -> std::io::Result<tokio::process::Child> {
    let mut tries = 0;
    loop {
        match cmd.spawn() {
            Err(e) if e.kind() == std::io::ErrorKind::ExecutableFileBusy && tries < 5 => {
                tries += 1;
                std::thread::sleep(Duration::from_millis(20));
            }
            other => return other,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `sh -c body`: no script file to write first, so no race with another
    /// test's fork over a file that is still open for writing.
    fn sh(tools: &SshTools, body: &str) -> Command {
        let mut cmd = tools.command(Path::new("/bin/sh"));
        cmd.arg("-c").arg(body);
        cmd
    }

    #[tokio::test]
    async fn capture_feeds_stdin_and_returns_stdout_and_exit_code() {
        let tools = SshTools::new();
        let got = tools
            .capture(
                sh(&tools, "cat; exit 3"),
                b"hello\n",
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        assert_eq!(got.stdout, "hello\n");
        assert_eq!(got.code, Some(3));
        assert!(!got.ok());
    }

    #[tokio::test]
    async fn capture_kills_a_program_that_outlives_the_limit() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("pid");
        let tools = SshTools::new();
        let body = format!("sleep 60 & echo $! > '{}'; wait", pidfile.display());
        let got = tools
            .capture(sh(&tools, &body), b"", Duration::from_millis(1500))
            .await;
        assert_eq!(got, None);
        let pid: i32 = std::fs::read_to_string(&pidfile)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        for _ in 0..100 {
            if nix::sys::signal::kill(Pid::from_raw(pid), None).is_err() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("child {pid} survived the timeout");
    }

    #[tokio::test]
    async fn capture_stops_what_it_started_when_the_caller_gives_up() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("pid");
        let tools = SshTools::new();
        let body = format!("sleep 60 & echo $! > '{}'; wait", pidfile.display());
        let cmd = sh(&tools, &body);
        let task = tokio::spawn(async move {
            SshTools::new()
                .capture(cmd, b"", Duration::from_secs(60))
                .await
        });
        let mut pid = None;
        for _ in 0..100 {
            if let Ok(text) = std::fs::read_to_string(&pidfile)
                && let Ok(n) = text.trim().parse::<i32>()
            {
                pid = Some(n);
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        let pid = pid.expect("the program never started");
        task.abort();
        for _ in 0..100 {
            if nix::sys::signal::kill(Pid::from_raw(pid), None).is_err() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("child {pid} survived the abort");
    }

    #[tokio::test]
    async fn capture_bounds_what_it_keeps() {
        let tools = SshTools::new();
        let got = tools
            .capture(
                sh(&tools, "yes x | head -c 2000000"),
                b"",
                Duration::from_secs(10),
            )
            .await
            .unwrap();
        assert_eq!(got.stdout.len(), MAX_CAPTURE);
    }

    #[test]
    fn var_prefers_the_set_environment() {
        let tools = SshTools::new().with_env([("HOME", "/Users/someone")]);
        assert_eq!(
            tools.var("HOME").as_deref(),
            Some(std::ffi::OsStr::new("/Users/someone"))
        );
    }
}
