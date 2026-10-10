//! The reply of the model, read into [`AiAnalysis`], and the send path that
//! produces it ([`analyze`]).
//!
//! The reply is untrusted text. Only a summary, finding ids that the payload
//! offered, a reason and a suggested command are taken from it. Severity is
//! never read: it comes from the checks. A suggested command is text to read
//! and copy; nothing here or anywhere in `ai` runs it.

use std::time::Instant;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use super::payload::Payload;
use super::retry;
use super::send_log::log_send;
use super::summary_stream::SummaryExtractor;
use super::{AiClient, AiEvent, AiUsage};
use crate::domain::error::{AppError, ErrorCode};

/// Most characters kept of the summary.
pub const MAX_SUMMARY_CHARS: usize = 1500;
/// Most characters kept of one finding's reason.
pub const MAX_WHY_CHARS: usize = 1000;
/// Most characters kept of a suggested command.
pub const MAX_COMMAND_CHARS: usize = 500;
/// Most findings kept.
pub const MAX_FINDINGS: usize = 50;
/// Most bytes read from one reply before it is refused.
const MAX_REPLY_BYTES: usize = 256 * 1024;

/// One ranked finding. `id` names a result of the payload; its severity is the
/// check's, found through the payload, not here.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AiFinding {
    pub id: String,
    pub why: String,
    /// Text to read and copy. Never run by Daminus.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_command: Option<String>,
    /// 1 is the most urgent.
    pub rank: u32,
}

/// What the model made of one payload.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AiAnalysis {
    pub summary: String,
    pub findings: Vec<AiFinding>,
}

impl AiAnalysis {
    /// The analysis with the real names back in place of the payload's
    /// placeholders. Call it when showing, never before storing or logging.
    pub fn restore_for_display(&self, payload: &Payload) -> AiAnalysis {
        AiAnalysis {
            summary: clean(&payload.restore(&self.summary), true),
            findings: self
                .findings
                .iter()
                .map(|f| AiFinding {
                    id: f.id.clone(),
                    why: clean(&payload.restore(&f.why), true),
                    suggested_command: f
                        .suggested_command
                        .as_deref()
                        .map(|c| clean(&payload.restore(c), false))
                        .filter(|c| !c.is_empty()),
                    rank: f.rank,
                })
                .collect(),
        }
    }
}

#[derive(Deserialize)]
struct RawAnalysis {
    summary: String,
    #[serde(default)]
    findings: Vec<RawFinding>,
}

#[derive(Deserialize)]
struct RawFinding {
    id: String,
    #[serde(default)]
    why: Option<String>,
    #[serde(default)]
    suggested_command: Option<String>,
}

fn invalid(detail: &str) -> AppError {
    AppError::from(ErrorCode::SchemaInvalid).with_param("detail", detail)
}

/// Bidirectional controls and zero-width characters that can disguise text.
fn is_disguise(c: char) -> bool {
    matches!(
        c,
        '\u{061C}'
            | '\u{200B}'..='\u{200F}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{2069}'
            | '\u{FEFF}'
    )
}

/// Drops control and disguising characters; keeps line breaks only when asked.
fn clean(text: &str, keep_newlines: bool) -> String {
    text.chars()
        .filter(|&c| !is_disguise(c) && (!c.is_control() || (keep_newlines && c == '\n')))
        .collect::<String>()
        .trim()
        .to_owned()
}

fn capped(text: &str, keep_newlines: bool, max_chars: usize) -> String {
    clean(text, keep_newlines).chars().take(max_chars).collect()
}

/// Reads the first JSON object of `text` that has a `summary`. A code fence
/// and prose around the object are ignored, as are unknown fields.
fn first_analysis(text: &str) -> Option<RawAnalysis> {
    text.match_indices('{').find_map(|(i, _)| {
        serde_json::Deserializer::from_str(&text[i..])
            .into_iter::<RawAnalysis>()
            .next()
            .and_then(Result::ok)
    })
}

/// Reads the model's reply. Ids the payload did not offer are dropped, as are
/// repeats; the rest are ranked in the order given.
pub fn parse_analysis(text: &str, payload: &Payload) -> Result<AiAnalysis, AppError> {
    let raw = first_analysis(text).ok_or_else(|| invalid("reply_not_json"))?;
    let summary = capped(&raw.summary, true, MAX_SUMMARY_CHARS);
    if summary.is_empty() {
        return Err(invalid("summary_empty"));
    }
    let mut findings: Vec<AiFinding> = Vec::new();
    for f in raw.findings {
        if findings.len() >= MAX_FINDINGS {
            break;
        }
        let id = f.id.trim();
        if payload.finding_key(id).is_none() || findings.iter().any(|k| k.id == id) {
            continue;
        }
        let command = f
            .suggested_command
            .as_deref()
            .map(|c| capped(c, false, MAX_COMMAND_CHARS))
            .filter(|c| !c.is_empty());
        findings.push(AiFinding {
            id: id.to_owned(),
            why: capped(f.why.as_deref().unwrap_or_default(), true, MAX_WHY_CHARS),
            suggested_command: command,
            rank: u32::try_from(findings.len() + 1).unwrap_or(u32::MAX),
        });
    }
    Ok(AiAnalysis { summary, findings })
}

