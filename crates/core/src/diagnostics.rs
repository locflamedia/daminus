//! The text Settings › About copies for a bug report: versions, the `PATH`
//! the app resolved, settings, the last result of each host and the tail of
//! the local log. It is only built and returned; nothing is sent anywhere.
//! The whole text goes through `redact_secrets`, so a credential-looking token
//! in a setting or a log line never reaches it.

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::io::{Read as _, Seek as _, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::domain::datetime::Timestamp;
use crate::domain::host::HostRef;
use crate::domain::redact::redact_secrets;
use crate::domain::settings::Settings;
use crate::domain::snapshot::{HostOutcome, Snapshot};
use crate::ssh::SshTools;
use crate::store::FsStore;

/// Log lines included, newest last.
pub const LOG_LINES: usize = 200;

/// Most bytes read from the end of the log file.
const LOG_TAIL_BYTES: u64 = 256 * 1024;

/// Longest log line kept; the rest is cut.
const LOG_LINE_MAX: usize = 1000;

/// Scans looked through for each host's last result.
const SCANS_READ: usize = 20;

/// How long `ssh -V` and `sw_vers` may take.
const PROGRAM_TIMEOUT: Duration = Duration::from_secs(3);

/// The text for the clipboard.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Diagnostics {
    pub text: String,
}

/// What the shell knows and the core does not.
#[derive(Clone, Debug)]
pub struct DiagnosticsSource {
    pub app_version: String,
    /// The local log file, when the platform has one.
    pub log_file: Option<PathBuf>,
}

/// Everything the text is made of, before it is written out.
#[derive(Debug, Default)]
struct Sections {
    app_version: String,
    os: String,
    ssh_version: Option<String>,
    path: Option<String>,
    settings: Option<String>,
    hosts: Vec<(String, String)>,
    log: Vec<String>,
}

/// Collects the diagnostics text. Never fails: a part that cannot be read is
/// written as unavailable.
pub async fn collect(tools: &SshTools, store: &FsStore, source: &DiagnosticsSource) -> Diagnostics {
    let os = os_version().await;
    let ssh_version = tools.ssh_version(PROGRAM_TIMEOUT).await;
    let path = tools.var("PATH").map(|p| p.to_string_lossy().into_owned());
    let settings = store
        .load_settings()
        .ok()
        .and_then(|s| settings_json(&s.value));
    let hosts = store
        .load_history(Some(SCANS_READ))
        .map(|history| last_results(&history))
        .unwrap_or_default();
    let log = source
        .log_file
        .as_deref()
        .map(|p| tail_lines(p, LOG_LINES))
        .unwrap_or_default();
    Diagnostics {
        text: render(&Sections {
            app_version: source.app_version.clone(),
            os,
            ssh_version,
            path,
            settings,
            hosts,
            log,
        }),
    }
}

/// Settings as pretty JSON. They never hold a key; the text is redacted
/// again as a whole, so a token someone typed into a free-text field goes too.
fn settings_json(settings: &Settings) -> Option<String> {
    serde_json::to_string_pretty(settings).ok()
}

/// The newest outcome of each host and when it was recorded; `history` is newest first.
fn last_results(history: &[Snapshot]) -> Vec<(String, String)> {
    let mut seen: BTreeMap<&HostRef, (&HostOutcome, Timestamp)> = BTreeMap::new();
    for snapshot in history {
        for (host, outcome) in &snapshot.hosts {
            seen.entry(host).or_insert((outcome, snapshot.finished_at));
        }
    }
    seen.into_iter()
        .map(|(host, (outcome, at))| {
            let when = at
                .inner()
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default();
            (
                host.to_string(),
                format!("{} ({when})", outcome_label(outcome)),
            )
        })
        .collect()
}

/// The outcome's name; host key fingerprints are left out.
fn outcome_label(outcome: &HostOutcome) -> String {
    match outcome {
        HostOutcome::Reached => "reached".to_owned(),
        HostOutcome::Partial => "partial".to_owned(),
        HostOutcome::Unreachable { cause } => format!("unreachable ({cause:?})").to_lowercase(),
        HostOutcome::AuthFailed => "auth failed".to_owned(),
        HostOutcome::HostKeyUnknown { .. } => "host key unknown".to_owned(),
        HostOutcome::HostKeyChanged { .. } => "host key changed".to_owned(),
        HostOutcome::Timeout => "timeout".to_owned(),
    }
}

/// The last `count` lines of `path`, read from at most its last 256 KiB,
/// each cut at [`LOG_LINE_MAX`] characters. Empty when it cannot be read.
pub fn tail_lines(path: &Path, count: usize) -> Vec<String> {
    let Ok(mut file) = std::fs::File::open(path) else {
        return Vec::new();
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(LOG_TAIL_BYTES);
    let mut bytes = Vec::new();
    if file.seek(SeekFrom::Start(start)).is_err() || file.read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&bytes);
    let mut lines: Vec<&str> = text.lines().collect();
    if start > 0 && !lines.is_empty() {
        // The first line is probably cut in the middle.
        lines.remove(0);
    }
    let from = lines.len().saturating_sub(count);
    lines[from..]
        .iter()
        .map(|l| l.chars().take(LOG_LINE_MAX).collect())
        .collect()
}

