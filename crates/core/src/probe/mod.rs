//! Checks run from this Mac against a project's URLs (`url.*`, host `@local`).
//!
//! `url.http` (status and time), `url.tls` (certificate expiry and trust) and
//! `url.exposed` (`/.env` and `/.git/HEAD` downloadable). The probe never
//! stores a response body: `url.http` reads none, `url.exposed` reads the
//! first 4 KiB to judge and keeps only key names.

mod cert;
mod exposed;
mod http;
mod scope;
mod tls;

use std::future::Future;
use std::pin::Pin;

pub use http::HttpProbe;
pub use scope::{UrlWarning, url_warning};

use crate::domain::fact::CheckFact;

/// The check id of the HTTP status probe.
pub const URL_HTTP: &str = "url.http";
/// The check id of the certificate probe (`https` URLs only).
pub const URL_TLS: &str = "url.tls";
/// The check id of the exposed-files probe.
pub const URL_EXPOSED: &str = "url.exposed";

/// Which of the three checks a probe runs. `url.http` and `url.tls` belong to
/// the `uptime` group and `url.exposed` to `security`, and each group can be
/// switched off in Settings › Scan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProbeChecks {
    pub http: bool,
    pub tls: bool,
    pub exposed: bool,
}

impl ProbeChecks {
    /// Every check.
    pub const ALL: Self = Self {
        http: true,
        tls: true,
        exposed: true,
    };
    /// Only the status probe.
    pub const HTTP: Self = Self {
        http: true,
        tls: false,
        exposed: false,
    };

    pub fn any(self) -> bool {
        self.http || self.tls || self.exposed
    }
}

/// Why a request failed before any HTTP status arrived. Written to
/// `data.error` of the fact; `data.class` is then `error`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbeError {
    InvalidUrl,
    Dns,
    NoRoute,
    Refused,
    Timeout,
    Tls,
    TooManyRedirects,
    Other,
}

impl ProbeError {
    pub fn as_str(self) -> &'static str {
        match self {
            ProbeError::InvalidUrl => "invalid_url",
            ProbeError::Dns => "dns",
            ProbeError::NoRoute => "no_route",
            ProbeError::Refused => "refused",
            ProbeError::Timeout => "timeout",
            ProbeError::Tls => "tls",
            ProbeError::TooManyRedirects => "redirects",
            ProbeError::Other => "other",
        }
    }

    /// A failure that also happens when this Mac is offline.
    pub fn is_network(self) -> bool {
        matches!(self, ProbeError::Dns | ProbeError::NoRoute)
    }
}

/// The facts one URL produced.
#[derive(Clone, Debug, PartialEq)]
pub struct ProbeResult {
    pub facts: Vec<CheckFact>,
    /// Set when the request failed at the network level (DNS, no route).
    pub error: Option<ProbeError>,
}

/// Probes one URL from this Mac.
pub trait UrlProbe: Send + Sync {
    fn probe<'a>(
        &'a self,
        url: &'a str,
        checks: ProbeChecks,
    ) -> Pin<Box<dyn Future<Output = ProbeResult> + Send + 'a>>;
}

#[cfg(any(test, feature = "fake"))]
pub mod fake {
    //! A [`UrlProbe`] that answers from a table. A URL nobody set up answers
    //! `url.http` with 200 in 100 ms and no certificate or exposed-file fact.

    use std::collections::HashMap;
    use std::time::Duration;

    use serde_json::json;

    use super::*;

    #[derive(Clone, Debug, Default)]
    struct Answer {
        delay: Duration,
        http: Option<ProbeResult>,
        tls: Option<CheckFact>,
        exposed: Option<CheckFact>,
    }

    #[derive(Debug, Default)]
    pub struct FakeProbe {
        answers: HashMap<String, Answer>,
    }

    impl FakeProbe {
        pub fn new() -> Self {
            Self::default()
        }

        fn answer(&mut self, url: &str) -> &mut Answer {
            self.answers.entry(url.to_owned()).or_default()
        }

        pub fn status(mut self, url: &str, status: u16, ms: f64) -> Self {
            self.answer(url).http = Some(http_fact(url, status, ms));
            self
        }

        pub fn error(mut self, url: &str, error: ProbeError) -> Self {
            self.answer(url).http = Some(error_fact(url, error));
            self
        }

        pub fn slow(mut self, url: &str, delay: Duration) -> Self {
            self.answer(url).delay = delay;
            self
        }

        /// A certificate with `days` left and the given verdicts.
        pub fn tls(
            mut self,
            url: &str,
            days: f64,
            expired: bool,
            untrusted: bool,
            mismatch: bool,
        ) -> Self {
            self.answer(url).tls = Some(
                CheckFact::new(URL_TLS, url)
                    .with_value(days, "days")
                    .with_data(json!({
                        "not_after": 0, "expired": expired,
                        "untrusted": untrusted, "mismatch": mismatch,
                    })),
            );
            self
        }

        /// The site serves these key names (`/.env:DB_PASSWORD`); none = clean.
        pub fn exposed(mut self, url: &str, matched_keys: &[&str]) -> Self {
            let n = u32::from(!matched_keys.is_empty());
            self.answer(url).exposed = Some(
                CheckFact::new(URL_EXPOSED, url)
                    .with_value(f64::from(n), "count")
                    .with_data(json!({"exposed": n > 0, "matched_keys": matched_keys})),
            );
            self
        }
    }

    pub fn http_fact(url: &str, status: u16, ms: f64) -> ProbeResult {
        ProbeResult {
            facts: vec![
                CheckFact::new(URL_HTTP, url)
                    .with_value(ms, "ms")
                    .with_data(json!({"status": status, "class": super::http::class_of(status)})),
            ],
            error: None,
        }
    }

    pub fn error_fact(url: &str, error: ProbeError) -> ProbeResult {
        super::http::failed(url, error)
    }

    impl UrlProbe for FakeProbe {
        fn probe<'a>(
            &'a self,
            url: &'a str,
            checks: ProbeChecks,
        ) -> Pin<Box<dyn Future<Output = ProbeResult> + Send + 'a>> {
            Box::pin(async move {
                let answer = self.answers.get(url).cloned().unwrap_or_default();
                tokio::time::sleep(answer.delay).await;
                let mut result = ProbeResult {
                    facts: Vec::new(),
                    error: None,
                };
                if checks.http {
                    let http = answer.http.unwrap_or_else(|| http_fact(url, 200, 100.0));
                    result.error = http.error;
                    result.facts.extend(http.facts);
                }
                if checks.tls {
                    result.facts.extend(answer.tls);
                }
                if checks.exposed {
                    result.facts.extend(answer.exposed);
                }
                result
            })
        }
    }
}
