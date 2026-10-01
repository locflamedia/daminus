//! `url.tls`: the certificate a site presents, read even when nobody would
//! trust it.
//!
//! A normal client stops at a bad certificate and reports an error, which says
//! nothing about *when* it expires. This probe has its own TLS client whose
//! verifier only records: it hands the chain to the real verifier (the macOS
//! trust store through `rustls-platform-verifier`), keeps its verdict, and
//! then accepts the handshake whatever the verdict was. A verifier names only
//! one problem and checks the dates first, so for an out-of-date certificate
//! it is asked a second time for a day inside the validity period: the
//! verdict kept is about trust and names, not about the date. The certificate is
//! never used to carry data; the connection is closed once the handshake is
//! through.
//!
//! Fact: `value` = days until `notAfter` (negative once expired), `unit` =
//! `days`, `data` = `{not_after, expired, untrusted, mismatch}`:
//! - `expired`: today is outside the validity period (read from the
//!   certificate itself, so it does not depend on the verifier's wording);
//! - `mismatch`: the certificate is not valid for the host name asked for;
//! - `untrusted`: the verifier refused the chain for a reason other than the
//!   two above (unknown issuer, self-signed, bad signature…). The macOS
//!   verifier reports an expired chain with a generic error; that is not
//!   counted as untrusted when the certificate is expired.
//!
//! When no handshake took place the fact is unknown instead, with
//! `data.error` the reason (`dns`, `refused`, `timeout`, `tls`…).

use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use reqwest::Url;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{CertificateError, ClientConfig, DigitallySignedStruct, Error, SignatureScheme};
use serde_json::json;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use webpki::EndEntityCert;

use super::cert::{self, Validity};
use super::{ProbeError, URL_TLS};
use crate::domain::fact::CheckFact;
use crate::domain::severity::UnknownReason;

/// Where trust comes from.
#[derive(Clone, Debug)]
enum Trust {
    /// The operating system's trust store.
    Platform,
    /// A verifier given by the caller (tests, with their own roots).
    #[cfg_attr(not(test), allow(dead_code))]
    Given(Arc<dyn ServerCertVerifier>),
}

/// Reads the certificate of one `https` URL.
#[derive(Clone, Debug)]
pub struct TlsCheck {
    trust: Trust,
    connect: Duration,
    total: Duration,
}

impl TlsCheck {
    /// Trust decided by the operating system.
    pub fn platform(connect: Duration, total: Duration) -> Self {
        Self {
            trust: Trust::Platform,
            connect,
            total,
        }
    }

    /// Trust decided by `verifier`, for tests that cannot add a root to the
    /// operating system.
    #[cfg(test)]
    pub fn with_verifier(
        verifier: Arc<dyn ServerCertVerifier>,
        connect: Duration,
        total: Duration,
    ) -> Self {
        Self {
            trust: Trust::Given(verifier),
            connect,
            total,
        }
    }

    /// The `url.tls` fact for `url` (already parsed as `parsed`), and the
    /// network error when no certificate came in.
    pub async fn run(&self, url: &str, parsed: &Url) -> (CheckFact, Option<ProbeError>) {
        match tokio::time::timeout(self.total, self.handshake(parsed)).await {
            Ok(Ok(seen)) => (fact(url, &seen), None),
            Ok(Err(e)) => (failed(url, e), Some(e)),
            Err(_) => (failed(url, ProbeError::Timeout), Some(ProbeError::Timeout)),
        }
    }

