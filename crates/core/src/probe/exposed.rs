//! `url.exposed`: whether `/.env` or `/.git/HEAD` can be downloaded from a
//! site. A deploy that copies the project folder into the web root, or a
//! server block that serves dotfiles, publishes the database password and the
//! application key to anyone.
//!
//! Each file is requested once with GET. A redirect is followed only while it
//! stays on the site's own host (a login page on another host says nothing
//! about this site), at most five times. Only a `200` whose first 4 KiB look
//! like the file counts: an `.env` has `KEY=value` lines (an HTML page, such as
//! a single-page app answering every path, does not), a `HEAD` is `ref: refs/…`
//! or a commit hash. The body is read no further than 4 KiB, never stored, and
//! never leaves this module: the fact holds only the names of the keys that
//! matched.
//!
//! Fact: `target` = the URL as configured, `value` = how many of the two files
//! are exposed (0: looked, found none), `unit` = `count`, `data` =
//! `{exposed, matched_keys}` with entries like `/.env:DB_PASSWORD` (the key's
//! name, never its value) or `/.git/HEAD:ref`. When a request failed and
//! nothing was found, the fact is unknown (`unreachable`, or `timeout`) with
//! `data.error`.

use std::time::Duration;

use reqwest::{Client, Url, redirect};
use serde_json::json;

use super::http::error_kind;
use super::{ProbeError, URL_EXPOSED};
use crate::domain::fact::CheckFact;
use crate::domain::severity::UnknownReason;

/// The files asked for, relative to the site's root.
const FILES: [&str; 2] = ["/.env", "/.git/HEAD"];
/// Most of a response read.
const MAX_BODY: usize = 4096;
/// Most key names kept in a fact.
const MAX_KEYS: usize = 12;
const MAX_REDIRECTS: usize = 5;

#[derive(Clone, Debug)]
pub struct ExposedCheck {
    client: Option<Client>,
}

