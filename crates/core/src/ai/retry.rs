//! When a failed call is worth sending again, and how long to wait first.
//!
//! Follows Hermes (`agent/retry_utils.py`): exponential backoff with jitter,
//! so many clients that hit the same busy provider do not come back in step,
//! and a `Retry-After` the provider sent is honoured over our own guess.

use std::time::Duration;

use crate::domain::error::{AppError, ErrorCode};

/// How many times a call may be sent again after the first try.
pub const MAX_RETRIES: u32 = 2;
/// The first wait; it doubles with each attempt.
const BASE_DELAY: Duration = Duration::from_secs(1);
/// No single wait is longer than this, whatever the provider asks for.
const MAX_DELAY: Duration = Duration::from_secs(30);
/// Part of the delay that is random, as a thousandth.
const JITTER_PER_MILLE: u64 = 500;

/// Whether sending the very same request again may succeed. Only the failures
/// that pass on their own: the provider is busy, throttling, or broken right
/// now. A refusal the user must act on (no key, no credit, too large) is not
/// retried, since the next try would fail the same way.
pub fn worth_retrying(e: &AppError) -> bool {
    matches!(
        e.code,
        ErrorCode::ProviderRateLimit | ErrorCode::ProviderUnavailable | ErrorCode::Overloaded
    ) && !is_client_status(e)
}

/// A 4xx that reached `ProviderUnavailable` through the text classifier is
/// the caller's own request being wrong, not a provider that is unwell.
fn is_client_status(e: &AppError) -> bool {
    e.params
        .get("status")
        .and_then(|s| s.parse::<u16>().ok())
        .is_some_and(|s| (400..500).contains(&s) && s != 429)
}

/// How long to wait before attempt `attempt` (1 for the first retry):
/// `BASE_DELAY * 2^(attempt-1)`, capped, plus up to 50% jitter. A
/// `Retry-After` the provider sent wins, capped the same way.
pub fn backoff(attempt: u32, retry_after: Option<Duration>, jitter: u64) -> Duration {
    if let Some(wait) = retry_after {
        return wait.min(MAX_DELAY);
    }
    let shift = attempt.saturating_sub(1).min(16);
    let delay = BASE_DELAY.saturating_mul(1u32 << shift).min(MAX_DELAY);
    let spread = delay.mul_f64(JITTER_PER_MILLE as f64 / 1000.0);
    delay + spread.mul_f64((jitter % 1000) as f64 / 1000.0)
}

/// A number in `0..1000` for [`backoff`] to spread the wait with. Hermes
/// seeds its jitter from the clock and a counter so that coarse clocks still
/// decorrelate; the counter does the same here when two calls fail inside the
/// same nanosecond. No randomness crate is needed for a wait of a few seconds.
pub fn jitter() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TICK: AtomicU64 = AtomicU64::new(0);
    let tick = TICK.fetch_add(1, Ordering::Relaxed);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.subsec_nanos().into());
    // Golden-ratio odd multiplier, as Hermes uses, so near ticks scatter.
    (now ^ tick.wrapping_mul(0x9E37_79B9)) % 1000
}

/// The `Retry-After` of a failed call: whole seconds, as every provider we
/// speak to sends it. A date form, or a value we cannot read, is ignored and
/// the backoff is used instead.
pub fn retry_after(e: &AppError) -> Option<Duration> {
    e.params
        .get("retry_after")
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(Duration::from_secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn err(code: ErrorCode) -> AppError {
        AppError::from(code)
    }

    #[test]
    fn only_failures_that_pass_on_their_own_are_retried() {
        for code in [
            ErrorCode::ProviderRateLimit,
            ErrorCode::ProviderUnavailable,
            ErrorCode::Overloaded,
        ] {
            assert!(worth_retrying(&err(code.clone())), "{code:?}");
        }
        for code in [
            ErrorCode::ProviderAuth,
            ErrorCode::ProviderBilling,
            ErrorCode::ProviderKeyMissing,
            ErrorCode::ProviderModelNotFound,
            ErrorCode::ProviderNotConfigured,
            ErrorCode::PayloadTooLarge,
            ErrorCode::ContentPolicy,
            ErrorCode::Cancelled,
        ] {
            assert!(!worth_retrying(&err(code.clone())), "{code:?}");
        }
    }

    #[test]
    fn a_4xx_that_fell_through_to_unavailable_is_not_retried() {
        let bad_request = err(ErrorCode::ProviderUnavailable).with_param("status", "400");
        assert!(!worth_retrying(&bad_request));
        let throttled = err(ErrorCode::ProviderRateLimit).with_param("status", "429");
        assert!(worth_retrying(&throttled));
        let broken = err(ErrorCode::ProviderUnavailable).with_param("status", "500");
        assert!(worth_retrying(&broken));
    }

    #[test]
    fn the_wait_doubles_and_never_passes_the_cap() {
        let plain = |n| backoff(n, None, 0);
        assert_eq!(plain(1), BASE_DELAY);
        assert_eq!(plain(2), BASE_DELAY * 2);
        assert_eq!(plain(3), BASE_DELAY * 4);
        assert_eq!(plain(40), MAX_DELAY);
        for n in 1..=40 {
            assert!(backoff(n, None, 999) <= MAX_DELAY.mul_f64(1.5), "{n}");
        }
    }

    #[test]
    fn jitter_only_adds_and_stays_inside_half_the_wait() {
        let base = backoff(2, None, 0);
        let most = backoff(2, None, 999);
        assert_eq!(base, BASE_DELAY * 2);
        assert!(most > base, "jitter adds time");
        assert!(most <= base.mul_f64(1.5), "and no more than half again");
    }

    #[test]
    fn retry_after_wins_over_the_backoff_but_is_capped() {
        assert_eq!(
            backoff(1, Some(Duration::from_secs(5)), 999),
            Duration::from_secs(5)
        );
        assert_eq!(
            backoff(1, Some(Duration::from_secs(3600)), 0),
            MAX_DELAY,
            "a provider asking for an hour still waits at most the cap"
        );
    }

    #[test]
    fn jitter_stays_in_range_and_moves_between_calls() {
        let seen: std::collections::BTreeSet<u64> = (0..50).map(|_| jitter()).collect();
        assert!(seen.iter().all(|&j| j < 1000), "{seen:?}");
        assert!(seen.len() > 1, "the same value every time is not jitter");
    }

    #[test]
    fn retry_after_is_read_only_when_it_is_whole_seconds() {
        let with =
            |v: &str| retry_after(&err(ErrorCode::ProviderRateLimit).with_param("retry_after", v));
        assert_eq!(with("7"), Some(Duration::from_secs(7)));
        assert_eq!(with(" 7 "), Some(Duration::from_secs(7)));
        assert_eq!(with("Wed, 21 Oct 2026 07:28:00 GMT"), None);
        assert_eq!(with("-1"), None);
        assert_eq!(with(""), None);
        assert_eq!(retry_after(&err(ErrorCode::ProviderRateLimit)), None);
    }
}
