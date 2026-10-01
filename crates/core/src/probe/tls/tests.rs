//! `url.tls` against local TLS servers whose certificates are generated here:
//! a test CA (trusted through a verifier that holds only that root), and
//! certificates that are valid, expired, self-signed or for another name.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, IsCa,
    Issuer, KeyPair, KeyUsagePurpose, SanType,
};
use rustls::RootCertStore;
use rustls::client::WebPkiServerVerifier;
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use time::{Duration as Span, OffsetDateTime};
use tokio::io::AsyncWriteExt as _;
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;

use super::*;

const DAY: Span = Span::days(1);

fn provider() -> Arc<rustls::crypto::CryptoProvider> {
    Arc::new(rustls::crypto::aws_lc_rs::default_provider())
}

/// A certificate authority the tests trust.
struct Ca {
    der: CertificateDer<'static>,
    issuer: Issuer<'static, KeyPair>,
}

fn ca() -> Ca {
    let mut params = CertificateParams::new(Vec::<String>::new()).unwrap();
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    let mut name = DistinguishedName::new();
    name.push(DnType::CommonName, "Daminus test CA");
    params.distinguished_name = name;
    let key = KeyPair::generate().unwrap();
    let der = params.self_signed(&key).unwrap().der().clone();
    Ca {
        der,
        issuer: Issuer::new(params, key),
    }
}

/// How a leaf certificate is made.
struct Leaf {
    names: Vec<SanType>,
    from: OffsetDateTime,
    until: OffsetDateTime,
}

impl Leaf {
    fn valid_for(names: &[&str], days: i32) -> Self {
        let now = OffsetDateTime::now_utc();
        Self {
            names: names.iter().map(|n| san(n)).collect(),
            from: now - DAY,
            until: now + DAY * days,
        }
    }

    fn params(&self) -> CertificateParams {
        let mut params = CertificateParams::new(Vec::<String>::new()).unwrap();
        params.subject_alt_names = self.names.clone();
        params.not_before = self.from;
        params.not_after = self.until;
        params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        params
    }

    fn signed_by(&self, ca: &Ca) -> (CertificateDer<'static>, PrivateKeyDer<'static>) {
        let key = KeyPair::generate().unwrap();
        let cert = self.params().signed_by(&key, &ca.issuer).unwrap();
        (cert.der().clone(), pkcs8(&key))
    }

    fn self_signed(&self) -> (CertificateDer<'static>, PrivateKeyDer<'static>) {
        let key = KeyPair::generate().unwrap();
        let cert = self.params().self_signed(&key).unwrap();
        (cert.der().clone(), pkcs8(&key))
    }
}

fn san(name: &str) -> SanType {
    match name.parse::<std::net::IpAddr>() {
        Ok(ip) => SanType::IpAddress(ip),
        Err(_) => SanType::DnsName(name.try_into().unwrap()),
    }
}

fn pkcs8(key: &KeyPair) -> PrivateKeyDer<'static> {
    PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key.serialize_der()))
}

/// A TLS server that completes handshakes with `cert` and closes.
async fn serve(cert: CertificateDer<'static>, key: PrivateKeyDer<'static>) -> SocketAddr {
    let config = rustls::ServerConfig::builder_with_provider(provider())
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(vec![cert], key)
        .unwrap();
    let acceptor = TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                return;
            };
            let acceptor = acceptor.clone();
            tokio::spawn(async move {
                if let Ok(mut tls) = acceptor.accept(stream).await {
                    let _ = tls.shutdown().await;
                }
            });
        }
    });
    addr
}

/// A check that trusts only `ca`.
fn trusting(ca: &Ca) -> TlsCheck {
    let mut roots = RootCertStore::empty();
    roots.add(ca.der.clone()).unwrap();
    let verifier = WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider())
        .build()
        .unwrap();
    TlsCheck::with_verifier(verifier, Duration::from_secs(5), Duration::from_secs(10))
}

async fn run(check: &TlsCheck, url: &str) -> (CheckFact, Option<ProbeError>) {
    check.run(url, &Url::parse(url).unwrap()).await
}

