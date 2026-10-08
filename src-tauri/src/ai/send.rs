//! The send: `ai_analyze` checks everything it can before it answers, then a
//! task reads the reply and reports on `ai://event`. What is sent is the
//! payload kept at preview time; nothing is rebuilt.

use std::sync::Arc;

use daminus_core::ai::AiClient;
use daminus_core::ai::payload::Payload;
use daminus_core::ai::profiles::ProviderProfile;
use daminus_core::ai::schema::{SendTarget, analyze};
use daminus_core::ai::send_log::{record_review_send, should_offer_turning_off_review};
use daminus_core::ai::view::{AiEventBody, AiStreamEvent};
use daminus_core::domain::error::{AppError, ErrorCode};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::{MAX_REQUEST_ID_CHARS, invalid, known_profile};
use crate::app::AppCore;

/// Numbers and sends the events of one request.
struct Emitter {
    tx: mpsc::Sender<AiStreamEvent>,
    request_id: String,
    seq: u32,
}

impl Emitter {
    fn event(&mut self, body: AiEventBody) -> AiStreamEvent {
        self.seq += 1;
        AiStreamEvent {
            request_id: self.request_id.clone(),
            seq: self.seq,
            body,
        }
    }

    /// A piece of the summary may be dropped when the webview falls behind; `Done` carries
    /// the whole text.
    fn try_send(&mut self, body: AiEventBody) {
        let event = self.event(body);
        let _ = self.tx.try_send(event);
    }

    async fn send(&mut self, body: AiEventBody) {
        let event = self.event(body);
        let _ = self.tx.send(event).await;
    }
}

/// Turns the raw summary the model streams into the text to show: real names back in place of
/// placeholders, and nothing sent while a placeholder may still be half written.
pub(super) struct DisplayStream<'a> {
    restore: &'a (dyn Fn(&str) -> String + Sync),
    raw: String,
    shown: String,
}

impl<'a> DisplayStream<'a> {
    pub(super) fn new(restore: &'a (dyn Fn(&str) -> String + Sync)) -> Self {
        Self {
            restore,
            raw: String::new(),
            shown: String::new(),
        }
    }

    /// The new text to show after `piece` arrived, if any.
    pub(super) fn push(&mut self, piece: &str) -> Option<String> {
        self.raw.push_str(piece);
        let open = self
            .raw
            .rfind('[')
            .filter(|&i| !self.raw[i..].contains(']'));
        let safe = &self.raw[..open.unwrap_or(self.raw.len())];
        let restored = (self.restore)(safe);
        let new = restored.strip_prefix(self.shown.as_str())?.to_owned();
        if new.is_empty() {
            return None;
        }
        self.shown = restored;
        Some(new)
    }
}

/// Removes the request from the running ones when the task ends, however it ends.
struct Running {
    core: AppCore,
    request_id: String,
    hash: String,
}

impl Drop for Running {
    fn drop(&mut self) {
        self.core.ai.sends().remove(&self.request_id);
        self.core.ai.drop_payload(&self.hash);
    }
}

struct Job {
    core: AppCore,
    request_id: String,
    hash: String,
    payload: Arc<Payload>,
    client: Arc<dyn AiClient>,
    profile: &'static ProviderProfile,
    model: Option<String>,
    cancel: CancellationToken,
}

impl AppCore {
    /// Starts the send of the payload previewed under `previewed_hash`. Answers once the send is
    /// under way; the reply, its errors and its end come as events. Must run inside Tokio.
    pub async fn ai_analyze(&self, request_id: &str, previewed_hash: &str) -> Result<(), AppError> {
        if request_id.is_empty()
            || request_id.chars().count() > MAX_REQUEST_ID_CHARS
            || request_id.chars().any(char::is_control)
        {
            return Err(invalid("request_id"));
        }
        let core = self.clone();
        let hash = previewed_hash.to_owned();
        let (profile, model, client, payload) = super::blocking("ai_analyze", move || {
            let settings = core.ai_settings()?;
            let id = settings
                .provider
                .as_deref()
                .ok_or_else(|| AppError::from(ErrorCode::ProviderAuth))?;
            let profile = known_profile(id)?;
            // The kept bytes are the ones previewed; a hash with no kept payload, or bytes that
            // no longer hash to it, is refused before a client is even built.
            let payload = core
                .ai
                .payload(&hash)
                .ok_or_else(|| invalid("payload_changed"))?;
            payload.verify(&hash)?;
            let client = core.ai_client(profile, &settings)?;
            Ok((profile, settings.model, client, payload))
        })
        .await?;

        let cancel = CancellationToken::new();
        {
            let mut sends = self.ai.sends();
            if sends.contains_key(request_id) {
                return Err(invalid("request_id_in_use"));
            }
            // One send at a time: a new request replaces the one still running, which ends
            // with `Cancelled` (it must not go on being billed with nobody reading it).
            for older in sends.values() {
                older.cancel();
            }
            sends.insert(request_id.to_owned(), cancel.clone());
        }
        let job = Job {
            core: self.clone(),
            request_id: request_id.to_owned(),
            hash: previewed_hash.to_owned(),
            payload,
            client,
            profile,
            model,
            cancel,
        };
        tokio::spawn(run(job));
        Ok(())
    }

    /// Counts a reviewed send in `state.json`. Failing to write is logged, not shown: the
    /// reply is already on its way to the user.
    fn count_reviewed_send(&self) -> u32 {
        let counted = self.store.load_state().and_then(|mut state| {
            let n = record_review_send(&mut state);
            self.store.save_state(&state).map(|()| n)
        });
        counted.unwrap_or_else(|e| {
            tracing::warn!(code = ?e.code, "review count not saved");
            0
        })
    }
}

async fn run(job: Job) {
    let _running = Running {
        core: job.core.clone(),
        request_id: job.request_id.clone(),
        hash: job.hash.clone(),
    };
    let mut out = Emitter {
        tx: job.core.ai.events.clone(),
        request_id: job.request_id.clone(),
        seq: 0,
    };
    let target = SendTarget {
        provider: &job.profile.id,
        model: job.model.as_deref(),
    };
    let restore = |text: &str| job.payload.restore(text);
    let mut display = DisplayStream::new(&restore);
    let result = analyze(
        job.client.as_ref(),
        &target,
        &job.payload,
        &job.hash,
        &job.cancel,
        |piece| {
            if let Some(text) = display.push(piece) {
                out.try_send(AiEventBody::SummaryDelta { text });
            }
        },
    )
    .await;
    match result {
        Ok(analysis) => {
            let shown = analysis.restore_for_display(&job.payload);
            for finding in shown.findings {
                let key = job.payload.finding_key(&finding.id).cloned();
                out.send(AiEventBody::Finding { finding, key }).await;
            }
            let core = job.core.clone();
            let reviewed = tokio::task::spawn_blocking(move || core.count_reviewed_send())
                .await
                .unwrap_or(0);
            out.send(AiEventBody::Done {
                summary: shown.summary,
                reviewed_sends: reviewed,
                offer_turning_off_review: should_offer_turning_off_review(reviewed),
            })
            .await;
        }
        Err(e) if e.code == ErrorCode::Cancelled || job.cancel.is_cancelled() => {
            out.send(AiEventBody::Cancelled).await;
        }
        Err(e) => out.send(AiEventBody::Error { error: e.code }).await,
    }
}
