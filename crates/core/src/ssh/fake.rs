//! A scripted [`Transport`] for tests: each host replays fixed output, fails
//! the way ssh would, or hangs. Output can come from the phase-2 golden
//! fixtures (`fixtures/ndjson/<distro>/*.ndjson`), re-stamped with the hash of
//! the bundle actually sent, as a real server would print it.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use tokio::sync::mpsc;

use super::{BoxFuture, Failure, RunEnd, RunRequest, RunSignal, Transport};
use crate::checks::bundle::BUNDLE_VAR;
use crate::domain::host::HostAlias;

/// Stands for the bundle hash in scripted output.
pub const HASH: &str = "{bundle}";

/// What one host does.
#[derive(Clone, Debug)]
pub enum FakeHost {
    /// Sends `chunks`, each after its delay, then exits with `exit`.
    Output {
        chunks: Vec<(Duration, String)>,
        exit: i32,
    },
    /// Fails before any output, after `delay`.
    Fail { delay: Duration, failure: Failure },
    /// Waits for an agent that never answers, then hangs.
    AgentHang,
    /// Waits `wait` for an agent approval, then sends `text` and exits 0.
    AgentThen { wait: Duration, text: String },
}

impl FakeHost {
    /// All of `text` at once, exit 0.
    pub fn output(text: impl Into<String>) -> Self {
        FakeHost::Output {
            chunks: vec![(Duration::ZERO, text.into())],
            exit: 0,
        }
    }

    /// `text` split in lines, each sent `every` apart.
    pub fn slow(text: &str, every: Duration) -> Self {
        FakeHost::Output {
            chunks: text
                .split_inclusive('\n')
                .map(|l| (every, l.to_owned()))
                .collect(),
            exit: 0,
        }
    }

    pub fn fail(failure: Failure) -> Self {
        FakeHost::Fail {
            delay: Duration::ZERO,
            failure,
        }
    }

    /// A healthy host: every golden fixture of `distro`, wrapped in one
    /// `begin`/`end` the way a full bundle prints it.
    pub fn from_fixtures(distro: &str) -> std::io::Result<Self> {
        Ok(Self::output(fixture_run(distro)?))
    }
}

/// The directory of the shared golden NDJSON fixtures.
pub fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/ndjson")
}

/// The facts and steps of every fixture of `distro`, between one `begin`
/// (hash [`HASH`]) and one `end`.
pub fn fixture_run(distro: &str) -> std::io::Result<String> {
    let dir = fixtures_dir().join(distro);
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "ndjson"))
        .collect();
    files.sort();
    let mut body = format!("{{\"_\":\"begin\",\"v\":1,\"bundle\":\"{HASH}\"}}\n");
    for f in files {
        for line in std::fs::read_to_string(f)?.lines() {
            if line.contains("\"_\":\"begin\"") || line.contains("\"_\":\"end\"") {
                continue;
            }
            body.push_str(line);
            body.push('\n');
        }
    }
    body.push_str("{\"_\":\"end\"}\n");
    Ok(body)
}

/// The hash a bundle sets in `DAMINUS_BUNDLE='…'`.
pub fn bundle_hash(script: &str) -> Option<&str> {
    script.lines().find_map(|l| {
        l.strip_prefix(BUNDLE_VAR)?
            .strip_prefix("='")?
            .strip_suffix('\'')
    })
}

/// A transport that replays [`FakeHost`] scripts. Unknown hosts are unreachable (DNS).
#[derive(Debug, Default)]
pub struct FakeTransport {
    hosts: HashMap<HostAlias, FakeHost>,
    runs: AtomicU32,
    killed: AtomicU32,
    scripts: Mutex<Vec<String>>,
}

impl FakeTransport {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn host(mut self, alias: &str, host: FakeHost) -> Self {
        if let Ok(a) = HostAlias::parse(alias) {
            self.hosts.insert(a, host);
        }
        self
    }

    /// Runs started so far.
    pub fn runs(&self) -> u32 {
        self.runs.load(Ordering::SeqCst)
    }

    /// Times [`Transport::kill_all`] was called.
    pub fn kills(&self) -> u32 {
        self.killed.load(Ordering::SeqCst)
    }

    /// Scripts received, in order.
    pub fn scripts(&self) -> Vec<String> {
        self.scripts.lock().map(|s| s.clone()).unwrap_or_default()
    }

    async fn play(&self, req: &RunRequest, out: mpsc::Sender<RunSignal>) -> RunEnd {
        self.runs.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut s) = self.scripts.lock() {
            s.push(req.script.clone());
        }
        let hash = bundle_hash(&req.script).unwrap_or_default().to_owned();
        match self.hosts.get(&req.host).cloned() {
            None => RunEnd {
                exit: Some(255),
                failure: Some(Failure::Unreachable(crate::domain::snapshot::NetCause::Dns)),
            },
            Some(FakeHost::Fail { delay, failure }) => {
                tokio::time::sleep(delay).await;
                RunEnd {
                    exit: Some(255),
                    failure: Some(failure),
                }
            }
            Some(FakeHost::AgentHang) => {
                let _ = out.send(RunSignal::AgentWait).await;
                std::future::pending::<()>().await;
                RunEnd::default()
            }
            Some(FakeHost::AgentThen { wait, text }) => {
                let _ = out.send(RunSignal::AgentWait).await;
                tokio::time::sleep(wait).await;
                let bytes = text.replace(HASH, &hash).into_bytes();
                let _ = out.send(RunSignal::Stdout(bytes)).await;
                RunEnd {
                    exit: Some(0),
                    failure: None,
                }
            }
            Some(FakeHost::Output { chunks, exit }) => {
                for (delay, text) in chunks {
                    tokio::time::sleep(delay).await;
                    let bytes = text.replace(HASH, &hash).into_bytes();
                    if out.send(RunSignal::Stdout(bytes)).await.is_err() {
                        break;
                    }
                }
                RunEnd {
                    exit: Some(exit),
                    failure: None,
                }
            }
        }
    }
}

impl Transport for FakeTransport {
    fn run<'a>(
        &'a self,
        req: &'a RunRequest,
        out: mpsc::Sender<RunSignal>,
    ) -> BoxFuture<'a, RunEnd> {
        Box::pin(self.play(req, out))
    }

    fn kill_all(&self) {
        self.killed.fetch_add(1, Ordering::SeqCst);
    }
}