/// `(expired, untrusted, mismatch)` of a `url.tls` fact.
fn flags(f: &CheckFact) -> (bool, bool, bool) {
    let flag = |k: &str| {
        f.data[k]
            .as_bool()
            .unwrap_or_else(|| panic!("{k} in {f:?}"))
    };
    (flag("expired"), flag("untrusted"), flag("mismatch"))
}

fn days(f: &CheckFact) -> f64 {
    f.value.unwrap_or_else(|| panic!("no value in {f:?}"))
}

#[tokio::test]
async fn a_trusted_certificate_reports_the_days_left_and_no_flag() {
    let ca = ca();
    let (cert, key) = Leaf::valid_for(&["localhost"], 30).signed_by(&ca);
    let addr = serve(cert, key).await;
    let url = format!("https://localhost:{}/", addr.port());
    let (f, err) = run(&trusting(&ca), &url).await;
    assert_eq!(err, None);
    assert_eq!(
        (f.check.as_str(), f.target.as_str()),
        ("url.tls", url.as_str())
    );
    assert_eq!(f.unit.as_deref(), Some("days"));
    assert!((29.9..=30.0).contains(&days(&f)), "{}", days(&f));
    assert_eq!(flags(&f), (false, false, false));
    let not_after = f.data["not_after"].as_i64().unwrap();
    assert!((not_after - OffsetDateTime::now_utc().unix_timestamp() - 30 * 86_400).abs() < 60);
    assert_eq!(f.unknown, None);
}

#[tokio::test]
async fn an_ip_address_site_is_checked_against_the_ip_names() {
    let ca = ca();
    let (cert, key) = Leaf::valid_for(&["127.0.0.1"], 10).signed_by(&ca);
    let addr = serve(cert, key).await;
    let (f, _) = run(
        &trusting(&ca),
        &format!("https://127.0.0.1:{}", addr.port()),
    )
    .await;
    assert_eq!(flags(&f), (false, false, false), "{f:?}");
    assert!((9.9..=10.0).contains(&days(&f)));
}

/// The point of the probe: the date is read although the certificate is expired.
#[tokio::test]
async fn an_expired_certificate_still_gives_its_not_after() {
    let ca = ca();
    let now = OffsetDateTime::now_utc();
    let mut leaf = Leaf::valid_for(&["localhost"], 1);
    leaf.from = now - DAY * 400;
    leaf.until = now - DAY * 5;
    let (cert, key) = leaf.signed_by(&ca);
    let addr = serve(cert, key).await;
    let (f, err) = run(
        &trusting(&ca),
        &format!("https://localhost:{}", addr.port()),
    )
    .await;
    assert_eq!(err, None);
    assert_eq!(flags(&f), (true, false, false), "{f:?}");
    assert!((-5.1..=-4.9).contains(&days(&f)), "{}", days(&f));
    assert_eq!(
        f.data["not_after"].as_i64().unwrap(),
        leaf.until.unix_timestamp()
    );
}

#[tokio::test]
async fn a_self_signed_certificate_is_untrusted_and_still_read() {
    let (cert, key) = Leaf::valid_for(&["localhost"], 20).self_signed();
    let addr = serve(cert, key).await;
    let ca = ca();
    let (f, _) = run(
        &trusting(&ca),
        &format!("https://localhost:{}", addr.port()),
    )
    .await;
    assert_eq!(flags(&f), (false, true, false), "{f:?}");
    assert!((19.9..=20.0).contains(&days(&f)));

    // Self-signed and expired: both flags, and the (past) date.
    let mut leaf = Leaf::valid_for(&["localhost"], 1);
    leaf.from = OffsetDateTime::now_utc() - DAY * 100;
    leaf.until = OffsetDateTime::now_utc() - DAY * 2;
    let (cert, key) = leaf.self_signed();
    let addr = serve(cert, key).await;
    let (f, _) = run(
        &trusting(&ca),
        &format!("https://localhost:{}", addr.port()),
    )
    .await;
    assert_eq!(flags(&f), (true, true, false), "{f:?}");
    assert!(days(&f) < -1.9 && days(&f) > -2.1, "{}", days(&f));
}

#[tokio::test]
async fn a_certificate_for_another_name_is_a_mismatch_not_untrusted() {
    let ca = ca();
    let (cert, key) = Leaf::valid_for(&["other.example"], 30).signed_by(&ca);
    let addr = serve(cert, key).await;
    let (f, _) = run(
        &trusting(&ca),
        &format!("https://localhost:{}", addr.port()),
    )
    .await;
    assert_eq!(flags(&f), (false, false, true), "{f:?}");
}