    async fn handshake(&self, parsed: &Url) -> Result<Seen, ProbeError> {
        let host = parsed.host_str().ok_or(ProbeError::InvalidUrl)?;
        let bare = host.trim_start_matches('[').trim_end_matches(']');
        let port = parsed.port_or_known_default().unwrap_or(443);
        let name = server_name(bare).ok_or(ProbeError::InvalidUrl)?;

        let provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
        let inner: Arc<dyn ServerCertVerifier> = match &self.trust {
            Trust::Platform => Arc::new(
                rustls_platform_verifier::Verifier::new(provider.clone())
                    .map_err(|_| ProbeError::Other)?,
            ),
            Trust::Given(v) => Arc::clone(v),
        };
        let recorder = Arc::new(Recorder::new(inner));
        let config = ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .map_err(|_| ProbeError::Other)?
            .dangerous()
            .with_custom_certificate_verifier(recorder.clone())
            .with_no_client_auth();

        let tcp = tokio::time::timeout(self.connect, TcpStream::connect((bare, port)))
            .await
            .map_err(|_| ProbeError::Timeout)?
            .map_err(|e| io_kind(&e))?;
        let connected = TlsConnector::from(Arc::new(config)).connect(name.clone(), tcp);
        // A handshake that fails after the certificate came in still tells
        // what the certificate was; one that fails before it does not.
        let result = connected.await;
        match recorder.take() {
            Some((leaf, verdict)) => Ok(Seen {
                leaf,
                verdict,
                name,
            }),
            None => Err(match result {
                Ok(_) => ProbeError::Tls,
                Err(e) => match io_kind(&e) {
                    ProbeError::Other => ProbeError::Tls,
                    kind => kind,
                },
            }),
        }
    }
}

/// The fact for a certificate that came in.
fn fact(url: &str, seen: &Seen) -> CheckFact {
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    match grade(seen, now) {
        Some(g) => CheckFact::new(URL_TLS, url)
            .with_value(g.days, "days")
            .with_data(json!({
                "not_after": g.not_after,
                "expired": g.expired,
                "untrusted": g.untrusted,
                "mismatch": g.mismatch,
            })),
        // A certificate this reader cannot take apart.
        None => CheckFact::new(URL_TLS, url)
            .with_unknown(UnknownReason::Unsupported)
            .with_data(json!({"error": "certificate"})),
    }
}

/// The unknown fact for a probe that got no certificate.
fn failed(url: &str, error: ProbeError) -> CheckFact {
    let reason = match error {
        ProbeError::Timeout => UnknownReason::Timeout,
        ProbeError::Dns | ProbeError::NoRoute | ProbeError::Refused => UnknownReason::Unreachable,
        _ => UnknownReason::Unsupported,
    };
    CheckFact::new(URL_TLS, url)
        .with_unknown(reason)
        .with_data(json!({"error": error.as_str()}))
}

fn server_name(host: &str) -> Option<ServerName<'static>> {
    match host.parse::<IpAddr>() {
        Ok(ip) => Some(ServerName::IpAddress(ip.into())),
        Err(_) => ServerName::try_from(host.to_owned()).ok(),
    }
}

/// What an `io::Error` from connecting or handshaking says about the network.
fn io_kind(e: &std::io::Error) -> ProbeError {
    use std::io::ErrorKind as K;
    match e.kind() {
        K::ConnectionRefused => return ProbeError::Refused,
        K::NetworkUnreachable | K::HostUnreachable => return ProbeError::NoRoute,
        K::TimedOut => return ProbeError::Timeout,
        _ => {}
    }
    let text = e.to_string().to_ascii_lowercase();
    if [
        "lookup address",
        "name or service",
        "name resolution",
        "nodename nor servname",
    ]
    .iter()
    .any(|m| text.contains(m))
    {
        ProbeError::Dns
    } else if text.contains("no route") || text.contains("network is unreachable") {
        ProbeError::NoRoute
    } else {
        ProbeError::Other
    }
}

/// What the verifier saw during one handshake.
#[derive(Debug)]
struct Seen {
    leaf: Vec<u8>,
    verdict: Result<(), Error>,
    name: ServerName<'static>,
}

/// Wraps the verifier that decides trust: asks it, remembers its answer and
/// the end-entity certificate, and accepts the chain whatever the answer was.
/// Signature checks go to the wrapped verifier, so the server still has to
/// prove it holds the certificate's key.
#[derive(Debug)]
struct Recorder {
    inner: Arc<dyn ServerCertVerifier>,
    seen: Mutex<Option<Recorded>>,
}

