//! Redaction shared by logs, diagnostics and the AI payload.
//!
//! [`redact_secrets`] removes things that look like credentials: known key
//! formats (`sk-`, `ghp_`, `AKIA`, `xox*-`, PEM private keys) and long,
//! high-entropy tokens. Hex strings (git hashes, sha256, UUIDs) and path-like
//! tokens are left alone. [`Redactor`] can also hide IP addresses and host
//! names behind placeholders and map them back in an AI answer.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;

pub const PEM: &str = "[redacted:pem]";
pub const KEY: &str = "[redacted:key]";
pub const TOKEN: &str = "[redacted:token]";

/// Shortest run treated as a possible random secret.
const ENTROPY_MIN_LEN: usize = 20;
/// Bits per character above which an upper+lower+digit token is treated as random.
const ENTROPY_MIN_BITS: f64 = 3.5;
/// Higher bar for single-case letters+digits tokens (`k9x2m4p7…`).
const ENTROPY_MIN_BITS_TWO_CLASS: f64 = 4.0;

struct Pattern {
    re: Regex,
    replacement: &'static str,
}

fn pattern(re: &str, replacement: &'static str) -> Option<Pattern> {
    Regex::new(re).ok().map(|re| Pattern { re, replacement })
}

static KNOWN: LazyLock<Vec<Pattern>> = LazyLock::new(|| {
    [
        pattern(
            r"(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----.*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|\z)",
            PEM,
        ),
        pattern(r"\bsk-[A-Za-z0-9_\-]{16,}", KEY),
        pattern(r"\bgh[pousr]_[A-Za-z0-9]{20,}", KEY),
        pattern(r"\bgithub_pat_[A-Za-z0-9_]{20,}", KEY),
        pattern(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b", KEY),
        pattern(r"\bxox[abposr]-[A-Za-z0-9\-]{10,}", KEY),
    ]
    .into_iter()
    .flatten()
    .collect()
});

static CANDIDATE: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"[A-Za-z0-9+/_\-]{20,}={0,2}").ok());
static IPV4: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b").ok()
});
static IPV6: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"\b(?:[0-9A-Fa-f]{1,4}:){3,7}[0-9A-Fa-f]{1,4}\b").ok());

/// Removes credential-looking substrings. Stateless; safe for any text.
pub fn redact_secrets(text: &str) -> String {
    let mut out = text.to_owned();
    for p in KNOWN.iter() {
        out = p.re.replace_all(&out, p.replacement).into_owned();
    }
    if let Some(re) = CANDIDATE.as_ref() {
        let haystack = out.clone();
        out = re
            .replace_all(&haystack, |c: &regex::Captures<'_>| {
                let token = &c[0];
                let start = c.get(0).map_or(0, |m| m.start());
                // An OpenSSH key fingerprint (`SHA256:<base64>`) is public and needed to compare keys.
                let fingerprint = haystack[..start].ends_with("SHA256:");
                if looks_random(token) && !fingerprint {
                    TOKEN.to_owned()
                } else {
                    token.to_owned()
                }
            })
            .into_owned();
    }
    out
}

/// A long, high-entropy token that is not a hex digest or a path.
///
/// Upper, lower and digits together need [`ENTROPY_MIN_BITS`]. Single-case
/// letters with digits need a 20+ char run without `-`, `_` or `/`, a higher
/// entropy bar and digits scattered through it, so names like
/// `backup20240926folder` stay.
fn looks_random(token: &str) -> bool {
    if token.len() < ENTROPY_MIN_LEN {
        return false;
    }
    if token.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return false;
    }
    if token.contains('/') && looks_like_path(token) {
        return false;
    }
    let body: String = token.chars().filter(|&c| c != '/').collect();
    let has = |f: fn(&char) -> bool| body.chars().any(|c| f(&c));
    let (lower, upper, digit) = (
        has(char::is_ascii_lowercase),
        has(char::is_ascii_uppercase),
        has(char::is_ascii_digit),
    );
    if lower && upper && digit {
        return shannon_bits(&body) >= ENTROPY_MIN_BITS;
    }
    if !(digit && (lower || upper)) {
        return false;
    }
    let longest_run = token
        .split(['-', '_', '/'])
        .map(str::len)
        .max()
        .unwrap_or(0);
    longest_run >= ENTROPY_MIN_LEN
        && shannon_bits(&body) >= ENTROPY_MIN_BITS_TWO_CLASS
        && class_switches(&body) * 5 >= body.len()
}

/// A slash token is a path when it is absolute or every segment reads like a
/// name (`Illuminate/Foundation/Http`, `api/V1/2024`), not by length alone:
/// base64 secrets (`Zx8kQ2/mVb7rT4…`) contain slashes too.
fn looks_like_path(token: &str) -> bool {
    token.starts_with('/') || token.split('/').filter(|s| !s.is_empty()).all(name_like)
}

