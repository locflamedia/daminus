//! `url.http`: one GET with `reqwest` over rustls (platform verifier, so the
//! macOS trust store decides). Connect 5 s, whole request 10 s, at most 5
//! redirects. Only the status line and headers are read; the body is dropped
//! unread. [`HttpProbe`] also runs `url.tls` and `url.exposed` for the same
//! URL, side by side, when asked to.
//!
//! Fact: `value` = milliseconds until the response headers, `unit` = `ms`,
//! `data` = `{status, class: "2xx"…"5xx", final?}` where `final` is the last
//! URL after redirects without its query or fragment. On failure `data` is
//! `{class: "error", error: …}` and there is no value.

use std::error::Error as _;
use std::future::Future;
use std::pin::Pin;
use std::time::{Duration, Instant};

use reqwest::{Client, Url, redirect};
use serde_json::json;

use super::exposed::ExposedCheck;
use super::tls::TlsCheck;
use super::{ProbeChecks, ProbeError, ProbeResult, URL_HTTP, UrlProbe};
use crate::domain::fact::CheckFact;

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
pub const TOTAL_TIMEOUT: Duration = Duration::from_secs(10);
pub const MAX_REDIRECTS: usize = 5;

#[derive(Clone, Debug)]
pub struct HttpProbe {
    client: Option<Client>,
    tls: TlsCheck,
    exposed: ExposedCheck,
}

impl Default for HttpProbe {
    fn default() -> Self {
        Self::new()
    }
}

impl HttpProbe {
    pub fn new() -> Self {
        Self::with_timeouts(CONNECT_TIMEOUT, TOTAL_TIMEOUT)
    }

    /// Same probe with other timeouts (tests).
    pub fn with_timeouts(connect: Duration, total: Duration) -> Self {
        let client = Client::builder()
            .connect_timeout(connect)
            .timeout(total)
            .redirect(redirect::Policy::limited(MAX_REDIRECTS))
            .user_agent(concat!("Daminus/", env!("CARGO_PKG_VERSION")))
            .no_proxy()
            .build();
        if let Err(e) = &client {
            tracing::error!(error = %e, "could not build the HTTP client");
        }
        Self {
            client: client.ok(),
            tls: TlsCheck::platform(connect, total),
            exposed: ExposedCheck::new(connect, total),
        }
    }

    /// Runs the checks asked for on one URL. `error` of the result is the
    /// network failure of the status request, or, when that was not asked
    /// for, of the first of the others that failed (certificate, exposed files).
    async fn check_all(&self, url: &str, checks: ProbeChecks) -> ProbeResult {
        let parsed = match Url::parse(url) {
            Ok(u) if matches!(u.scheme(), "http" | "https") && u.host_str().is_some() => u,
            _ => {
                let mut r = failed(url, ProbeError::InvalidUrl);
                if !checks.http {
                    r.facts.clear();
                }
                return r;
            }
        };
        let https = parsed.scheme() == "https";
        let (http, tls, exposed) = tokio::join!(
            async {
                match checks.http {
                    true => Some(self.check(url, &parsed).await),
                    false => None,
                }
            },
            async {
                match checks.tls && https {
                    true => Some(self.tls.run(url, &parsed).await),
                    false => None,
                }
            },
            async {
                match checks.exposed {
                    true => Some(self.exposed.run(url, &parsed).await),
                    false => None,
                }
            },
        );
        let mut result = ProbeResult {
            facts: Vec::new(),
            error: None,
        };
        let ran_http = http.is_some();
        if let Some(h) = http {
            result.error = h.error;
            result.facts.extend(h.facts);
        }
        for (fact, error) in [tls, exposed].into_iter().flatten() {
            result.facts.push(fact);
            // The status request decides whether the site was reached; the
            // others only speak for it when it was not asked.
            if !ran_http {
                result.error = result.error.or(error);
            }
        }
        result
    }

    async fn check(&self, url: &str, parsed: &Url) -> ProbeResult {
        let Some(client) = &self.client else {
            return failed(url, ProbeError::Other);
        };
        let started = Instant::now();
        match client.get(parsed.clone()).send().await {
            Ok(resp) => {
                let ms = started.elapsed().as_millis() as f64;
                let status = resp.status().as_u16();
                let mut data = json!({"status": status, "class": class_of(status)});
                let last = without_query(resp.url());
                if last != without_query(parsed) {
                    data["final"] = json!(last);
                }
                drop(resp);
                ProbeResult {
                    facts: vec![
                        CheckFact::new(URL_HTTP, url)
                            .with_value(ms, "ms")
                            .with_data(data),
                    ],
                    error: None,
                }
            }
            Err(e) => failed(url, error_kind(&e)),
        }
    }
}