fn render(s: &Sections) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "Daminus {}", s.app_version);
    let _ = writeln!(out, "OS: {}", s.os);
    let _ = writeln!(
        out,
        "ssh: {}",
        s.ssh_version.as_deref().unwrap_or("unavailable")
    );
    let _ = writeln!(out, "PATH: {}", s.path.as_deref().unwrap_or("unavailable"));
    let _ = writeln!(out, "\n## Settings");
    let _ = writeln!(out, "{}", s.settings.as_deref().unwrap_or("unreadable"));
    let _ = writeln!(out, "\n## Hosts (last result)");
    if s.hosts.is_empty() {
        let _ = writeln!(out, "none");
    }
    for (host, result) in &s.hosts {
        let _ = writeln!(out, "{host}: {result}");
    }
    let _ = writeln!(out, "\n## Log (last {LOG_LINES} lines)");
    if s.log.is_empty() {
        let _ = writeln!(out, "empty");
    }
    for line in &s.log {
        let _ = writeln!(out, "{line}");
    }
    redact_secrets(&out)
}

/// macOS version from `sw_vers`, else `uname`, with the CPU architecture.
async fn os_version() -> String {
    let name = match run_line("/usr/bin/sw_vers", &["-productVersion"]).await {
        Some(v) => format!("macOS {v}"),
        None => run_line("/usr/bin/uname", &["-sr"])
            .await
            .unwrap_or_else(|| std::env::consts::OS.to_owned()),
    };
    format!("{name} ({})", std::env::consts::ARCH)
}

async fn run_line(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    let out = tokio::time::timeout(PROGRAM_TIMEOUT, cmd.output())
        .await
        .ok()?
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_owned();
    (out.status.success() && !text.is_empty()).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    const CANARY: &str = "sk-ant-api03-CanaryCanaryCanary0123456789abcdef";

    #[test]
    fn canary_secrets_do_not_reach_the_text() {
        let text = render(&Sections {
            app_version: "0.1.0".into(),
            os: "macOS 15".into(),
            ssh_version: Some(format!("OpenSSH_9 {CANARY}")),
            path: Some(format!("/usr/bin:/opt/{CANARY}")),
            settings: Some(format!("{{\"model\": \"{CANARY}\"}}")),
            hosts: vec![(format!("vps-{CANARY}"), format!("reached {CANARY}"))],
            log: vec![format!("provider said {CANARY}")],
        });
        assert!(!text.contains("CanaryCanary"), "{text}");
        assert!(text.contains("Daminus 0.1.0"));
        assert!(text.contains("[redacted:key]"));
    }

    #[test]
    fn a_private_key_block_in_the_log_is_removed() {
        let text = render(&Sections {
            log: vec![
                "-----BEGIN OPENSSH PRIVATE KEY-----".into(),
                "b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHI".into(),
                "-----END OPENSSH PRIVATE KEY-----".into(),
            ],
            ..Sections::default()
        });
        assert!(!text.contains("b3BlbnNz"), "{text}");
    }

    #[test]
    fn tail_keeps_the_last_lines_and_cuts_long_ones() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("daminus.log");
        let mut body = String::new();
        for i in 0..300 {
            let _ = writeln!(body, "line {i}");
        }
        body.push_str(&"x".repeat(LOG_LINE_MAX + 50));
        std::fs::write(&file, body).unwrap();
        let lines = tail_lines(&file, 5);
        assert_eq!(lines.len(), 5);
        assert_eq!(lines[3], "line 299");
        assert_eq!(lines[4].len(), LOG_LINE_MAX);
        assert!(tail_lines(&dir.path().join("none.log"), 5).is_empty());
    }

    #[test]
    fn tail_of_a_big_file_drops_the_cut_first_line() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("daminus.log");
        let line = format!("{}\n", "a".repeat(99));
        std::fs::write(&file, line.repeat(5000)).unwrap();
        let lines = tail_lines(&file, 10_000);
        assert!(lines.len() < 5000);
        assert!(lines.iter().all(|l| l.len() == 99));
    }

    #[test]
    fn host_results_take_the_newest_scan_that_saw_the_host() {
        let snap = |seq: u32, hosts: &[(&str, HostOutcome)]| {
            let mut s: Snapshot = serde_json::from_value(serde_json::json!({
                "started_at": "2026-09-26T06:00:00Z",
                "finished_at": "2026-09-26T06:00:00Z",
                "seq": seq,
            }))
            .unwrap();
            for (h, o) in hosts {
                s.hosts.insert(HostRef::parse(h).unwrap(), o.clone());
            }
            s
        };
        let history = vec![
            snap(2, &[("vps-a", HostOutcome::AuthFailed)]),
            snap(
                1,
                &[
                    ("vps-a", HostOutcome::Reached),
                    (
                        "vps-b",
                        HostOutcome::HostKeyChanged {
                            fp: "SHA256:zzz".into(),
                        },
                    ),
                ],
            ),
        ];
        let got = last_results(&history);
        assert_eq!(got.len(), 2);
        assert!(got[0].1.starts_with("auth failed"));
        assert!(got[1].1.starts_with("host key changed"));
        assert!(!got[1].1.contains("zzz"));
    }

    #[tokio::test]
    async fn collect_reads_settings_and_log_of_a_temp_store() {
        let dir = tempfile::tempdir().unwrap();
        let store = FsStore::new(dir.path());
        let log = dir.path().join("daminus.log");
        std::fs::write(&log, format!("INFO start {CANARY}\n")).unwrap();
        let d = collect(
            &SshTools::new(),
            &store,
            &DiagnosticsSource {
                app_version: "9.9.9".into(),
                log_file: Some(log),
            },
        )
        .await;
        assert!(d.text.starts_with("Daminus 9.9.9"));
        assert!(d.text.contains("\"language\": \"en\""));
        assert!(d.text.contains("INFO start"));
        assert!(!d.text.contains("CanaryCanary"));
    }
}
