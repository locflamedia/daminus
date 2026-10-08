//! A scripted [`AiClient`] for tests: replays fixed deltas, or fails the way a
//! provider would.

use std::sync::Mutex;

use tokio_util::sync::CancellationToken;

use super::{AiClient, AiEvent, AiRequest, AiStream, AiUsage, BoxFuture};
use crate::domain::error::{AppError, ErrorCode};

/// What a scripted stream does.
#[derive(Clone, Debug)]
pub enum FakeReply {
    /// Sends each text as a `Delta`, then `Done`.
    Deltas(Vec<String>),
    /// Fails before any event.
    Fail(ErrorCode),
    /// Sends the deltas, then the error on the stream.
    FailAfter(Vec<String>, ErrorCode),
}

#[derive(Debug)]
pub struct FakeAiClient {
    reply: FakeReply,
    models: Result<Vec<String>, ErrorCode>,
    seen: Mutex<Vec<AiRequest>>,
}

impl FakeAiClient {
    pub fn new(reply: FakeReply) -> Self {
        Self {
            reply,
            models: Ok(Vec::new()),
            seen: Mutex::new(Vec::new()),
        }
    }

    pub fn with_models(self, models: Result<Vec<String>, ErrorCode>) -> Self {
        Self { models, ..self }
    }

    /// The requests received so far.
    pub fn requests(&self) -> Vec<AiRequest> {
        self.seen.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

impl AiClient for FakeAiClient {
    fn stream(
        &self,
        req: AiRequest,
        cancel: CancellationToken,
    ) -> BoxFuture<'_, Result<AiStream, AppError>> {
        if let Ok(mut seen) = self.seen.lock() {
            seen.push(req);
        }
        let reply = self.reply.clone();
        Box::pin(async move {
            let (deltas, failure) = match reply {
                FakeReply::Fail(code) => return Err(code.into()),
                FakeReply::Deltas(d) => (d, None),
                FakeReply::FailAfter(d, code) => (d, Some(code)),
            };
            let (tx, rx) = tokio::sync::mpsc::channel(deltas.len() + 2);
            for d in deltas {
                if cancel.is_cancelled() {
                    return Ok(rx);
                }
                // The channel holds every event, so this cannot block or fail.
                let _ = tx.try_send(Ok(AiEvent::Delta(d)));
            }
            let last = match failure {
                Some(code) => Err(code.into()),
                None => Ok(AiEvent::Done {
                    usage: AiUsage::default(),
                    ms: 0,
                }),
            };
            let _ = tx.try_send(last);
            Ok(rx)
        })
    }

    fn list_models(&self) -> BoxFuture<'_, Result<Vec<String>, AppError>> {
        let models = self.models.clone();
        Box::pin(async move { models.map_err(AppError::from) })
    }

    fn test(&self) -> BoxFuture<'_, Result<(), AppError>> {
        let result = match &self.reply {
            FakeReply::Fail(code) => Err(code.clone().into()),
            _ => Ok(()),
        };
        Box::pin(async move { result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req() -> AiRequest {
        AiRequest {
            system: "s".into(),
            user: "u".into(),
            model: None,
        }
    }

    #[tokio::test]
    async fn replays_deltas_then_done() {
        let c = FakeAiClient::new(FakeReply::Deltas(vec!["a".into(), "b".into()]));
        let mut rx = c.stream(req(), CancellationToken::new()).await.unwrap();
        assert_eq!(rx.recv().await, Some(Ok(AiEvent::Delta("a".into()))));
        assert_eq!(rx.recv().await, Some(Ok(AiEvent::Delta("b".into()))));
        assert!(matches!(rx.recv().await, Some(Ok(AiEvent::Done { .. }))));
        assert_eq!(rx.recv().await, None);
        assert_eq!(c.requests().len(), 1);
    }

    #[tokio::test]
    async fn fails_up_front_or_midway() {
        let c = FakeAiClient::new(FakeReply::Fail(ErrorCode::ProviderAuth));
        let e = c.stream(req(), CancellationToken::new()).await.unwrap_err();
        assert_eq!(e.code, ErrorCode::ProviderAuth);
        assert!(c.test().await.is_err());

        let c = FakeAiClient::new(FakeReply::FailAfter(vec!["a".into()], ErrorCode::Timeout));
        let mut rx = c.stream(req(), CancellationToken::new()).await.unwrap();
        assert!(matches!(rx.recv().await, Some(Ok(AiEvent::Delta(_)))));
        assert_eq!(
            rx.recv().await.unwrap().unwrap_err().code,
            ErrorCode::Timeout
        );
    }

    #[tokio::test]
    async fn cancelled_stream_ends_without_done() {
        let c = FakeAiClient::new(FakeReply::Deltas(vec!["a".into()]));
        let cancel = CancellationToken::new();
        cancel.cancel();
        let mut rx = c.stream(req(), cancel).await.unwrap();
        assert_eq!(rx.recv().await, None);
    }
}
