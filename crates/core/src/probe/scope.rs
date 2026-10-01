//! Warns at setup about URLs that only mean something on this Mac.
//!
//! A project URL such as `http://localhost:3000` or `http://10.0.0.5` is
//! probed from this Mac, so what it reports is this Mac's own view (a dev
//! server, the office network), not the site's. Setup shows the warning next
//! to the URL; the URL is still saved and probed if the user keeps it.
//!
//! Only the text of the URL is judged: a name that resolves to a private
//! address is not caught, because setup must not wait for DNS.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use reqwest::Url;
use serde::{Deserialize, Serialize};

/// Why a URL is only reachable from here.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum UrlWarning {
    /// `localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`: this machine itself.
    Loopback,
    /// A private network: `10/8`, `172.16/12`, `192.168/16`, `100.64/10`,
    /// `fc00::/7`, `.local` / `.internal` / `.lan` names and single-word hosts.
    PrivateNetwork,
    /// `169.254/16`, `fe80::/10`: an address only valid on the local link.
    LinkLocal,
}

/// The warning for `url`, or `None` when it looks public (or is not a URL
/// with a host at all, which the URL check reports separately).
pub fn url_warning(url: &str) -> Option<UrlWarning> {
    let parsed = Url::parse(url.trim()).ok()?;
    let host = parsed.host_str()?;
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    match bare.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => v4(ip),
        Ok(IpAddr::V6(ip)) => v6(ip),
        Err(_) => name(bare),
    }
}

fn v4(ip: Ipv4Addr) -> Option<UrlWarning> {
    let [a, b, ..] = ip.octets();
    if ip.is_loopback() || ip.is_unspecified() {
        Some(UrlWarning::Loopback)
    } else if ip.is_link_local() {
        Some(UrlWarning::LinkLocal)
    } else if ip.is_private() || (a == 100 && (64..=127).contains(&b)) {
        Some(UrlWarning::PrivateNetwork)
    } else {
        None
    }
}

fn v6(ip: Ipv6Addr) -> Option<UrlWarning> {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return v4(mapped);
    }
    let first = ip.segments()[0];
    if ip.is_loopback() || ip.is_unspecified() {
        Some(UrlWarning::Loopback)
    } else if first & 0xffc0 == 0xfe80 {
        Some(UrlWarning::LinkLocal)
    } else if first & 0xfe00 == 0xfc00 {
        Some(UrlWarning::PrivateNetwork)
    } else {
        None
    }
}

fn name(host: &str) -> Option<UrlWarning> {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") {
        return Some(UrlWarning::Loopback);
    }
    let private_suffix = ["local", "internal", "lan", "home.arpa", "intranet", "corp"]
        .iter()
        .any(|s| host.ends_with(&format!(".{s}")));
    // A name with no dot is resolved by the local network's own search domain.
    if private_suffix || !host.contains('.') {
        Some(UrlWarning::PrivateNetwork)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::UrlWarning::{LinkLocal, Loopback, PrivateNetwork};
    use super::*;

    #[test]
    fn warns_about_urls_that_only_this_mac_can_reach() {
        let cases: &[(&str, Option<UrlWarning>)] = &[
            ("https://shop.example.com", None),
            ("https://shop.example.com:8443/app?x=1", None),
            ("http://203.0.113.9", None),
            ("http://[2001:db8::1]/", None),
            ("http://localhost:3000", Some(Loopback)),
            ("http://LOCALHOST.", Some(Loopback)),
            ("http://api.localhost", Some(Loopback)),
            ("http://127.0.0.1", Some(Loopback)),
            ("http://127.8.8.8:80", Some(Loopback)),
            ("http://0.0.0.0", Some(Loopback)),
            ("http://[::1]:8080", Some(Loopback)),
            ("http://[::ffff:127.0.0.1]", Some(Loopback)),
            ("http://10.0.0.5", Some(PrivateNetwork)),
            ("http://172.16.0.1", Some(PrivateNetwork)),
            ("http://172.31.255.255", Some(PrivateNetwork)),
            ("http://172.32.0.1", None),
            ("http://192.168.1.20", Some(PrivateNetwork)),
            ("http://100.64.0.1", Some(PrivateNetwork)),
            ("http://100.128.0.1", None),
            ("http://[fd12:3456::1]", Some(PrivateNetwork)),
            ("http://[::ffff:10.1.2.3]", Some(PrivateNetwork)),
            ("http://nas.local", Some(PrivateNetwork)),
            ("https://db.internal/", Some(PrivateNetwork)),
            ("http://router.home.arpa", Some(PrivateNetwork)),
            ("http://intranet", Some(PrivateNetwork)),
            ("http://169.254.169.254/latest", Some(LinkLocal)),
            ("http://[fe80::1]", Some(LinkLocal)),
            // Not a URL with a host: nothing to warn about here.
            ("not a url", None),
            ("", None),
            ("file:///etc/hosts", None),
        ];
        for (url, want) in cases {
            assert_eq!(url_warning(url), *want, "{url}");
        }
        // Surrounding spaces, as typed in a form.
        assert_eq!(url_warning("  http://10.0.0.5  "), Some(PrivateNetwork));
    }
}
