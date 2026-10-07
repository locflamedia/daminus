//! A live check of one URL while the user types it into the project sheet:
//! the status and time, and the days left on the certificate. The same probe a
//! scan uses, from this Mac; nothing is stored.

use serde::{Deserialize, Serialize};

use super::is_probeable_url;
use crate::domain::fact::CheckFact;
use crate::probe::{ProbeChecks, URL_HTTP, URL_TLS, UrlProbe};

/// Why a URL could not be fetched, as the sheet words it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum UrlFailure {
    /// Not an http(s) address.
    Invalid,
    Dns,
    NoRoute,
    Refused,
    Timeout,
    Tls,
    Redirects,
    Other,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct UrlCheck {
    /// HTTP status, when an answer came.
    pub status: Option<u16>,
    /// Milliseconds to the response header.
    pub ms: Option<f64>,
    /// Days left on the certificate (negative once expired); `https` only.
    pub tls_days: Option<f64>,
    pub failure: Option<UrlFailure>,
}

impl UrlCheck {
    fn failed(failure: UrlFailure) -> Self {
        Self {
            status: None,
            ms: None,
            tls_days: None,
            failure: Some(failure),
        }
    }

    /// Reads the facts of one probe.
    pub fn from_facts(facts: &[CheckFact]) -> Self {
        let http = facts.iter().find(|f| f.check == URL_HTTP);
        let tls = facts.iter().find(|f| f.check == URL_TLS);
        let data = |f: &CheckFact, key: &str| f.data.get(key).cloned();
        let failure = http.and_then(|f| {
            let class = data(f, "class")?;
            if class.as_str() != Some("error") {
                return None;
            }
            Some(match data(f, "error")?.as_str()? {
                "invalid_url" => UrlFailure::Invalid,
                "dns" => UrlFailure::Dns,
                "no_route" => UrlFailure::NoRoute,
                "refused" => UrlFailure::Refused,
                "timeout" => UrlFailure::Timeout,
                "tls" => UrlFailure::Tls,
                "redirects" => UrlFailure::Redirects,
                _ => UrlFailure::Other,
            })
        });
        Self {
            status: http
                .and_then(|f| data(f, "status")?.as_u64())
                .and_then(|s| u16::try_from(s).ok()),
            ms: http.filter(|_| failure.is_none()).and_then(|f| f.value),
            tls_days: tls.and_then(|f| f.value),
            failure,
        }
    }
}

/// Probes `url` with the status and certificate checks.
pub async fn check_url(probe: &dyn UrlProbe, url: &str) -> UrlCheck {
    let url = url.trim();
    if !is_probeable_url(url) {
        return UrlCheck::failed(UrlFailure::Invalid);
    }
    let checks = ProbeChecks {
        http: true,
        tls: true,
        exposed: false,
    };
    UrlCheck::from_facts(&probe.probe(url, checks).await.facts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::probe::ProbeError;
    use crate::probe::fake::FakeProbe;

    #[tokio::test]
    async fn answers_with_status_time_and_certificate_days() {
        let probe = FakeProbe::new()
            .status("https://a.example", 200, 142.0)
            .tls("https://a.example", 61.0, false, false, false);
        let got = check_url(&probe, "https://a.example").await;
        assert_eq!(got.status, Some(200));
        assert_eq!(got.ms, Some(142.0));
        assert_eq!(got.tls_days, Some(61.0));
        assert_eq!(got.failure, None);
    }

    #[tokio::test]
    async fn names_why_a_url_failed() {
        let probe = FakeProbe::new().error("https://gone.example", ProbeError::Dns);
        let got = check_url(&probe, "https://gone.example").await;
        assert_eq!(got.failure, Some(UrlFailure::Dns));
        assert_eq!(got.status, None);
        assert_eq!(got.ms, None);
    }

    #[tokio::test]
    async fn refuses_what_is_not_http() {
        let probe = FakeProbe::new();
        assert_eq!(
            check_url(&probe, "ftp://x.example").await.failure,
            Some(UrlFailure::Invalid)
        );
    }
}