/// The end-entity certificate (DER) and the verifier's verdict on its chain.
type Recorded = (Vec<u8>, Result<(), Error>);

impl Recorder {
    fn new(inner: Arc<dyn ServerCertVerifier>) -> Self {
        Self {
            inner,
            seen: Mutex::new(None),
        }
    }

    fn take(&self) -> Option<Recorded> {
        self.seen.lock().ok()?.take()
    }
}

impl ServerCertVerifier for Recorder {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, Error> {
        let ask = |at: UnixTime| {
            self.inner
                .verify_server_cert(end_entity, intermediates, server_name, ocsp_response, at)
                .map(|_| ())
        };
        let mut verdict = ask(now);
        // A verifier reports one problem, and the dates come first. Ask again
        // for a day inside the validity period, so an expired certificate is
        // still told apart from an expired and untrusted one.
        if verdict.as_ref().is_err_and(about_dates)
            && let Some(v) = cert::validity(end_entity.as_ref())
            && let Some(mid) = v.not_before.checked_add(v.not_after).map(|sum| sum / 2)
            && let Ok(mid) = u64::try_from(mid)
        {
            verdict = ask(UnixTime::since_unix_epoch(Duration::from_secs(mid)));
        }
        if let Ok(mut seen) = self.seen.lock() {
            *seen = Some((end_entity.as_ref().to_vec(), verdict));
        }
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        self.inner.verify_tls12_signature(message, cert, dss)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        self.inner.verify_tls13_signature(message, cert, dss)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.inner.supported_verify_schemes()
    }
}

/// The reading of one certificate.
#[derive(Debug, PartialEq)]
struct Graded {
    days: f64,
    not_after: i64,
    expired: bool,
    untrusted: bool,
    mismatch: bool,
}

/// Turns what the handshake showed into the fact's numbers. `now` is Unix
/// seconds. `None` when the certificate cannot be read.
fn grade(seen: &Seen, now: i64) -> Option<Graded> {
    let Validity {
        not_before,
        not_after,
    } = cert::validity(&seen.leaf)?;
    let expired = now > not_after || now < not_before;
    let der = CertificateDer::from(seen.leaf.as_slice());
    let (mismatch, unreadable) = match EndEntityCert::try_from(&der) {
        Ok(end) => (
            end.verify_is_valid_for_subject_name(&seen.name).is_err(),
            false,
        ),
        Err(_) => (false, true),
    };
    let untrusted = unreadable
        || match &seen.verdict {
            Ok(()) => false,
            Err(e) => !explained(e, expired),
        };
    // Whole seconds to two decimals of a day: plenty for 14 and 3 day limits.
    let days = ((not_after - now) as f64 / 864.0).floor() / 100.0;
    Some(Graded {
        days,
        not_after,
        expired,
        untrusted,
        mismatch,
    })
}

/// Whether a refusal is about the validity period.
fn about_dates(e: &Error) -> bool {
    matches!(
        e,
        Error::InvalidCertificate(
            CertificateError::Expired
                | CertificateError::ExpiredContext { .. }
                | CertificateError::NotValidYet
                | CertificateError::NotValidYetContext { .. }
        )
    )
}

/// Whether a refusal is only about the validity period or the host name,
/// which `expired` and `mismatch` already say.
fn explained(e: &Error, expired: bool) -> bool {
    match e {
        _ if about_dates(e) => true,
        Error::InvalidCertificate(
            CertificateError::NotValidForName | CertificateError::NotValidForNameContext { .. },
        ) => true,
        // The macOS verifier words an expired chain only as a generic error.
        Error::InvalidCertificate(CertificateError::Other(_)) => expired,
        _ => false,
    }
}

#[cfg(test)]
mod tests;