/// What one file said.
#[derive(Debug, PartialEq)]
enum Found {
    Exposed(Vec<String>),
    Clean,
    /// A redirect that was not followed: the file behind it was never read.
    /// The text is the `data.error` of the unknown fact.
    NotFollowed(&'static str),
    Failed(ProbeError),
}

impl ExposedCheck {
    pub fn new(connect: Duration, total: Duration) -> Self {
        let client = Client::builder()
            .connect_timeout(connect)
            .timeout(total)
            .redirect(redirect::Policy::custom(|attempt| {
                let same_host = attempt.previous().first().is_some_and(|first| {
                    first.host_str().map(str::to_ascii_lowercase)
                        == attempt.url().host_str().map(str::to_ascii_lowercase)
                });
                if attempt.previous().len() >= MAX_REDIRECTS || !same_host {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .user_agent(concat!("Daminus/", env!("CARGO_PKG_VERSION")))
            .no_proxy()
            .build();
        if let Err(e) = &client {
            tracing::error!(error = %e, "could not build the exposed-files client");
        }
        Self {
            client: client.ok(),
        }
    }

    /// The `url.exposed` fact for `url` (already parsed as `parsed`), and the
    /// network error when nothing could be asked.
    pub async fn run(&self, url: &str, parsed: &Url) -> (CheckFact, Option<ProbeError>) {
        let Some(client) = &self.client else {
            return (failed(url, ProbeError::Other), Some(ProbeError::Other));
        };
        let (env, git) = tokio::join!(ask(client, parsed, FILES[0]), ask(client, parsed, FILES[1]));
        let all = [env, git];
        let mut keys: Vec<String> = Vec::new();
        let mut exposed = 0_u32;
        let mut error = None;
        let mut not_followed = None;
        for found in all {
            match found {
                Found::Exposed(k) => {
                    exposed += 1;
                    keys.extend(k);
                }
                Found::Clean => {}
                Found::NotFollowed(why) => not_followed = not_followed.or(Some(why)),
                Found::Failed(e) => error = error.or(Some(e)),
            }
        }
        keys.truncate(MAX_KEYS);
        match (exposed, error) {
            (0, Some(e)) => (failed(url, e), Some(e)),
            // Nothing found, but a file was never read: not a clean result.
            (0, None) if not_followed.is_some() => (
                CheckFact::new(URL_EXPOSED, url)
                    .with_unknown(UnknownReason::Unsupported)
                    .with_data(json!({"error": not_followed})),
                None,
            ),
            _ => (
                CheckFact::new(URL_EXPOSED, url)
                    .with_value(f64::from(exposed), "count")
                    .with_data(json!({"exposed": exposed > 0, "matched_keys": keys})),
                None,
            ),
        }
    }
}

fn failed(url: &str, error: ProbeError) -> CheckFact {
    let reason = match error {
        ProbeError::Timeout => UnknownReason::Timeout,
        _ => UnknownReason::Unreachable,
    };
    CheckFact::new(URL_EXPOSED, url)
        .with_unknown(reason)
        .with_data(json!({"error": error.as_str()}))
}

/// Requests `file` at the root of `site` and says what it found.
async fn ask(client: &Client, site: &Url, file: &str) -> Found {
    let mut url = site.clone();
    url.set_path(file);
    url.set_query(None);
    url.set_fragment(None);
    let _ = url.set_username("");
    let _ = url.set_password(None);
    let mut resp = match client.get(url).send().await {
        Ok(r) => r,
        Err(e) => return Found::Failed(error_kind(&e)),
    };
    if resp.status().is_redirection() {
        // Judged against the response's own address: earlier redirects on
        // the same host may already have moved it.
        let here = resp.url().clone();
        let target = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| here.join(v).ok());
        return match target {
            Some(t)
                if t.host_str().map(str::to_ascii_lowercase)
                    != here.host_str().map(str::to_ascii_lowercase) =>
            {
                Found::NotFollowed("redirect_other_host")
            }
            Some(_) => Found::NotFollowed(ProbeError::TooManyRedirects.as_str()),
            None => Found::Clean,
        };
    }
    if resp.status().as_u16() != 200 {
        return Found::Clean;
    }
    let mut body = Vec::with_capacity(MAX_BODY);
    while body.len() < MAX_BODY {
        match resp.chunk().await {
            Ok(Some(chunk)) => {
                let room = MAX_BODY - body.len();
                body.extend_from_slice(&chunk[..chunk.len().min(room)]);
            }
            Ok(None) => break,
            // A body cut short still has its first bytes to judge.
            Err(_) => break,
        }
    }
    drop(resp);
    let keys = matched_keys(file, &String::from_utf8_lossy(&body));
    if keys.is_empty() {
        Found::Clean
    } else {
        Found::Exposed(keys)
    }
}

/// The key names `body` shows if it is the file `path`, as `path:KEY`.
fn matched_keys(path: &str, body: &str) -> Vec<String> {
    let keys: Vec<String> = match path {
        "/.env" => env_keys(body),
        "/.git/HEAD" => git_head(body).into_iter().map(String::from).collect(),
        _ => Vec::new(),
    };
    keys.into_iter().map(|k| format!("{path}:{k}")).collect()
}

/// Names of the `KEY=value` lines of a dotenv file, at most [`MAX_KEYS`],
/// each once. A name is a letter or `_` then letters, digits, `_` or `.`, at
/// least two characters, and may be followed by spaces before the `=`. Empty
/// for anything that does not read as one: HTML, binary data, or text
/// without such lines.
fn env_keys(body: &str) -> Vec<String> {
    let body = body.strip_prefix('\u{feff}').unwrap_or(body);
    let head = body.trim_start();
    if head.starts_with('<') || body.contains('\0') {
        return Vec::new();
    }
    let mut keys: Vec<String> = Vec::new();
    for line in body.lines() {
        let line = line.trim_start();
        let line = line.strip_prefix("export ").unwrap_or(line).trim_start();
        let Some((name, _)) = line.split_once('=') else {
            continue;
        };
        let name = name.trim_end();
        let valid = name.len() >= 2
            && name.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_')
            && name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
        if valid && !keys.iter().any(|k| k == name) && keys.len() < MAX_KEYS {
            keys.push(name.to_owned());
        }
    }
    keys
}

/// `ref` for `ref: refs/heads/main`, `sha` for a bare commit hash.
fn git_head(body: &str) -> Option<&'static str> {
    let first = body.lines().next()?.trim();
    if first.starts_with("ref: refs/") {
        Some("ref")
    } else if matches!(first.len(), 40 | 64) && first.bytes().all(|b| b.is_ascii_hexdigit()) {
        Some("sha")
    } else {
        None
    }
}

#[cfg(test)]
mod tests;