/// Which provider and model a send goes to, for the log line.
#[derive(Clone, Copy, Debug)]
pub struct SendTarget<'a> {
    pub provider: &'a str,
    /// `None` uses the provider's default model.
    pub model: Option<&'a str>,
}

struct Reply {
    text: String,
    usage: AiUsage,
    ms: u64,
}

/// Whether the reply was not usable JSON, which another try may fix. Other
/// failures (a size limit, a refused call) would only repeat.
fn is_malformed(e: &AppError) -> bool {
    e.code == ErrorCode::SchemaInvalid
        && matches!(
            e.params.get("detail").map(String::as_str),
            Some("reply_not_json" | "summary_empty")
        )
}

/// Sends the payload once and reads the whole reply. Feeds `on_piece` the
/// summary text as it arrives.
async fn send_once(
    client: &dyn AiClient,
    target: &SendTarget<'_>,
    payload: &Payload,
    previewed_hash: &str,
    cancel: &CancellationToken,
    on_piece: &mut (dyn FnMut(&str) + Send),
) -> Result<Reply, AppError> {
    let started = Instant::now();
    let result = read_reply(client, target, payload, previewed_hash, cancel, on_piece).await;
    if cancel.is_cancelled() && result.is_err() {
        // The caller asked for this; it is not a failed send to record.
        return Err(ErrorCode::Cancelled.into());
    }
    let elapsed = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    match &result {
        Ok(r) => log_send(target.provider, target.model, r.usage, r.ms, Ok(())),
        Err(e) => log_send(
            target.provider,
            target.model,
            AiUsage::default(),
            elapsed,
            Err(e),
        ),
    }
    result
}

async fn read_reply(
    client: &dyn AiClient,
    target: &SendTarget<'_>,
    payload: &Payload,
    previewed_hash: &str,
    cancel: &CancellationToken,
    on_piece: &mut (dyn FnMut(&str) + Send),
) -> Result<Reply, AppError> {
    let req = payload.request(target.model.map(str::to_owned), previewed_hash)?;
    let mut rx = client.stream(req, cancel.clone()).await?;
    let mut text = String::new();
    let mut extractor = SummaryExtractor::new();
    while let Some(event) = rx.recv().await {
        match event? {
            AiEvent::Delta(piece) => {
                if text.len() + piece.len() > MAX_REPLY_BYTES {
                    return Err(invalid("reply_too_long"));
                }
                if let Some(summary_part) = extractor.push(&piece) {
                    on_piece(&summary_part);
                }
                text.push_str(&piece);
            }
            AiEvent::Done { usage, ms } => return Ok(Reply { text, usage, ms }),
        }
    }
    if cancel.is_cancelled() {
        return Err(ErrorCode::Cancelled.into());
    }
    Err(invalid("stream_ended"))
}

/// Sends the payload the user previewed and returns the analysis.
///
/// The payload is hashed first; if it no longer matches `previewed_hash`
/// nothing is sent. `on_summary_delta` gets the summary text as it streams. A
/// reply that is not valid JSON is asked for once more; after that the error is
/// returned. A reply that breaks a size limit is not asked for again. A
/// provider that was busy, throttling or briefly broken is tried again up to
/// [`retry::MAX_RETRIES`] times, waiting as [`retry::backoff`] says, but only
/// while nothing has been shown yet: once text has streamed, sending again
/// would repeat it. When `cancel` fires the error is `Cancelled` and nothing
/// is logged.
pub async fn analyze(
    client: &dyn AiClient,
    target: &SendTarget<'_>,
    payload: &Payload,
    previewed_hash: &str,
    cancel: &CancellationToken,
    mut on_summary_delta: impl FnMut(&str) + Send,
) -> Result<AiAnalysis, AppError> {
    payload.verify(previewed_hash)?;
    // What the caller has been given so far, so a second attempt adds only
    // what the first one had not shown.
    let mut shown = String::new();
    let mut retried = false;
    let mut attempts = 0u32;
    loop {
        let mut produced = String::new();
        let mut on_piece = |piece: &str| {
            produced.push_str(piece);
            if produced.len() > shown.len() && produced.starts_with(shown.as_str()) {
                if let Some(new) = produced.get(shown.len()..) {
                    on_summary_delta(new);
                }
                shown.clone_from(&produced);
            }
        };
        let outcome = send_once(
            client,
            target,
            payload,
            previewed_hash,
            cancel,
            &mut on_piece,
        )
        .await
        .and_then(|r| parse_analysis(&r.text, payload));
        match outcome {
            Err(e) if is_malformed(&e) && !retried && !cancel.is_cancelled() => {
                retried = true;
            }
            // Nothing has reached the caller yet, so the same request can go
            // again without the reader seeing the first attempt twice.
            Err(e)
                if retry::worth_retrying(&e)
                    && attempts < retry::MAX_RETRIES
                    && shown.is_empty()
                    && !cancel.is_cancelled() =>
            {
                attempts += 1;
                let wait = retry::backoff(attempts, retry::retry_after(&e), retry::jitter());
                tokio::select! {
                    () = cancel.cancelled() => return Err(ErrorCode::Cancelled.into()),
                    () = tokio::time::sleep(wait) => {}
                }
            }
            other => return other,
        }
    }
}

#[cfg(test)]
mod tests;
