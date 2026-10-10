//! A Mac app opened from Finder gets launchd's bare environment, not the one
//! the user's terminal has: no Homebrew `PATH`, often not the `SSH_AUTH_SOCK`
//! of 1Password or Secretive. So at launch the login shell is asked once
//! (`$SHELL -ilc`, 3 s at most) and three variables are kept for `ssh`:
//! `PATH`, `SSH_AUTH_SOCK` and `HOME`. Nothing else from the shell is used,
//! and the app's own environment is left alone.

use std::io::Read as _;
use std::os::unix::process::CommandExt as _;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// The variables passed on to `ssh`.
pub const KEPT: [&str; 3] = ["PATH", "SSH_AUTH_SOCK", "HOME"];

/// How long the login shell may take.
pub const SHELL_TIMEOUT: Duration = Duration::from_secs(3);

/// How long the output may take to close once the shell itself has exited.
const READ_GRACE: Duration = Duration::from_millis(200);

/// Printed before `env -0`, so whatever the shell's startup files print is skipped.
const MARKER: &str = "__DAMINUS_ENV__";

/// What was read at launch. Read before the logger exists, so it is logged later.
#[derive(Clone, Debug, Default)]
pub struct GuiEnv {
    pub vars: Vec<(String, String)>,
    pub shell: String,
    /// Why the login shell could not be read, when it could not.
    pub problem: Option<&'static str>,
}

impl GuiEnv {
    /// Logs the shell and variable names, never the values.
    pub fn log(&self) {
        let names: Vec<&str> = self.vars.iter().map(|(k, _)| k.as_str()).collect();
        match self.problem {
            Some(why) => {
                tracing::warn!(shell = %self.shell, why, ?names, "login shell environment not read; using the app's own")
            }
            None => {
                tracing::info!(shell = %self.shell, ?names, "ssh environment from the login shell")
            }
        }
    }
}

/// The variables for `ssh`: the login shell's where it has them, otherwise
/// this process's own.
pub fn read() -> GuiEnv {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| s.starts_with('/'))
        .unwrap_or_else(|| "/bin/zsh".to_owned());
    let (from_shell, problem) = match login_shell_env(&shell, SHELL_TIMEOUT) {
        Ok(vars) => (vars, None),
        Err(why) => (Vec::new(), Some(why)),
    };
    GuiEnv {
        vars: merge(from_shell, |k| std::env::var(k).ok()),
        shell,
        problem,
    }
}

/// Keeps [`KEPT`] from `shell`, falling back to `own` for the ones it lacks.
fn merge(
    shell: Vec<(String, String)>,
    own: impl Fn(&str) -> Option<String>,
) -> Vec<(String, String)> {
    KEPT.iter()
        .filter_map(|&k| {
            shell
                .iter()
                .find(|(n, _)| n == k)
                .map(|(_, v)| v.clone())
                .or_else(|| own(k))
                .filter(|v| !v.is_empty())
                .map(|v| (k.to_owned(), v))
        })
        .collect()
}

/// Runs `shell -ilc 'printf MARKER; env -0'` with no stdin and kills its
/// whole process group if it takes longer than `timeout`.
fn login_shell_env(shell: &str, timeout: Duration) -> Result<Vec<(String, String)>, &'static str> {
    let mut child = Command::new(shell)
        .args(["-ilc", &format!("printf '%s' {MARKER}; /usr/bin/env -0")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|_| "spawn")?;
    let mut stdout = child.stdout.take().ok_or("stdout")?;
    // Read on a thread so a chatty shell cannot fill the pipe and stall. The
    // result comes back over a channel with a deadline: a process the startup
    // files moved to its own group escapes the kill below and may keep the
    // pipe open, so the read itself may never end. Such a reader is left behind.
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        let _ = tx.send(buf);
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if started.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(20));
            }
            _ => break None,
        }
    };
    if let Ok(pid) = i32::try_from(child.id()) {
        // The shell may have left children (agents, prompts); stop them all.
        let _ = nix::sys::signal::killpg(
            nix::unistd::Pid::from_raw(pid),
            nix::sys::signal::Signal::SIGKILL,
        );
    }
    let _ = child.wait();
    let left = timeout.saturating_sub(started.elapsed()) + READ_GRACE;
    let out = rx.recv_timeout(left).map_err(|_| "timeout")?;
    match status {
        None => Err("timeout"),
        Some(s) if !s.success() => Err("exit status"),
        Some(_) => parse(&out).ok_or("no marker"),
    }
}

