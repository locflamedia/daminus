//! `url.http`: one GET with `reqwest` over rustls (platform verifier, so the
//! macOS trust store decides). Connect 5 s, whole request 10 s, at most 5
//! redirects. Only the status line and headers are read; the body is dropped
//! unread.
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

use super::{ProbeError, ProbeResult, URL_HTTP, UrlProbe};
use crate::domain::fact::CheckFact;

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
pub const TOTAL_TIMEOUT: Duration = Duration::from_secs(10);
pub const MAX_REDIRECTS: usize = 5;

#[derive(Clone, Debug)]
pub struct HttpProbe {
    client: Option<Client>,
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
        }
    }

    async fn check(&self, url: &str) -> ProbeResult {
        let parsed = match Url::parse(url) {
            Ok(u) if matches!(u.scheme(), "http" | "https") && u.host_str().is_some() => u,
            _ => return failed(url, ProbeError::InvalidUrl),
        };
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
                if last != without_query(&parsed) {
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
    fn probe<'a>(&'a self, url: &'a str) -> Pin<Box<dyn Future<Output = ProbeResult> + Send + 'a>> {
        Box::pin(self.check(url))
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

fn error_kind(e: &reqwest::Error) -> ProbeError {
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
        let r = HttpProbe::new().probe(&format!("{}/", server.uri())).await;
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
        let r = HttpProbe::new().probe(&server.uri()).await;
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
            .probe(&format!("{}/old", server.uri()))
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
        let r = HttpProbe::new().probe(&url).await;
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
            .probe(&format!("{}/loop", server.uri()))
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
        let r = probe.probe(&server.uri()).await;
        assert_eq!(r.error, Some(ProbeError::Timeout));
    }

    #[tokio::test]
    async fn closed_port_is_refused_and_bad_urls_are_invalid() {
        let port = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let r = HttpProbe::new()
            .probe(&format!("http://127.0.0.1:{port}/"))
            .await;
        assert_eq!(r.error, Some(ProbeError::Refused));
        for bad in [
            "ftp://x.example",
            "not a url",
            "file:///etc/passwd",
            "https://",
        ] {
            let r = HttpProbe::new().probe(bad).await;
            assert_eq!(r.error, Some(ProbeError::InvalidUrl), "{bad}");
        }
    }

    #[tokio::test]
    async fn unknown_domain_is_dns() {
        let r = HttpProbe::new()
            .probe("https://daminus-test.invalid/")
            .await;
        assert_eq!(r.error, Some(ProbeError::Dns));
        assert!(r.error.unwrap().is_network());
    }
}
