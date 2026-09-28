//! Turns `ssh` stderr into a failure kind. Only the verdict leaves this
//! module: raw stderr (host names, user names, key paths) is never stored in
//! a snapshot, event, log or AI payload. At most the last 4 KiB is kept in
//! memory while the run lasts.

use crate::domain::snapshot::NetCause;

use super::Failure;

/// Most stderr kept in memory per run.
pub const STDERR_TAIL_BYTES: usize = 4 * 1024;

/// What stderr said, strongest first.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum StderrVerdict {
    HostKeyChanged,
    HostKeyUnknown,
    Auth,
    Unreachable(NetCauseRank),
}

/// [`NetCause`] ordered by how specific it is, so the most telling cause wins
/// when a jump host and the target both complain.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum NetCauseRank {
    Dns,
    NoRoute,
    Refused,
    ConnectTimeout,
    Other,
}

impl NetCauseRank {
    pub fn cause(self) -> NetCause {
        match self {
            NetCauseRank::Dns => NetCause::Dns,
            NetCauseRank::NoRoute => NetCause::NoRoute,
            NetCauseRank::Refused => NetCause::Refused,
            NetCauseRank::ConnectTimeout => NetCause::ConnectTimeout,
            NetCauseRank::Other => NetCause::Other,
        }
    }
}

impl StderrVerdict {
    pub fn failure(self) -> Failure {
        match self {
            StderrVerdict::HostKeyChanged => Failure::HostKeyChanged { fp: None },
            StderrVerdict::HostKeyUnknown => Failure::HostKeyUnknown { fp: None },
            StderrVerdict::Auth => Failure::Auth,
            StderrVerdict::Unreachable(rank) => Failure::Unreachable(rank.cause()),
        }
    }
}

/// Reads stderr line by line. Also tracks authentication (with
/// `LogLevel=VERBOSE`, ssh prints `Authenticating to` and `Authenticated to`
/// for each hop) so a run can tell it is waiting on an SSH agent.
#[derive(Debug, Default)]
pub struct StderrClassifier {
    verdict: Option<StderrVerdict>,
    tail: Vec<u8>,
    authenticating: u32,
    authenticated: u32,
}

/// Substrings of OpenSSH messages, checked in order. Each is a message ssh or
/// a jump host prints, in any OpenSSH from 7.x to 10.x.
const PATTERNS: &[(&str, StderrVerdict)] = &[
    (
        "REMOTE HOST IDENTIFICATION HAS CHANGED",
        StderrVerdict::HostKeyChanged,
    ),
    (
        "has changed and you have requested strict checking",
        StderrVerdict::HostKeyChanged,
    ),
    ("host key is known for", StderrVerdict::HostKeyUnknown),
    (
        "Host key verification failed",
        StderrVerdict::HostKeyUnknown,
    ),
    ("Permission denied (", StderrVerdict::Auth),
    ("Too many authentication failures", StderrVerdict::Auth),
    ("agent refused operation", StderrVerdict::Auth),
    ("No more authentication methods to try", StderrVerdict::Auth),
    (
        "Could not resolve hostname",
        StderrVerdict::Unreachable(NetCauseRank::Dns),
    ),
    (
        "Name or service not known",
        StderrVerdict::Unreachable(NetCauseRank::Dns),
    ),
    (
        "nodename nor servname",
        StderrVerdict::Unreachable(NetCauseRank::Dns),
    ),
    (
        "Temporary failure in name resolution",
        StderrVerdict::Unreachable(NetCauseRank::Dns),
    ),
    (
        "No address associated with hostname",
        StderrVerdict::Unreachable(NetCauseRank::Dns),
    ),
    (
        "No route to host",
        StderrVerdict::Unreachable(NetCauseRank::NoRoute),
    ),
    (
        "Network is unreachable",
        StderrVerdict::Unreachable(NetCauseRank::NoRoute),
    ),
    (
        "Host is down",
        StderrVerdict::Unreachable(NetCauseRank::NoRoute),
    ),
    (
        "Connection refused",
        StderrVerdict::Unreachable(NetCauseRank::Refused),
    ),
    (
        "Connection timed out",
        StderrVerdict::Unreachable(NetCauseRank::ConnectTimeout),
    ),
    (
        "Operation timed out",
        StderrVerdict::Unreachable(NetCauseRank::ConnectTimeout),
    ),
    (
        "timed out during banner exchange",
        StderrVerdict::Unreachable(NetCauseRank::ConnectTimeout),
    ),
    (
        "Connection closed by",
        StderrVerdict::Unreachable(NetCauseRank::Other),
    ),
    (
        "Connection reset by",
        StderrVerdict::Unreachable(NetCauseRank::Other),
    ),
    (
        "kex_exchange_identification",
        StderrVerdict::Unreachable(NetCauseRank::Other),
    ),
    (
        "ssh_exchange_identification",
        StderrVerdict::Unreachable(NetCauseRank::Other),
    ),
    (
        "stdio forwarding failed",
        StderrVerdict::Unreachable(NetCauseRank::Other),
    ),
];

impl StderrClassifier {
    pub fn new() -> Self {
        Self::default()
    }

    /// Takes one stderr line (without its newline).
    pub fn line(&mut self, line: &str) {
        self.keep_tail(line);
        if line.contains("Authenticating to ") {
            self.authenticating += 1;
        } else if line.contains("Authenticated to ") {
            self.authenticated += 1;
        }
        for (needle, verdict) in PATTERNS {
            if line.contains(needle) {
                self.verdict = Some(match self.verdict {
                    Some(v) if v <= *verdict => v,
                    _ => *verdict,
                });
                break;
            }
        }
    }