/// Parses `env -0` output after [`MARKER`].
fn parse(out: &[u8]) -> Option<Vec<(String, String)>> {
    let marker = MARKER.as_bytes();
    let at = out.windows(marker.len()).rposition(|w| w == marker)?;
    let body = &out[at + marker.len()..];
    Some(
        body.split(|b| *b == 0)
            .filter_map(|entry| {
                let entry = std::str::from_utf8(entry).ok()?;
                let (k, v) = entry.split_once('=')?;
                KEPT.contains(&k).then(|| (k.to_owned(), v.to_owned()))
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_skips_startup_noise_and_keeps_three_variables() {
        let out = b"Welcome!\n__DAMINUS_ENV__PATH=/opt/homebrew/bin:/usr/bin\0SECRET=x\0SSH_AUTH_SOCK=/tmp/a b\0HOME=/Users/u\0";
        assert_eq!(
            parse(out).unwrap(),
            vec![
                ("PATH".into(), "/opt/homebrew/bin:/usr/bin".into()),
                ("SSH_AUTH_SOCK".into(), "/tmp/a b".into()),
                ("HOME".into(), "/Users/u".into()),
            ]
        );
        assert_eq!(parse(b"no marker"), None);
    }

    #[test]
    fn merge_prefers_the_shell_and_falls_back_to_own_env() {
        let shell = vec![("PATH".to_owned(), "/opt/homebrew/bin:/usr/bin".to_owned())];
        let own = |k: &str| match k {
            "PATH" => Some("/usr/bin".to_owned()),
            "HOME" => Some("/Users/u".to_owned()),
            _ => None,
        };
        assert_eq!(
            merge(shell, own),
            vec![
                ("PATH".into(), "/opt/homebrew/bin:/usr/bin".into()),
                ("HOME".into(), "/Users/u".into()),
            ]
        );
    }

    #[test]
    fn reads_a_real_login_shell() {
        let vars = login_shell_env("/bin/sh", SHELL_TIMEOUT).unwrap();
        assert!(vars.iter().any(|(k, _)| k == "PATH"));
    }

    /// Writes an executable script and does not return until the file is
    /// closed and marked runnable. On Linux a freshly written file can refuse
    /// to exec with `ETXTBSY` while a writer still holds it, which on a loaded
    /// runner made these tests fail with `Err("spawn")` rather than with what
    /// they assert. Writing through an owned handle that is flushed, synced
    /// and dropped before the mode is set closes that window; the script
    /// itself is never run here, since each test needs its own first run.
    fn executable_script(path: &std::path::Path, body: &str) {
        use std::io::Write as _;
        use std::os::unix::fs::PermissionsExt as _;
        {
            let mut file = std::fs::File::create(path).unwrap();
            file.write_all(body.as_bytes()).unwrap();
            file.sync_all().unwrap();
        }
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
        let mode = std::fs::metadata(path).unwrap().permissions().mode();
        assert!(mode & 0o111 != 0, "{} is not executable", path.display());
    }

    /// Why a spawn of `path` failed, in the kernel's own words. The production
    /// code maps every spawn failure to one word, which on CI says only that
    /// something went wrong; a test that is about to assert on the outcome can
    /// say whether it was ETXTBSY, ENOEXEC, EACCES or something else. The
    /// script is never run here: these scripts have side effects on disk, and
    /// a second run would disturb the one the test is making.
    fn spawn_error(path: &std::path::Path) -> String {
        match Command::new(path)
            .arg("--probe")
            .stdin(Stdio::null())
            .spawn()
        {
            Ok(_) => "spawn succeeded on the probe".to_owned(),
            Err(e) => format!("{e:?} (raw os error {:?})", e.raw_os_error()),
        }
    }

    #[test]
    fn a_hanging_shell_is_killed_at_the_timeout() {
        let dir = tempfile::tempdir().unwrap();
        let shell = dir.path().join("slow-sh");
        executable_script(&shell, "#!/bin/sh\nsleep 30\n");
        let started = Instant::now();
        let got = login_shell_env(shell.to_str().unwrap(), Duration::from_millis(300));
        assert_eq!(got, Err("timeout"));
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn a_process_in_its_own_group_holding_stdout_does_not_stall_the_read() {
        let dir = tempfile::tempdir().unwrap();
        let shell = dir.path().join("daemon-sh");
        // Exits as soon as its child has moved to a new process group (out
        // of reach of killpg), leaving that child holding stdout for 30 s.
        executable_script(
            &shell,
            "#!/bin/sh\n\
             /usr/bin/perl -e 'setpgrp(0,0); open(F, \">\", $ARGV[0]); close(F); sleep 30' \"$0.ready\" &\n\
             while [ ! -e \"$0.ready\" ]; do sleep 0.02; done\n\
             exit 0\n",
        );
        let started = Instant::now();
        let got = login_shell_env(shell.to_str().unwrap(), Duration::from_millis(500));
        // `Err("spawn")` means the script never ran, which says nothing about
        // the behaviour under test; name the kernel's reason when that happens.
        if got == Err("spawn") {
            panic!("{} did not run: {}", shell.display(), spawn_error(&shell));
        }
        assert_eq!(got, Err("timeout"));
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "{:?}",
            started.elapsed()
        );
    }
}