impl UrlProbe for HttpProbe {
    fn probe<'a>(
        &'a self,
        url: &'a str,
        checks: ProbeChecks,
    ) -> Pin<Box<dyn Future<Output = ProbeResult> + Send + 'a>> {
        Box::pin(self.check_all(url, checks))
    }
}

/// `2xx` … `5xx`, or `other` outside 100–599.
pub(crate) fn class_of(status: u16) -> &'static str {
    match status {
        100..=199 => "1xx",
        200..=299 => "2xx",
        300..=399 => "3xx",
        400..=499 => "4xx",
        500..=599 => "5xx",
        _ => "other",
    }
}

pub(crate) fn failed(url: &str, error: ProbeError) -> ProbeResult {
    ProbeResult {
        facts: vec![
            CheckFact::new(URL_HTTP, url)
                .with_data(json!({"class": "error", "error": error.as_str()})),
        ],
        error: Some(error),
    }
}

/// Scheme, host, port and path only: a query can hold tokens.
fn without_query(url: &Url) -> String {
    let mut u = url.clone();
    u.set_query(None);
    u.set_fragment(None);
    let _ = u.set_username("");
    let _ = u.set_password(None);
    u.to_string()
}

pub(super) fn error_kind(e: &reqwest::Error) -> ProbeError {
    if e.is_redirect() {
        return ProbeError::TooManyRedirects;
    }
    if e.is_timeout() {
        return ProbeError::Timeout;
    }
    let mut source = e.source();
    let mut text = String::new();
    while let Some(s) = source {
        if let Some(io) = s.downcast_ref::<std::io::Error>() {
            match io.kind() {
                std::io::ErrorKind::ConnectionRefused => return ProbeError::Refused,
                std::io::ErrorKind::NetworkUnreachable | std::io::ErrorKind::HostUnreachable => {
                    return ProbeError::NoRoute;
                }
                std::io::ErrorKind::TimedOut => return ProbeError::Timeout,
                _ => {}
            }
        }
        text.push_str(&s.to_string().to_ascii_lowercase());
        text.push('\n');
        source = s.source();
    }
    if text.contains("dns error") || text.contains("failed to lookup address") {
        ProbeError::Dns
    } else if text.contains("certificate") || text.contains("tls") || text.contains("handshake") {
        ProbeError::Tls
    } else if text.contains("no route") || text.contains("network is unreachable") {
        ProbeError::NoRoute
    } else if text.contains("connection refused") {
        ProbeError::Refused
    } else {
        ProbeError::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn fact(r: &ProbeResult) -> &CheckFact {
        &r.facts[0]
    }

    #[tokio::test]
    async fn ok_status_latency_and_no_final_when_not_redirected() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_string("x".repeat(100_000)))
            .mount(&server)
            .await;
        let r = HttpProbe::new()
            .probe(&format!("{}/", server.uri()), ProbeChecks::HTTP)
            .await;
        let f = fact(&r);
        assert_eq!(f.check, "url.http");
        assert_eq!(f.unit.as_deref(), Some("ms"));
        assert!(f.value.is_some());
        assert_eq!(f.data["status"], 200);
        assert_eq!(f.data["class"], "2xx");
        assert!(f.data.get("final").is_none());
        assert_eq!(r.error, None);
    }

    #[tokio::test]
    async fn server_error_is_5xx() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&server)
            .await;
        let r = HttpProbe::new()
            .probe(&server.uri(), ProbeChecks::HTTP)
            .await;
        assert_eq!(fact(&r).data["class"], "5xx");
        assert_eq!(fact(&r).data["status"], 503);
    }

    #[tokio::test]
    async fn follows_redirects_and_records_final_without_query() {
        let server = MockServer::start().await;
        Mock::given(path("/old"))
            .respond_with(
                ResponseTemplate::new(301)
                    .insert_header("location", format!("{}/new?token=s3cret", server.uri())),
            )
            .mount(&server)
            .await;
        Mock::given(path("/new"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;
        let r = HttpProbe::new()
            .probe(&format!("{}/old", server.uri()), ProbeChecks::HTTP)
            .await;
        let f = fact(&r);
        assert_eq!(f.data["status"], 200);
        assert_eq!(f.data["final"], format!("{}/new", server.uri()));
        assert!(!f.data.to_string().contains("s3cret"));
    }

    /// The target is the configured URL as written, so it matches the
    /// project's URL; redacting it for the AI payload is that payload's job.
    #[tokio::test]
    async fn target_is_the_configured_url() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;
        let url = format!("{}/health?key=abc", server.uri());
        let r = HttpProbe::new().probe(&url, ProbeChecks::HTTP).await;
        assert_eq!(fact(&r).target, url);
        assert!(fact(&r).data.get("final").is_none());
    }

    #[tokio::test]
    async fn redirect_loop_stops_after_five() {
        let server = MockServer::start().await;
        Mock::given(path("/loop"))
            .respond_with(
                ResponseTemplate::new(302)
                    .insert_header("location", format!("{}/loop", server.uri())),
            )
            .mount(&server)
            .await;
        let r = HttpProbe::new()
            .probe(&format!("{}/loop", server.uri()), ProbeChecks::HTTP)
            .await;
        assert_eq!(r.error, Some(ProbeError::TooManyRedirects));
        assert_eq!(fact(&r).data["class"], "error");
        assert_eq!(fact(&r).data["error"], "redirects");
        assert!(fact(&r).value.is_none());
    }

    #[tokio::test]
    async fn slow_server_times_out() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(3)))
            .mount(&server)
            .await;
        let probe = HttpProbe::with_timeouts(Duration::from_secs(1), Duration::from_millis(300));
        let r = probe.probe(&server.uri(), ProbeChecks::HTTP).await;
        assert_eq!(r.error, Some(ProbeError::Timeout));
    }

    #[tokio::test]
    async fn closed_port_is_refused_and_bad_urls_are_invalid() {
        let port = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let r = HttpProbe::new()
            .probe(&format!("http://127.0.0.1:{port}/"), ProbeChecks::HTTP)
            .await;
        assert_eq!(r.error, Some(ProbeError::Refused));
        for bad in [
            "ftp://x.example",
            "not a url",
            "file:///etc/passwd",
            "https://",
        ] {
            let r = HttpProbe::new().probe(bad, ProbeChecks::HTTP).await;
            assert_eq!(r.error, Some(ProbeError::InvalidUrl), "{bad}");
        }
    }

    #[tokio::test]
    async fn unknown_domain_is_dns() {
        let r = HttpProbe::new()
            .probe("https://daminus-test.invalid/", ProbeChecks::HTTP)
            .await;
        assert_eq!(r.error, Some(ProbeError::Dns));
        assert!(r.error.unwrap().is_network());
    }

    #[tokio::test]
    async fn the_checks_run_side_by_side_as_asked() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/.env"))
            .respond_with(ResponseTemplate::new(200).set_body_string("APP_KEY=base64:x\n"))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;
        let probe = HttpProbe::new();
        // A plain http site has no certificate: status and exposed files only.
        let r = probe.probe(&server.uri(), ProbeChecks::ALL).await;
        let checks: Vec<&str> = r.facts.iter().map(|f| f.check.as_str()).collect();
        assert_eq!(checks, ["url.http", "url.exposed"]);
        assert_eq!(r.facts[1].value, Some(1.0));
        assert_eq!(r.error, None);
        // Only what is switched on runs.
        let only_exposed = ProbeChecks {
            http: false,
            tls: false,
            exposed: true,
        };
        let r = probe.probe(&server.uri(), only_exposed).await;
        assert_eq!(r.facts.len(), 1);
        assert_eq!(r.facts[0].check, "url.exposed");
        let none = ProbeChecks {
            http: false,
            tls: false,
            exposed: false,
        };
        assert!(!none.any());
        assert!(probe.probe(&server.uri(), none).await.facts.is_empty());
        // The status request decides whether the site was reached.
        let r = probe
            .probe("https://daminus-test.invalid/", ProbeChecks::ALL)
            .await;
        let checks: Vec<&str> = r.facts.iter().map(|f| f.check.as_str()).collect();
        assert_eq!(checks, ["url.http", "url.tls", "url.exposed"]);
        assert_eq!(r.error, Some(ProbeError::Dns));
        assert!(r.facts[1..].iter().all(|f| f.unknown.is_some()));
    }
}
