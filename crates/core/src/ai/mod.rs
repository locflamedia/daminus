//! The AI layer's shared types: the request, the events of a reply, the
//! [`AiClient`] seam (a `genai` client and the Claude Code CLI implement it)
//! and [`SecretString`] for keys. The core has no secret store: callers pass
//! the key in.

pub mod profiles;

#[cfg(any(test, feature = "fake"))]
pub mod fake;

use std::fmt;
use std::future::Future;
use std::pin::Pin;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::domain::error::AppError;

/// A boxed future, so [`AiClient`] can be used as `dyn AiClient`.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// A key or token. Prints as `***` in `Debug` and `Display`, is not
/// `Serialize`, and gives its value only through [`SecretString::expose`].
#[derive(Clone, PartialEq, Eq)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The value. Use it only to build the request that needs it.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("***")
    }
}

impl fmt::Display for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("***")
    }
}

/// One question to a model.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AiRequest {
    pub system: String,
    pub user: String,
    /// `None` uses the profile's default model.
    pub model: Option<String>,
}

/// Tokens counted by the provider, or estimated when it does not say.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AiUsage {
    pub tokens_in: u32,
    pub tokens_out: u32,
}

/// What a reply reports while it is under way.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AiEvent {
    /// A piece of the answer text, in order.
    Delta(String),
    /// The last event of a good reply.
    Done { usage: AiUsage, ms: u64 },
}

/// The events of one reply. It ends after `Done` or after the first `Err`; it
/// also ends, without `Done`, when the request is cancelled.
pub type AiStream = mpsc::Receiver<Result<AiEvent, AppError>>;

/// One provider, ready to be asked. Built with its key and endpoint already.
pub trait AiClient: Send + Sync {
    /// Starts a reply. Errors before the first event (bad key, unreachable)
    /// come back here; later ones arrive on the stream.
    fn stream(
        &self,
        req: AiRequest,
        cancel: CancellationToken,
    ) -> BoxFuture<'_, Result<AiStream, AppError>>;

    /// The model names the provider offers.
    fn list_models(&self) -> BoxFuture<'_, Result<Vec<String>, AppError>>;

    /// Checks the key and endpoint with the smallest call that can.
    fn test(&self) -> BoxFuture<'_, Result<(), AppError>>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_never_prints() {
        let s = SecretString::new("sk-ant-very-secret");
        assert_eq!(s.expose(), "sk-ant-very-secret");
        for text in [
            format!("{s}"),
            format!("{s:?}"),
            format!("{s:#?}"),
            format!("{:?}", Some(&s)),
            format!("{:?}", AiHolder { key: s.clone() }),
        ] {
            assert!(!text.contains("secret"), "{text}");
            assert!(text.contains("***"));
        }
    }

    #[derive(Debug)]
    #[allow(dead_code)]
    struct AiHolder {
        key: SecretString,
    }
}