/// Letters with at most trailing digits (`Invoice2024`, `v2`), in a word-like
/// case pattern (`Kernel`, `HTTP`, `FooBar`), not random mixed case.
fn name_like(seg: &str) -> bool {
    let core = seg.trim_end_matches(|c: char| c.is_ascii_digit());
    if core.chars().any(|c| c.is_ascii_digit()) {
        return false;
    }
    let letters = core.chars().filter(char::is_ascii_alphabetic).count();
    let upper = core.chars().filter(char::is_ascii_uppercase).count();
    upper == letters || upper * 3 <= letters
}

/// How often the text switches between letters and digits.
fn class_switches(s: &str) -> usize {
    let digits: Vec<bool> = s
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.is_ascii_digit())
        .collect();
    digits.windows(2).filter(|w| w[0] != w[1]).count()
}

fn shannon_bits(s: &str) -> f64 {
    let mut freq: BTreeMap<char, usize> = BTreeMap::new();
    for c in s.chars() {
        *freq.entry(c).or_default() += 1;
    }
    let n = s.chars().count() as f64;
    freq.values()
        .map(|&k| k as f64 / n)
        .map(|p| -p * p.log2())
        .sum()
}

/// Redacts secrets and, when asked, hides IPs and host names behind stable
/// placeholders (`[host-1]`, `[ip-1]`) that [`Redactor::restore`] maps back.
#[derive(Debug, Default)]
pub struct Redactor {
    hide_hosts: bool,
    /// Real name → placeholder, for aliases and domains given up front.
    names: Vec<(String, String)>,
    /// Placeholder → real value, for everything hidden so far.
    reverse: BTreeMap<String, String>,
    ips: usize,
}

impl Redactor {
    /// `names` are host aliases and domains to hide when `hide_hosts` is on.
    pub fn new<I, S>(hide_hosts: bool, names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let mut names: Vec<String> = names
            .into_iter()
            .map(Into::into)
            .filter(|n| !n.is_empty())
            .collect();
        names.sort();
        names.dedup();
        // Longest first so `vps-sg-2` is replaced before `vps-sg`.
        names.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| a.cmp(b)));
        let mut r = Self {
            hide_hosts,
            ..Self::default()
        };
        for (i, name) in names.into_iter().enumerate() {
            let placeholder = format!("[host-{}]", i + 1);
            r.reverse.insert(placeholder.clone(), name.clone());
            r.names.push((name, placeholder));
        }
        r
    }

    pub fn redact(&mut self, text: &str) -> String {
        let mut out = redact_secrets(text);
        if !self.hide_hosts {
            return out;
        }
        for (name, placeholder) in &self.names {
            out = replace_word(&out, name, placeholder);
        }
        for re in [IPV4.as_ref(), IPV6.as_ref()].into_iter().flatten() {
            let mut seen: Vec<String> = re.find_iter(&out).map(|m| m.as_str().to_owned()).collect();
            seen.dedup();
            for ip in seen {
                let placeholder = self.ip_placeholder(&ip);
                out = replace_word(&out, &ip, &placeholder);
            }
        }
        out
    }

    fn ip_placeholder(&mut self, ip: &str) -> String {
        if let Some((p, _)) = self.reverse.iter().find(|(_, v)| v.as_str() == ip) {
            return p.clone();
        }
        self.ips += 1;
        let p = format!("[ip-{}]", self.ips);
        self.reverse.insert(p.clone(), ip.to_owned());
        p
    }

    /// Puts real names back into text that used the placeholders (an AI answer).
    pub fn restore(&self, text: &str) -> String {
        self.reverse.iter().fold(text.to_owned(), |acc, (p, real)| {
            acc.replace(p.as_str(), real)
        })
    }

    /// Placeholder → real value table.
    pub fn table(&self) -> &BTreeMap<String, String> {
        &self.reverse
    }
}

