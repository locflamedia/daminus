//! Running a script on a host. One [`Transport`] serves scan, discover and
//! "test login": it sends a script on stdin and streams stdout back.
//!
//! The real transport ([`SshTransport`]) spawns the system `ssh` (ADR 0001);
//! [`fake::FakeTransport`] replays scripted output in tests.

mod classify;
#[cfg(any(test, feature = "fake"))]
pub mod fake;
mod system;

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use tokio::sync::mpsc;

pub use classify::{StderrClassifier, StderrVerdict, classify};
pub use system::SshTransport;

use crate::domain::error::ErrorCode;
use crate::domain::host::HostAlias;
use crate::domain::snapshot::{HostOutcome, NetCause};

/// A boxed future, so [`Transport`] can be used as `dyn Transport`.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// One script to run on one host.
#[derive(Clone, Debug)]
pub struct RunRequest {
    pub host: HostAlias,
    /// Sent on stdin to `sh -s`. Never logged and never on the command line.
    pub script: String,
    /// `ssh -o ConnectTimeout`: TCP connect and handshake only.
    pub connect_timeout: Duration,
    /// Also enforced on the server with `timeout`, when the server has it.
    pub budget: Duration,
}

/// What a run reports while it is under way.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RunSignal {
    /// A chunk of stdout, as read (not split into lines).
    Stdout(Vec<u8>),
    /// Authentication is taking a while: most likely an SSH agent (1Password,
    /// Secretive) waiting for the user to approve. Sent at most once.
    AgentWait,
}

/// Why a run could not reach the host's shell.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Failure {
    Auth,
    /// `fp` is the key the host offered (`ED25519 SHA256:…`), when it could be read.
    HostKeyUnknown {
        fp: Option<String>,
    },
    HostKeyChanged {
        fp: Option<String>,
    },
    Unreachable(NetCause),
    /// `ssh` itself could not be started.
    Spawn,
}

impl Failure {
    pub fn outcome(&self) -> HostOutcome {
        match self {
            Failure::Auth => HostOutcome::AuthFailed,
            Failure::HostKeyUnknown { fp } => HostOutcome::HostKeyUnknown {
                fp: fp.clone().unwrap_or_default(),
            },
            Failure::HostKeyChanged { fp } => HostOutcome::HostKeyChanged {
                fp: fp.clone().unwrap_or_default(),
            },
            Failure::Unreachable(cause) => HostOutcome::Unreachable { cause: *cause },
            Failure::Spawn => HostOutcome::Unreachable {
                cause: NetCause::Other,
            },
        }
    }
}

/// The error code the UI shows for a host outcome, when it is a failure.
pub fn outcome_error(outcome: &HostOutcome) -> Option<ErrorCode> {
    match outcome {
        HostOutcome::Reached | HostOutcome::Partial => None,
        HostOutcome::Unreachable { .. } => Some(ErrorCode::SshUnreachable),
        HostOutcome::AuthFailed => Some(ErrorCode::SshAuth),
        HostOutcome::HostKeyUnknown { .. } => Some(ErrorCode::SshHostKeyUnknown),
        HostOutcome::HostKeyChanged { .. } => Some(ErrorCode::SshHostKeyChanged),
        HostOutcome::Timeout => Some(ErrorCode::Timeout),
    }
}

/// How a run ended.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RunEnd {
    /// Exit code of `ssh` (255 for an ssh error, otherwise the remote shell's).
    pub exit: Option<i32>,
    /// Set when stderr showed the host was never reached. The caller still
    /// prefers what stdout says when the script did start.
    pub failure: Option<Failure>,
}

/// Runs scripts on hosts.
///
/// The script goes to the host's `sh -s` on stdin, and stdin stays open until
/// the run ends, so a bundle built with `DAMINUS_HANGUP=1` notices when the
/// client goes away. Dropping the future returned by [`Transport::run`] stops
/// the run and every process it started. All stdout is sent before the
/// future resolves.
pub trait Transport: Send + Sync {
    fn run<'a>(
        &'a self,
        req: &'a RunRequest,
        out: mpsc::Sender<RunSignal>,
    ) -> BoxFuture<'a, RunEnd>;

    /// Kills every process still running (app quit, Ctrl-C).
    fn kill_all(&self);
}

/// A remote exit code that means the server-side `timeout` stopped the bundle.
pub fn is_remote_timeout(exit: Option<i32>) -> bool {
    matches!(exit, Some(124 | 137))
}
