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

/// Where the OpenSSH programs are and how to start them.
#[derive(Debug, Clone)]
pub struct SshTools {
    pub(crate) ssh: PathBuf,
    pub(crate) keygen: PathBuf,
    pub(crate) keyscan: PathBuf,
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

    /// The config file given with `-F`, if any.
    pub fn config(&self) -> Option<&Path> {
        self.config.as_deref()
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
        mut cmd: Command,
        stdin: &[u8],
        limit: Duration,
    ) -> Option<Captured> {
        let mut child = cmd.spawn().ok()?;
        let pgid = child.id().and_then(|id| i32::try_from(id).ok());
        let mut input = child.stdin.take()?;
        let mut output = child.stdout.take()?;
        let data = stdin.to_vec();
        let run = async {
            // A program that ignores its input closes the pipe; not an error.
            let write = async {
                let _ = input.write_all(&data).await;
                drop(input);
            };
            let mut buf = Vec::new();
            let read = async {
                let mut chunk = [0u8; 8192];
                loop {
                    match output.read(&mut chunk).await {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            if buf.len() < MAX_CAPTURE {
                                buf.extend_from_slice(&chunk[..n.min(MAX_CAPTURE - buf.len())]);
                            }
                        }
                    }
                }
            };
            tokio::join!(write, read);
            let status = child.wait().await.ok();
            (buf, status)
        };
        let done = tokio::time::timeout(limit, run).await;
        if let Some(pgid) = pgid {
            // Whatever the program left behind (a ProxyCommand, a `Match exec`).
            let _ = killpg(Pid::from_raw(pgid), Signal::SIGKILL);
        }
        let (buf, status) = done.ok()?;
        Some(Captured {
            stdout: String::from_utf8_lossy(&buf).into_owned(),
            code: status.and_then(|s| s.code()),
        })
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