/// Replaces `word` where it is not part of a longer name (neighbours are not
/// letters, digits, `-`, `_`, or a `.` followed by more name). A subdomain
/// prefix (`api.` before a hidden domain) is allowed.
fn replace_word(text: &str, word: &str, with: &str) -> String {
    let is_name = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_';
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find(word) {
        let before = rest[..pos].chars().next_back();
        let after_str = &rest[pos + word.len()..];
        let mut after = after_str.chars();
        let next = after.next();
        let bounded_before = before.is_none_or(|c| !is_name(c));
        let bounded_after = match next {
            None => true,
            Some('.') => after.next().is_none_or(|c| !is_name(c)),
            Some(c) => !is_name(c),
        };
        out.push_str(&rest[..pos]);
        out.push_str(if bounded_before && bounded_after {
            with
        } else {
            word
        });
        rest = after_str;
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_formats_are_removed() {
        let cases = [
            (
                "key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv end",
                "key [redacted:key] end",
            ),
            (
                "OPENAI=sk-proj-abcdefghijklmnop1234",
                "OPENAI=[redacted:key]",
            ),
            (
                "token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
                "token [redacted:key]",
            ),
            ("gho_ABCDEFGHIJKLMNOPQRSTU1", "[redacted:key]"),
            (
                "github_pat_11ABCDEFG0123456789_abcdefghijkl",
                "[redacted:key]",
            ),
            ("aws AKIAIOSFODNN7EXAMPLE here", "aws [redacted:key] here"),
            ("slack xoxb-1234567890-abcdefghij", "slack [redacted:key]"),
            (
                "a\n-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\nz",
                "a\n[redacted:pem]\nz",
            ),
            (
                "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA cut off",
                "[redacted:pem]",
            ),
            (
                "x\n-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nlQOYBF0abc\n-----END PGP PRIVATE KEY BLOCK-----\ny",
                "x\n[redacted:pem]\ny",
            ),
        ];
        for (input, want) in cases {
            assert_eq!(redact_secrets(input), want, "{input:?}");
        }
    }

    #[test]
    fn high_entropy_tokens_are_removed() {
        let cases = [
            (
                "DB_PASSWORD=Xk9pQ2mV7rL4tZ8wB3nF",
                "DB_PASSWORD=[redacted:token]",
            ),
            (
                "secret wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                "secret [redacted:token]",
            ),
            (
                "jwt eyJhbGciOiJIUzI1NiJ9x.eyJzdWIiOiIxMjM0NTY3ODkw",
                "jwt [redacted:token].[redacted:token]",
            ),
            (
                "AWS_SECRET_ACCESS_KEY=Zx8kQ2/mVb7rT4pL9wN3/jH6sD1fG5yK0cXa/Eu2",
                "AWS_SECRET_ACCESS_KEY=[redacted:token]",
            ),
            (
                "aws_secret_access_key = 9dRk/2hT+Qm7vXw/Lp4NcZs8/Bf1YjGe6KuHa3Wo",
                "aws_secret_access_key = [redacted:token]",
            ),
            ("pass=k9x2m4p7q1z8w3n6b5v0t7r2", "pass=[redacted:token]"),
        ];
        for (input, want) in cases {
            assert_eq!(redact_secrets(input), want, "{input:?}");
        }
    }

    #[test]
    fn false_positives_stay() {
        let keep = [
            "commit 9fceb02d0ae598e95dc970b74767f19372d61af8",
            "sha256:3f786850e387550fdab836ed7e6dc881de23001b8c1c7a2ca9b3fb0b3e3c0a1b",
            "id 123e4567-e89b-12d3-a456-426614174000",
            "/srv/tiemtra-api/storage/app/public/uploads/Invoice2024.pdf",
            "Illuminate/Foundation/Http/Kernel",
            "container tiemtra-api-db-1 restarted",
            "disk.fs /var/lib/docker 87%",
            "SHA256:q3VfAbCdEfGh1234",
            "ED25519 SHA256:QKt7DKMd0JdnYdbP3oGwMdG17/aTKNc3K8CIDhpS4ZM",
            "host key SHA256:8dkDGfsfQDQlK+l5p6HtYJlA4YXTzeytFcTlIiqvnFM changed",
            "node_modules_cache_directory_name",
            "sk-short",
            "src/Http/Controllers/Api/V1/UserController",
            "backup tiemtra2024backupfolder01 done",
            "pod shop-web-7d9f8b6c4-x2k9p restarted",
            "mysqldump20240926backup",
        ];
        for text in keep {
            assert_eq!(redact_secrets(text), text, "{text:?}");
        }
    }

    #[test]
    fn hosts_and_ips_hidden_and_restored() {
        let mut r = Redactor::new(true, ["vps-sg-2", "vps-sg", "tiemtra.vn"]);
        let text = "vps-sg-2 (203.0.113.12) and vps-sg at 203.0.113.12; see api.tiemtra.vn, tiemtra.vn. vps-sg-20";
        let red = r.redact(text);
        assert_eq!(
            red,
            "[host-2] ([ip-1]) and [host-3] at [ip-1]; see api.[host-1], [host-1]. vps-sg-20"
        );
        let answer = "Free space on [host-2] ([ip-1]) first.";
        assert_eq!(
            r.restore(answer),
            "Free space on vps-sg-2 (203.0.113.12) first."
        );
    }

    #[test]
    fn hosts_kept_when_not_hiding_but_secrets_still_go() {
        let mut r = Redactor::new(false, ["vps-a"]);
        assert_eq!(
            r.redact("vps-a 10.0.0.5 sk-abcdefghijklmnop1234"),
            "vps-a 10.0.0.5 [redacted:key]"
        );
    }
}