    fn keep_tail(&mut self, line: &str) {
        self.tail.extend_from_slice(line.as_bytes());
        self.tail.push(b'\n');
        if self.tail.len() > STDERR_TAIL_BYTES {
            let cut = self.tail.len() - STDERR_TAIL_BYTES;
            self.tail.drain(..cut);
        }
    }

    /// A hop is between `Authenticating to` and `Authenticated to`.
    pub fn authenticating(&self) -> bool {
        self.authenticating > self.authenticated
    }

    pub fn verdict(&self) -> Option<StderrVerdict> {
        self.verdict
    }

    /// Bytes of stderr held in memory (at most [`STDERR_TAIL_BYTES`]).
    pub fn tail_len(&self) -> usize {
        self.tail.len()
    }
}

/// Classifies a whole stderr text at once.
pub fn classify(stderr: &str) -> Option<StderrVerdict> {
    let mut c = StderrClassifier::new();
    stderr.lines().for_each(|l| c.line(l));
    c.verdict()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Stderr as printed by OpenSSH 9.x/10.x clients (macOS and Ubuntu), with
    /// `LogLevel=VERBOSE` noise, host names changed.
    #[test]
    fn real_stderr_samples() {
        let cases: &[(&str, Option<StderrVerdict>)] = &[
            (
                "Authenticated to vps-a ([203.0.113.5]:22) using \"publickey\".\n",
                None,
            ),
            (
                "Authenticating to 203.0.113.5:22 as 'deploy'\n\
                 debug1: Will attempt key: /Users/me/.ssh/id_ed25519 ED25519 SHA256:abc\n\
                 deploy@203.0.113.5: Permission denied (publickey).\n",
                Some(StderrVerdict::Auth),
            ),
            (
                "Received disconnect from 203.0.113.5 port 22:2: Too many authentication failures\n\
                 Disconnected from 203.0.113.5 port 22\n",
                Some(StderrVerdict::Auth),
            ),
            (
                "sign_and_send_pubkey: signing failed for ED25519 \"op\" from agent: agent refused operation\n\
                 deploy@vps: Permission denied (publickey).\n",
                Some(StderrVerdict::Auth),
            ),
            (
                "No ED25519 host key is known for [127.0.0.1]:2222 and you have requested strict checking.\n\
                 Host key verification failed.\n",
                Some(StderrVerdict::HostKeyUnknown),
            ),
            (
                "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n\
                 @    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n\
                 @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n\
                 IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!\n\
                 The fingerprint for the ED25519 key sent by the remote host is\n\
                 SHA256:Zm9vYmFyYmF6.\n\
                 Offending ED25519 key in /Users/me/.ssh/known_hosts:12\n\
                 Host key for 203.0.113.5 has changed and you have requested strict checking.\n\
                 Host key verification failed.\n",
                Some(StderrVerdict::HostKeyChanged),
            ),
            (
                "ssh: Could not resolve hostname nope.invalid: nodename nor servname provided, or not known\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::Dns)),
            ),
            (
                "ssh: Could not resolve hostname nope.invalid: Name or service not known\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::Dns)),
            ),
            (
                "ssh: connect to host 127.0.0.1 port 2299: Connection refused\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::Refused)),
            ),
            (
                "ssh: connect to host 10.255.255.1 port 22: Operation timed out\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::ConnectTimeout)),
            ),
            (
                "ssh: connect to host 10.255.255.1 port 22: Connection timed out\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::ConnectTimeout)),
            ),
            (
                "ssh: connect to host 192.0.2.1 port 22: No route to host\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::NoRoute)),
            ),
            (
                "ssh: connect to host 192.0.2.1 port 22: Network is unreachable\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::NoRoute)),
            ),
            (
                "kex_exchange_identification: read: Connection reset by peer\n\
                 Connection reset by 203.0.113.5 port 22\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::Other)),
            ),
            (
                "Connection timed out during banner exchange\n\
                 Connection to UNKNOWN port 65535 timed out\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::ConnectTimeout)),
            ),
            // Through a jump host: the jump names the real cause, then the
            // outer ssh reports a closed connection.
            (
                "channel 0: open failed: connect failed: Name or service not known\n\
                 stdio forwarding failed\n\
                 Connection closed by UNKNOWN port 65535\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::Dns)),
            ),
            (
                "channel 0: open failed: connect failed: Connection refused\n\
                 stdio forwarding failed\n\
                 kex_exchange_identification: Connection closed by remote host\n",
                Some(StderrVerdict::Unreachable(NetCauseRank::Refused)),
            ),
        ];
        for (stderr, want) in cases {
            assert_eq!(classify(stderr), *want, "{stderr}");
        }
    }

    #[test]
    fn tracks_hops_waiting_for_authentication() {
        let mut c = StderrClassifier::new();
        c.line("Authenticating to jump.example:22 as 'me'");
        assert!(c.authenticating());
        c.line("Authenticated to jump.example ([198.51.100.1]:22) using \"publickey\".");
        assert!(!c.authenticating());
        c.line("Authenticating to 10.0.0.5:22 as 'deploy'");
        assert!(c.authenticating());
    }

    #[test]
    fn keeps_only_the_last_4_kib() {
        let mut c = StderrClassifier::new();
        for _ in 0..500 {
            c.line("debug1: some verbose line that is fairly long");
        }
        assert!(c.tail_len() <= STDERR_TAIL_BYTES);
    }
}
