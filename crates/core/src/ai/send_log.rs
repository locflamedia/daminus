//! What is written down about each AI send, and how many reviewed sends the
//! user has made. The log line holds the provider, model, token counts, time
//! and outcome. It never holds the question, the payload, a reply, a header or
//! a key.

use super::AiUsage;
use crate::domain::app_state::AppState;
use crate::domain::error::AppError;

/// The review sheet shows for this many sends; after the last one the app
/// offers to stop showing it.
pub const REVIEWED_SENDS_BEFORE_OFFER: u32 = 3;

/// Counts one send that went through the review screen. Returns the new total.
pub fn record_review_send(state: &mut AppState) -> u32 {
    state.ai_reviewed_sends = state.ai_reviewed_sends.saturating_add(1);
    state.ai_reviewed_sends
}

/// Whether the app should now offer to turn the review screen off: from the
/// third reviewed send on.
pub fn should_offer_turning_off_review(count: u32) -> bool {
    count >= REVIEWED_SENDS_BEFORE_OFFER
}

/// How an error is named in the log: its `kind`, never its params.
pub fn error_kind(err: &AppError) -> String {
    serde_json::to_value(&err.code)
        .ok()
        .and_then(|v| v.get("kind").and_then(|k| k.as_str()).map(str::to_owned))
        .unwrap_or_else(|| "unknown".to_owned())
}

/// Writes the one line for a finished send.
pub fn log_send(
    provider: &str,
    model: Option<&str>,
    usage: AiUsage,
    ms: u64,
    outcome: Result<(), &AppError>,
) {
    let outcome = match outcome {
        Ok(()) => "ok".to_owned(),
        Err(e) => error_kind(e),
    };
    tracing::info!(
        target: "daminus::ai",
        provider,
        model = model.unwrap_or("default"),
        tokens_in = usage.tokens_in,
        tokens_out = usage.tokens_out,
        ms,
        outcome = outcome.as_str(),
        "ai send"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::error::ErrorCode;

    #[test]
    fn counter_saturates_and_offer_starts_at_the_third() {
        let mut s = AppState::default();
        let seen: Vec<(u32, bool)> = (0..4)
            .map(|_| {
                let n = record_review_send(&mut s);
                (n, should_offer_turning_off_review(n))
            })
            .collect();
        assert_eq!(seen, [(1, false), (2, false), (3, true), (4, true)]);
        s.ai_reviewed_sends = u32::MAX;
        assert_eq!(record_review_send(&mut s), u32::MAX);
    }

    #[test]
    fn error_kind_names_the_code_only() {
        let e = AppError::from(ErrorCode::ProviderAuth).with_param("detail", "secret");
        assert_eq!(error_kind(&e), "provider_auth");
    }
}
