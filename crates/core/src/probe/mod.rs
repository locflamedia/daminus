//! Checks run from this Mac against a project's URLs (`url.*`, host `@local`).
//!
//! Phase 3 has `url.http`; `url.tls` and `url.exposed` join in phase 4. The
//! probe never reads or stores a response body.

mod http;

use std::future::Future;
use std::pin::Pin;

pub use http::HttpProbe;

use crate::domain::fact::CheckFact;

/// The check id of the HTTP status probe.
pub const URL_HTTP: &str = "url.http";

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
    fn probe<'a>(&'a self, url: &'a str) -> Pin<Box<dyn Future<Output = ProbeResult> + Send + 'a>>;
}

#[cfg(any(test, feature = "fake"))]
pub mod fake {
    //! A [`UrlProbe`] that answers from a table; unknown URLs return 200 in 100 ms.

    use std::collections::HashMap;
    use std::time::Duration;

    use serde_json::json;

    use super::*;

    #[derive(Debug, Default)]
    pub struct FakeProbe {
        answers: HashMap<String, (Duration, ProbeResult)>,
    }

    impl FakeProbe {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn status(mut self, url: &str, status: u16, ms: f64) -> Self {
            self.answers
                .insert(url.to_owned(), (Duration::ZERO, http_fact(url, status, ms)));
            self
        }

        pub fn error(mut self, url: &str, error: ProbeError) -> Self {
            self.answers
                .insert(url.to_owned(), (Duration::ZERO, error_fact(url, error)));
            self
        }

        pub fn slow(mut self, url: &str, delay: Duration) -> Self {
            self.answers
                .insert(url.to_owned(), (delay, http_fact(url, 200, 100.0)));
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
        ) -> Pin<Box<dyn Future<Output = ProbeResult> + Send + 'a>> {
            Box::pin(async move {
                let (delay, result) = self
                    .answers
                    .get(url)
                    .cloned()
                    .unwrap_or_else(|| (Duration::ZERO, http_fact(url, 200, 100.0)));
                tokio::time::sleep(delay).await;
                result
            })
        }
    }
}