/// The production path: the operating system's trust store does not know the
/// test CA, so the certificate is untrusted, and its date is read all the same.
#[tokio::test]
async fn the_platform_verifier_refuses_an_unknown_issuer() {
    let ca = ca();
    let (cert, key) = Leaf::valid_for(&["localhost"], 30).signed_by(&ca);
    let addr = serve(cert, key).await;
    let check = TlsCheck::platform(Duration::from_secs(5), Duration::from_secs(10));
    let (f, err) = run(&check, &format!("https://localhost:{}", addr.port())).await;
    assert_eq!(err, None);
    let (expired, untrusted, _) = flags(&f);
    assert!(untrusted && !expired, "{f:?}");
    assert!((29.9..=30.0).contains(&days(&f)));
}

#[tokio::test]
async fn failures_before_a_certificate_are_unknown_with_the_reason() {
    // Nothing listens.
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let ca = ca();
    let check = trusting(&ca);
    let (f, err) = run(&check, &format!("https://127.0.0.1:{port}")).await;
    assert_eq!(err, Some(ProbeError::Refused));
    assert_eq!(f.unknown, Some(UnknownReason::Unreachable));
    assert_eq!(f.data["error"], "refused");
    assert_eq!(f.value, None);

    // A server that is not TLS.
    let plain = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let plain_port = plain.local_addr().unwrap().port();
    tokio::spawn(async move {
        while let Ok((mut s, _)) = plain.accept().await {
            let _ = s.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n").await;
        }
    });
    let (f, err) = run(&check, &format!("https://127.0.0.1:{plain_port}")).await;
    assert_eq!(err, Some(ProbeError::Tls));
    assert_eq!(f.unknown, Some(UnknownReason::Unsupported));
    assert_eq!(f.data["error"], "tls");

    // A server that never answers.
    let silent = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let silent_port = silent.local_addr().unwrap().port();
    tokio::spawn(async move {
        let mut held = Vec::new();
        while let Ok((s, _)) = silent.accept().await {
            held.push(s);
        }
    });
    let quick = {
        let mut c = trusting(&ca);
        c.total = Duration::from_millis(300);
        c
    };
    let (f, err) = run(&quick, &format!("https://127.0.0.1:{silent_port}")).await;
    assert_eq!(err, Some(ProbeError::Timeout));
    assert_eq!(f.unknown, Some(UnknownReason::Timeout));

    // A name that does not exist.
    let (f, err) = run(&check, "https://daminus-test.invalid/").await;
    assert_eq!(err, Some(ProbeError::Dns));
    assert_eq!(f.unknown, Some(UnknownReason::Unreachable));
}

#[test]
fn only_validity_and_name_refusals_are_explained_by_the_flags() {
    use rustls::{CertificateError as C, Error as E};
    let other = || C::Other(rustls::OtherError(Arc::new(std::fmt::Error)));
    let cases: Vec<(E, bool, bool)> = vec![
        (E::InvalidCertificate(C::Expired), false, true),
        (E::InvalidCertificate(C::NotValidForName), false, true),
        (E::InvalidCertificate(C::UnknownIssuer), false, false),
        (E::InvalidCertificate(C::BadSignature), false, false),
        // A generic error is only the expiry when the certificate is expired.
        (E::InvalidCertificate(other()), false, false),
        (E::InvalidCertificate(other()), true, true),
        (E::General("boom".into()), true, false),
    ];
    for (e, expired, want) in cases {
        assert_eq!(explained(&e, expired), want, "{e:?} expired={expired}");
    }
}

#[tokio::test]
async fn a_certificate_nobody_can_read_is_unknown_not_a_crash() {
    let seen = Seen {
        leaf: b"not a certificate".to_vec(),
        verdict: Ok(()),
        name: ServerName::try_from("localhost").unwrap(),
    };
    assert_eq!(grade(&seen, 1_800_000_000), None);
    let f = fact("https://x.example", &seen);
    assert_eq!(f.unknown, Some(UnknownReason::Unsupported));
}
