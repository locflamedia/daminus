//! The [`AiClient`] for HTTP providers, built on `genai`. One client is one
//! provider profile with its key and endpoint already chosen; the key goes to
//! `genai` through an explicit auth resolver and never from the environment.

use std::fmt;
use std::pin::Pin;
use std::time::Duration;

use futures_util::{Stream, StreamExt};
use genai::adapter::AdapterKind;
use genai::chat::{ChatMessage, ChatOptions, ChatRequest, ChatStreamEvent};
use genai::resolver::{AuthData, AuthResolver, Endpoint, ProviderConfig};
use genai::{Client, ModelIden, ServiceTarget};
use tokio::sync::mpsc;
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;

use super::profiles::{ProviderKind, ProviderProfile, validate_base_url};
use super::{AiClient, AiEvent, AiRequest, AiStream, AiUsage, BoxFuture, SecretString};
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::redact::redact_secrets;

/// How long the call may wait with nothing arriving: for the connection, and
/// then between chunks. A model that thinks for a while keeps the call alive
/// as long as it keeps sending.
const IDLE_TIMEOUT: Duration = Duration::from_secs(60);
/// The whole call, however much arrives, must finish within this.
const CALL_TIMEOUT: Duration = Duration::from_secs(600);
/// Events waiting for the reader before the producer waits too.
const CHANNEL_CAPACITY: usize = 32;
/// More answer text than this ends the reply with an error.
const MAX_REPLY_BYTES: usize = 1024 * 1024;
/// More model names than this are dropped.
const MAX_MODELS: usize = 2000;
/// Model names longer than this are dropped.
const MAX_MODEL_NAME_CHARS: usize = 200;
/// Most characters between a "retry after" marker and its number in a body.
const MAX_RETRY_AFTER_GAP: usize = 8;
/// Longest `Retry-After` kept; a longer one is the provider misbehaving.
const MAX_RETRY_AFTER_CHARS: usize = 40;
/// Longest provider message kept in an error's `detail`, in characters.
const MAX_DETAIL_CHARS: usize = 300;

type EventStream = Pin<Box<dyn Stream<Item = genai::Result<ChatStreamEvent>> + Send>>;

/// A provider reached over HTTP through `genai`.
pub struct GenaiClient {
    client: Client,
    adapter: AdapterKind,
    endpoint: Option<Endpoint>,
    key: Option<SecretString>,
    profile_id: String,
    profile_name: String,
    default_model: Option<String>,
    timeout: Duration,
    idle_timeout: Duration,
}

impl fmt::Debug for GenaiClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GenaiClient")
            .field("profile", &self.profile_id)
            .field("adapter", &self.adapter)
            .field("endpoint", &self.endpoint.as_ref().map(Endpoint::base_url))
            .field("key", &self.key.as_ref().map(|_| "***"))
            .finish_non_exhaustive()
    }
}

fn invalid(detail: &str) -> AppError {
    AppError::from(ErrorCode::SchemaInvalid).with_param("detail", detail)
}

fn adapter_kind(name: &str) -> Option<AdapterKind> {
    match name {
        "openrouter" => Some(AdapterKind::OpenRouter),
        other => AdapterKind::from_lower_str(other),
    }
}

impl GenaiClient {
    /// Builds the client for `profile`. `base_url` replaces the adapter's own
    /// endpoint and must pass [`validate_base_url`]; `key` is sent as the
    /// provider's credential and nothing is read from the environment.
    pub fn new(
        profile: &ProviderProfile,
        base_url: Option<&str>,
        key: Option<SecretString>,
    ) -> Result<Self, AppError> {
        if profile.kind != ProviderKind::GenaiAdapter {
            return Err(invalid("profile"));
        }
        let adapter = profile
            .adapter
            .as_deref()
            .and_then(adapter_kind)
            .ok_or_else(|| invalid("adapter"))?;
        let endpoint = match base_url.map(str::trim).filter(|u| !u.is_empty()) {
            Some(raw) => {
                let mut url = validate_base_url(raw)?;
                if !url.path().ends_with('/') {
                    let path = format!("{}/", url.path());
                    url.set_path(&path);
                }
                Some(Endpoint::from_owned(url.as_str()))
            }
            None => None,
        };

        let auth_key = key.clone();
        let auth = AuthResolver::from_resolver_fn(
            move |_model: ModelIden| -> Result<Option<AuthData>, genai::resolver::Error> {
                Ok(Some(match &auth_key {
                    Some(k) => AuthData::from_single(k.expose()),
                    // Adapters need some value; an empty one is how a keyless
                    // (local) server is addressed.
                    None => AuthData::from_single(""),
                }))
            },
        );
        // A redirect would carry the key header to whatever host the provider
        // names, so none is followed.
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| invalid("http_client"))?;
        let mut builder = Client::builder()
            .with_reqwest(http)
            .with_adapter_kind(adapter)
            .with_auth_resolver(auth);
        if let Some(endpoint) = endpoint.clone() {
            builder = builder.with_service_target_resolver_fn(
                move |mut target: ServiceTarget| -> Result<ServiceTarget, genai::resolver::Error> {
                    target.endpoint = endpoint.clone();
                    Ok(target)
                },
            );
        }
        Ok(Self {
            client: builder.build(),
            adapter,
            endpoint,
            key,
            profile_id: profile.id.clone(),
            profile_name: profile.name.clone(),
            default_model: profile.default_model().map(str::to_owned),
            timeout: CALL_TIMEOUT,
            idle_timeout: IDLE_TIMEOUT,
        })
    }

    /// Replaces the 60 s limit on a whole call.
    /// Caps the whole call, and with it the idle wait, which is never longer.
    pub fn with_timeout(self, timeout: Duration) -> Self {
        Self {
            timeout,
            idle_timeout: self.idle_timeout.min(timeout),
            ..self
        }
    }

    /// Caps the wait for the connection and for each chunk on its own.
    pub fn with_idle_timeout(self, idle_timeout: Duration) -> Self {
        Self {
            idle_timeout,
            ..self
        }
    }

    /// Adds who refused, so the sentence can name them ("Anthropic has no
    /// model …"). `model` is the one the call asked for, where there was one.
    fn map_error(&self, err: &genai::Error, model: Option<&str>) -> AppError {
        let mut app = map_error(err, self.key.as_ref()).with_param("provider", &self.profile_name);
        if let Some(model) = model {
            app = app.with_param("model", model);
        }
        app
    }

    /// Sends the request and reads up to the first event that carries content,
    /// so a refused call fails here and not on the stream.
    async fn open(
        &self,
        model: String,
        chat: ChatRequest,
    ) -> Result<(EventStream, Option<ChatStreamEvent>), AppError> {
        let options = ChatOptions::default().with_capture_usage(true);
        let named = model.clone();
        let response = self
            .client
            .exec_chat_stream(model, chat, Some(&options))
            .await
            .map_err(|e| self.map_error(&e, Some(&named)))?;
        let mut stream: EventStream = Box::pin(response.stream);
        loop {
            match stream.next().await {
                None => return Ok((stream, None)),
                Some(Err(e)) => return Err(self.map_error(&e, Some(&named))),
                Some(Ok(ChatStreamEvent::Chunk(c))) => {
                    return Ok((stream, Some(ChatStreamEvent::Chunk(c))));
                }
                Some(Ok(end @ ChatStreamEvent::End(_))) => return Ok((stream, Some(end))),
                Some(Ok(_)) => {}
            }
        }
    }
}

fn timeout_error() -> AppError {
    ErrorCode::Timeout.into()
}

impl AiClient for GenaiClient {
    fn stream(
        &self,
        req: AiRequest,
        cancel: CancellationToken,
    ) -> BoxFuture<'_, Result<AiStream, AppError>> {
        Box::pin(async move {
            let model = req
                .model
                .clone()
                .or_else(|| self.default_model.clone())
                .ok_or_else(|| invalid("model"))?;
            let started = Instant::now();
            let deadline = started + self.timeout;
            let idle = self.idle_timeout.min(self.timeout);
            let input_bytes = req.system.len() + req.user.len();
            let mut chat = ChatRequest::new(vec![ChatMessage::user(req.user)]);
            if !req.system.is_empty() {
                chat = chat.with_system(req.system);
            }

            let (tx, rx) = mpsc::channel(CHANNEL_CAPACITY);
            let asked = model.clone();
            let opened = tokio::select! {
                () = cancel.cancelled() => return Ok(rx),
                r = tokio::time::timeout_at(started + idle, self.open(model, chat)) => r,
            };
            let (stream, first) = opened.map_err(|_| timeout_error())??;
            let key = self.key.clone();
            tokio::spawn(pump(Pump {
                stream,
                first,
                tx,
                cancel,
                deadline,
                idle,
                provider: self.profile_name.clone(),
                model: asked,
                started,
                input_bytes,
                key,
            }));
            Ok(rx)
        })
    }

    fn list_models(&self) -> BoxFuture<'_, Result<Vec<String>, AppError>> {
        Box::pin(async move {
            let auth = match &self.key {
                Some(k) => AuthData::from_single(k.expose()),
                None => AuthData::None,
            };
            let config = ProviderConfig {
                endpoint: self.endpoint.clone(),
                auth: Some(auth),
            };
            let listing = tokio::time::timeout(
                self.idle_timeout,
                self.client.all_model_names(self.adapter, config),
            )
            .await
            .map_err(|_| timeout_error())?;
            let mut names = listing.map_err(|e| self.map_error(&e, None))?;
            names.retain(|n| n.chars().count() <= MAX_MODEL_NAME_CHARS);
            names.truncate(MAX_MODELS);
            Ok(names)
        })
    }

    fn test(&self) -> BoxFuture<'_, Result<(), AppError>> {
        Box::pin(async move {
            let cancel = CancellationToken::new();
            let req = AiRequest {
                system: String::new(),
                user: "Reply with one word: ok".to_owned(),
                model: None,
            };
            // `stream` returns once the provider has accepted the call and sent
            // its first content, which is all a key and endpoint check needs.
            let result = self.stream(req, cancel.clone()).await.map(drop);
            cancel.cancel();
            result
        })
    }
}

struct Pump {
    stream: EventStream,
    first: Option<ChatStreamEvent>,
    tx: mpsc::Sender<Result<AiEvent, AppError>>,
    cancel: CancellationToken,
    deadline: Instant,
    /// How long one chunk may take; the deadline still caps the whole call.
    idle: Duration,
    /// Who was asked, and for which model, so a failure part-way through the
    /// stream names them the same way one at the start does.
    provider: String,
    model: String,
    started: Instant,
    input_bytes: usize,
    key: Option<SecretString>,
}

/// Sends one item; false when the reader is gone or the call was cancelled.
async fn send(
    tx: &mpsc::Sender<Result<AiEvent, AppError>>,
    cancel: &CancellationToken,
    item: Result<AiEvent, AppError>,
) -> bool {
    tokio::select! {
        () = cancel.cancelled() => false,
        sent = tx.send(item) => sent.is_ok(),
    }
}

fn tokens(bytes: usize) -> u32 {
    u32::try_from(bytes / 4).unwrap_or(u32::MAX)
}

/// Forwards the provider's events until the end, an error, the deadline, or
/// cancellation. Dropping the stream on return closes the connection.
async fn pump(mut p: Pump) {
    let mut output_bytes = 0usize;
    let mut next = p.first.take().map(Ok);
    loop {
        let event = match next.take() {
            Some(event) => Some(event),
            None => {
                tokio::select! {
                    () = p.cancel.cancelled() => return,
                    r = tokio::time::timeout_at(
                        p.deadline.min(Instant::now() + p.idle),
                        p.stream.next(),
                    ) => match r {
                        Ok(event) => event,
                        Err(_) => {
                            send(&p.tx, &p.cancel, Err(timeout_error())).await;
                            return;
                        }
                    },
                }
            }
        };
        let item = match event {
            Some(Err(e)) => {
                let err = map_error(&e, p.key.as_ref())
                    .with_param("provider", &p.provider)
                    .with_param("model", &p.model);
                send(&p.tx, &p.cancel, Err(err)).await;
                return;
            }
            Some(Ok(ChatStreamEvent::Chunk(chunk))) => {
                output_bytes += chunk.content.len();
                if output_bytes > MAX_REPLY_BYTES {
                    let err = AppError::from(ErrorCode::ProviderUnavailable)
                        .with_param("detail", "response_too_large");
                    send(&p.tx, &p.cancel, Err(err)).await;
                    return;
                }
                AiEvent::Delta(chunk.content)
            }
            Some(Ok(ChatStreamEvent::End(end))) => {
                let usage = end.captured_usage.as_ref();
                let count = |v: Option<i32>, guess: usize| {
                    v.and_then(|n| u32::try_from(n).ok())
                        .unwrap_or_else(|| tokens(guess))
                };
                let done = AiEvent::Done {
                    usage: AiUsage {
                        tokens_in: count(usage.and_then(|u| u.prompt_tokens), p.input_bytes),
                        tokens_out: count(usage.and_then(|u| u.completion_tokens), output_bytes),
                    },
                    ms: u64::try_from(p.started.elapsed().as_millis()).unwrap_or(u64::MAX),
                };
                send(&p.tx, &p.cancel, Ok(done)).await;
                return;
            }
            // The connection closed without an end marker: the text is whole.
            None => {
                let done = AiEvent::Done {
                    usage: AiUsage {
                        tokens_in: tokens(p.input_bytes),
                        tokens_out: tokens(output_bytes),
                    },
                    ms: u64::try_from(p.started.elapsed().as_millis()).unwrap_or(u64::MAX),
                };
                send(&p.tx, &p.cancel, Ok(done)).await;
                return;
            }
            Some(Ok(_)) => continue,
        };
        if !send(&p.tx, &p.cancel, Ok(item)).await {
            return;
        }
    }
}

/// The HTTP status behind a `genai` error, when there was a response.
fn status_of(err: &genai::Error) -> Option<u16> {
    use genai::Error as E;
    match err {
        E::HttpError { status, .. } => Some(status.as_u16()),
        E::WebModelCall { webc_error, .. } | E::WebAdapterCall { webc_error, .. } => {
            match webc_error {
                genai::webc::Error::ResponseFailedStatus { status, .. } => Some(status.as_u16()),
                _ => None,
            }
        }
        // `genai` boxes the refused response of a stream into this variant.
        E::WebStream { error, .. } => error.downcast_ref::<genai::Error>().and_then(status_of),
        _ => None,
    }
}

/// How long the provider asked us to wait, in whole seconds.
///
/// `genai` keeps the response headers only on the non-streaming error
/// (`ResponseFailedStatus`, which `list_models` can raise); a refused stream
/// arrives as `HttpError`, which carries the status and the body but no
/// headers. So the header is read where it exists, and otherwise the body is,
/// since providers that throttle usually say the wait there too.
fn retry_after_of(err: &genai::Error) -> Option<String> {
    use genai::Error as E;
    match err {
        E::WebModelCall { webc_error, .. } | E::WebAdapterCall { webc_error, .. } => {
            if let genai::webc::Error::ResponseFailedStatus { headers, body, .. } = webc_error {
                headers
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .map(str::to_owned)
                    .or_else(|| retry_after_in_text(body))
            } else {
                None
            }
        }
        E::HttpError { body, .. } => retry_after_in_text(body),
        E::WebStream { error, .. } => error
            .downcast_ref::<genai::Error>()
            .and_then(retry_after_of),
        _ => None,
    }
}

/// `"retry_after": 7`, `retry-after: 7` or "try again in 7 seconds" in a
/// provider's error body: the first whole number of seconds it offers.
fn retry_after_in_text(body: &str) -> Option<String> {
    let lower = body.to_ascii_lowercase();
    for marker in ["retry_after", "retry-after", "try again in"] {
        let Some(at) = lower.find(marker) else {
            continue;
        };
        let rest = &lower[at + marker.len()..];
        let digits: String = rest
            .trim_start_matches(|c: char| !c.is_ascii_digit() && c != '.')
            .chars()
            .take_while(char::is_ascii_digit)
            .collect();
        // A number right after the marker, not one further along the message.
        let gap = rest.len() - rest.trim_start_matches(|c: char| !c.is_ascii_digit()).len();
        if !digits.is_empty() && gap <= MAX_RETRY_AFTER_GAP {
            return Some(digits);
        }
    }
    None
}

/// What a provider's own words say when the status does not say it: the few
/// shapes Hermes also reads (`error_classifier.py`). Anything else stays
/// `ProviderUnavailable`, which retries.
fn classify_text(text: &str) -> ErrorCode {
    let t = text.to_ascii_lowercase();
    if t.contains("context length") || t.contains("context_length") || t.contains("too many tokens")
    {
        ErrorCode::PayloadTooLarge
    } else if t.contains("insufficient_quota")
        || t.contains("insufficient credit")
        || t.contains("out of credit")
    {
        ErrorCode::ProviderBilling
    } else if t.contains("model_not_found") || t.contains("no such model") {
        ErrorCode::ProviderModelNotFound
    } else if t.contains("content_policy") || t.contains("content filter") {
        ErrorCode::ContentPolicy
    } else if t.contains("overloaded") {
        ErrorCode::Overloaded
    } else {
        ErrorCode::ProviderUnavailable
    }
}

/// Maps a `genai` error to the closed error codes. The text kept for the UI
/// has the key and anything credential-shaped removed.
fn map_error(err: &genai::Error, key: Option<&SecretString>) -> AppError {
    use genai::Error as E;
    let status = status_of(err);
    // Hermes classifies by status first and only then by text, so a provider
    // that words its body oddly still lands on the status's meaning.
    let code = match (status, err) {
        (Some(401 | 403), _) => ErrorCode::ProviderAuth,
        (Some(402), _) => ErrorCode::ProviderBilling,
        (Some(404), _) => ErrorCode::ProviderModelNotFound,
        (Some(413), _) => ErrorCode::PayloadTooLarge,
        (Some(429), _) => ErrorCode::ProviderRateLimit,
        (Some(529), _) => ErrorCode::Overloaded,
        (
            None,
            E::RequiresApiKey { .. }
            | E::NoAuthResolver { .. }
            | E::NoAuthData { .. }
            | E::Resolver { .. },
        ) => ErrorCode::ProviderAuth,
        // Statuses that carry no meaning of their own: the body says which it is.
        _ => classify_text(&err.to_string()),
    };
    let mut text = err.to_string();
    if let Some(k) = key.map(SecretString::expose).filter(|k| !k.is_empty()) {
        text = text.replace(k, "***");
    }
    let detail: String = redact_secrets(&text)
        .chars()
        .take(MAX_DETAIL_CHARS)
        .collect();
    let mut app = AppError::from(code).with_param("detail", detail);
    if let Some(status) = status {
        app = app.with_param("status", status.to_string());
    }
    if let Some(wait) = retry_after_of(err).filter(|v| v.len() <= MAX_RETRY_AFTER_CHARS) {
        app = app.with_param("retry_after", wait);
    }
    app
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::profiles::profile;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const KEY: &str = "mock-key-abc123";

    fn chunk(text: &str) -> String {
        let v = serde_json::json!({
            "id": "c1", "object": "chat.completion.chunk", "model": "m",
            "choices": [{"index": 0, "delta": {"content": text}}]
        });
        format!("data: {v}\n\n")
    }

    fn sse_body(parts: &[&str]) -> String {
        let mut body: String = parts.iter().map(|p| chunk(p)).collect();
        body.push_str(
            "data: {\"id\":\"c1\",\"object\":\"chat.completion.chunk\",\"model\":\"m\",\
             \"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
        );
        body.push_str(
            "data: {\"id\":\"c1\",\"object\":\"chat.completion.chunk\",\"model\":\"m\",\
             \"choices\":[],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"total_tokens\":10}}\n\n",
        );
        body.push_str("data: [DONE]\n\n");
        body
    }

    fn client_for(base: &str, key: Option<&str>) -> GenaiClient {
        let p = profile("openai").expect("openai profile");
        GenaiClient::new(p, Some(&format!("{base}/v1")), key.map(SecretString::new))
            .expect("client builds")
    }

    fn request() -> AiRequest {
        AiRequest {
            system: "be brief".into(),
            user: "hi".into(),
            model: Some("gpt-test".into()),
        }
    }

    async fn collect(mut rx: AiStream) -> Vec<Result<AiEvent, AppError>> {
        let mut all = Vec::new();
        while let Some(item) = rx.recv().await {
            all.push(item);
        }
        all
    }

    async fn mount_chat(server: &MockServer, response: ResponseTemplate) {
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(response)
            .mount(server)
            .await;
    }

    fn sse(body: String) -> ResponseTemplate {
        ResponseTemplate::new(200).set_body_raw(body, "text/event-stream")
    }

    #[tokio::test]
    async fn streams_deltas_in_order_then_done() {
        let server = MockServer::start().await;
        mount_chat(&server, sse(sse_body(&["Hel", "lo ", "there"]))).await;
        let client = client_for(&server.uri(), Some(KEY));
        let rx = client
            .stream(request(), CancellationToken::new())
            .await
            .expect("stream opens");
        let events = collect(rx).await;
        let texts: Vec<String> = events
            .iter()
            .filter_map(|e| match e {
                Ok(AiEvent::Delta(t)) => Some(t.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(texts, ["Hel", "lo ", "there"]);
        match events.last() {
            Some(Ok(AiEvent::Done { usage, .. })) => {
                assert_eq!(usage.tokens_in, 7);
                assert_eq!(usage.tokens_out, 3);
            }
            other => panic!("expected Done last, got {other:?}"),
        }
        let seen = server.received_requests().await.unwrap_or_default();
        let auth = seen
            .first()
            .and_then(|r| r.headers.get("authorization"))
            .map(|v| v.to_str().unwrap_or_default().to_owned());
        assert_eq!(auth.as_deref(), Some("Bearer mock-key-abc123"));
    }

    #[tokio::test]
    async fn http_errors_map_to_codes_and_hide_the_key() {
        for (status, want) in [
            (401, ErrorCode::ProviderAuth),
            (403, ErrorCode::ProviderAuth),
            (402, ErrorCode::ProviderBilling),
            (404, ErrorCode::ProviderModelNotFound),
            (413, ErrorCode::PayloadTooLarge),
            (429, ErrorCode::ProviderRateLimit),
            (529, ErrorCode::Overloaded),
            (500, ErrorCode::ProviderUnavailable),
            (503, ErrorCode::ProviderUnavailable),
            (400, ErrorCode::ProviderUnavailable),
        ] {
            let server = MockServer::start().await;
            let body = format!(r#"{{"error":{{"message":"bad key {KEY} for you"}}}}"#);
            mount_chat(&server, ResponseTemplate::new(status).set_body_string(body)).await;
            let client = client_for(&server.uri(), Some(KEY));
            let err = client
                .stream(request(), CancellationToken::new())
                .await
                .expect_err("provider refuses");
            assert_eq!(err.code, want, "status {status}");
            assert_eq!(err.params.get("status"), Some(&status.to_string()));
            let shown = format!(
                "{err:?} {}",
                serde_json::to_string(&err).unwrap_or_default()
            );
            assert!(!shown.contains(KEY), "{shown}");
            assert_eq!(err.retryable, want.retryable());
        }
    }

    /// What a provider says in the body, when the status alone does not tell
    /// the codes apart. Each of these comes back 500, so only the words differ.
    #[tokio::test]
    async fn the_body_names_the_failure_when_the_status_cannot() {
        for (body, want) in [
            (
                "this model's maximum context length is 8192 tokens",
                ErrorCode::PayloadTooLarge,
            ),
            ("insufficient_quota: add credit", ErrorCode::ProviderBilling),
            (
                "model_not_found: try another",
                ErrorCode::ProviderModelNotFound,
            ),
            ("content_policy violation", ErrorCode::ContentPolicy),
            ("the engine is overloaded, back off", ErrorCode::Overloaded),
            ("something else entirely", ErrorCode::ProviderUnavailable),
        ] {
            let server = MockServer::start().await;
            let payload = format!(r#"{{"error":{{"message":"{body}"}}}}"#);
            mount_chat(&server, ResponseTemplate::new(500).set_body_string(payload)).await;
            let client = client_for(&server.uri(), Some(KEY));
            let err = client
                .stream(request(), CancellationToken::new())
                .await
                .expect_err("provider refuses");
            assert_eq!(err.code, want, "body {body:?}");
        }
    }

    /// A refused *stream* reaches us as `genai::Error::HttpError`, which keeps
    /// the body but not the headers, so the wait is read from what the
    /// provider wrote in the body.
    #[tokio::test]
    async fn the_wait_a_throttling_provider_states_is_kept_for_the_backoff() {
        for (body, want) in [
            (
                r#"{"error":{"message":"slow down","retry_after":7}}"#,
                Some("7"),
            ),
            (
                r#"{"error":{"message":"try again in 12 seconds"}}"#,
                Some("12"),
            ),
            (r#"{"error":{"message":"slow down"}}"#, None),
        ] {
            let server = MockServer::start().await;
            mount_chat(
                &server,
                ResponseTemplate::new(429)
                    .insert_header("retry-after", "9")
                    .set_body_string(body),
            )
            .await;
            let client = client_for(&server.uri(), Some(KEY));
            let err = client
                .stream(request(), CancellationToken::new())
                .await
                .expect_err("throttled");
            assert_eq!(err.code, ErrorCode::ProviderRateLimit, "{body}");
            assert_eq!(
                err.params.get("retry_after").map(String::as_str),
                want,
                "{body}"
            );
            assert_eq!(
                crate::ai::retry::retry_after(&err),
                want.map(|w| Duration::from_secs(w.parse().expect("seconds"))),
                "{body}"
            );
        }
    }

    /// The sentence for these codes names who refused and which model, so the
    /// error has to carry both.
    #[tokio::test]
    async fn a_refusal_names_the_provider_and_the_model() {
        let server = MockServer::start().await;
        mount_chat(
            &server,
            ResponseTemplate::new(404).set_body_string(r#"{"error":{"message":"no model"}}"#),
        )
        .await;
        let client = client_for(&server.uri(), Some(KEY));
        let err = client
            .stream(request(), CancellationToken::new())
            .await
            .expect_err("no such model");
        assert_eq!(err.code, ErrorCode::ProviderModelNotFound);
        assert_eq!(err.params.get("provider"), Some(&"OpenAI".to_owned()));
        assert_eq!(err.params.get("model"), Some(&"gpt-test".to_owned()));
    }

    /// `list_models` is not streamed, so there the header itself survives.
    #[tokio::test]
    async fn a_retry_after_header_is_kept_where_genai_keeps_headers() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(
                ResponseTemplate::new(429)
                    .insert_header("retry-after", "7")
                    .set_body_string(r#"{"error":{"message":"slow down"}}"#),
            )
            .mount(&server)
            .await;
        let client = client_for(&server.uri(), Some(KEY));
        let err = client.list_models().await.expect_err("throttled");
        assert_eq!(err.code, ErrorCode::ProviderRateLimit);
        assert_eq!(err.params.get("retry_after"), Some(&"7".to_owned()));
    }

    #[test]
    fn a_number_far_from_the_marker_is_not_a_wait() {
        assert_eq!(retry_after_in_text("retry_after: 7"), Some("7".into()));
        assert_eq!(
            retry_after_in_text(r#""retry_after":12"#),
            Some("12".into())
        );
        assert_eq!(
            retry_after_in_text("try again in 30 seconds"),
            Some("30".into())
        );
        assert_eq!(retry_after_in_text("no wait here"), None);
        assert_eq!(
            retry_after_in_text("retry after a while; error code 500 happened"),
            None,
            "a number further along the sentence is not the wait"
        );
    }

    #[tokio::test]
    async fn unreachable_endpoint_is_unavailable() {
        let port = {
            let l = TcpListener::bind("127.0.0.1:0").await.expect("bind");
            l.local_addr().expect("addr").port()
        };
        let client = client_for(&format!("http://127.0.0.1:{port}"), Some(KEY));
        let err = client
            .stream(request(), CancellationToken::new())
            .await
            .expect_err("nothing listens");
        assert_eq!(err.code, ErrorCode::ProviderUnavailable);
    }

    /// Serves one chunked SSE response that sends `first` and then stalls.
    async fn stalling_server(first: String) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("addr");
        tokio::spawn(async move {
            let Ok((mut sock, _)) = listener.accept().await else {
                return;
            };
            let mut buf = vec![0u8; 8192];
            let mut seen = Vec::new();
            while !seen.windows(4).any(|w| w == b"\r\n\r\n") {
                match sock.read(&mut buf).await {
                    Ok(0) | Err(_) => return,
                    Ok(n) => seen.extend_from_slice(&buf[..n]),
                }
            }
            let head = "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\n\
                        transfer-encoding: chunked\r\n\r\n";
            let part = format!("{head}{:x}\r\n{first}\r\n", first.len());
            let _ = sock.write_all(part.as_bytes()).await;
            tokio::time::sleep(Duration::from_secs(30)).await;
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn stalled_stream_times_out() {
        let base = stalling_server(chunk("partial")).await;
        let client = client_for(&base, Some(KEY)).with_timeout(Duration::from_millis(400));
        let rx = client
            .stream(request(), CancellationToken::new())
            .await
            .expect("first chunk arrives");
        let events = collect(rx).await;
        assert!(matches!(&events[0], Ok(AiEvent::Delta(t)) if t == "partial"));
        match events.last() {
            Some(Err(e)) => assert_eq!(e.code, ErrorCode::Timeout),
            other => panic!("expected Timeout, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn slow_start_times_out() {
        let server = MockServer::start().await;
        mount_chat(
            &server,
            sse(sse_body(&["x"])).set_delay(Duration::from_secs(5)),
        )
        .await;
        let client = client_for(&server.uri(), Some(KEY)).with_timeout(Duration::from_millis(200));
        let err = client
            .stream(request(), CancellationToken::new())
            .await
            .expect_err("too slow");
        assert_eq!(err.code, ErrorCode::Timeout);
    }

    #[tokio::test]
    async fn cancel_mid_stream_ends_without_done() {
        let base = stalling_server(chunk("one")).await;
        let client = client_for(&base, Some(KEY));
        let cancel = CancellationToken::new();
        let mut rx = client
            .stream(request(), cancel.clone())
            .await
            .expect("first chunk arrives");
        assert!(matches!(rx.recv().await, Some(Ok(AiEvent::Delta(t))) if t == "one"));
        cancel.cancel();
        let rest = tokio::time::timeout(Duration::from_secs(5), collect(rx))
            .await
            .expect("channel closes after cancel");
        assert!(rest.iter().all(|e| !matches!(e, Ok(AiEvent::Done { .. }))));
        assert!(rest.iter().all(Result::is_ok));
    }

    #[tokio::test]
    async fn cancel_before_the_reply_closes_the_channel() {
        let server = MockServer::start().await;
        mount_chat(
            &server,
            sse(sse_body(&["x"])).set_delay(Duration::from_secs(5)),
        )
        .await;
        let client = client_for(&server.uri(), Some(KEY));
        let cancel = CancellationToken::new();
        cancel.cancel();
        let rx = client.stream(request(), cancel).await.expect("no error");
        assert!(collect(rx).await.is_empty());
    }

    #[tokio::test]
    async fn oversized_reply_is_cut_off() {
        let big = "a".repeat(MAX_REPLY_BYTES / 2 + 1);
        let server = MockServer::start().await;
        mount_chat(&server, sse(sse_body(&[&big, &big, "tail"]))).await;
        let client = client_for(&server.uri(), None);
        let rx = client
            .stream(request(), CancellationToken::new())
            .await
            .expect("stream opens");
        let events = collect(rx).await;
        match events.last() {
            Some(Err(e)) => assert_eq!(e.code, ErrorCode::ProviderUnavailable),
            other => panic!("expected an error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn lists_models_from_the_endpoint() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "object": "list",
                "data": [{"id": "gpt-a", "object": "model"}, {"id": "gpt-b", "object": "model"}]
            })))
            .mount(&server)
            .await;
        let client = client_for(&server.uri(), Some(KEY));
        let models = client.list_models().await.expect("models listed");
        assert_eq!(models, ["gpt-a", "gpt-b"]);
    }

    #[tokio::test]
    async fn list_drops_hostile_names_and_caps_the_count() {
        let mut data: Vec<serde_json::Value> = (0..MAX_MODELS + 50)
            .map(|i| serde_json::json!({"id": format!("m-{i}"), "object": "model"}))
            .collect();
        data.insert(
            0,
            serde_json::json!({"id": "x".repeat(MAX_MODEL_NAME_CHARS + 1), "object": "model"}),
        );
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"object": "list", "data": data})),
            )
            .mount(&server)
            .await;
        let models = client_for(&server.uri(), Some(KEY))
            .list_models()
            .await
            .expect("models listed");
        assert_eq!(models.len(), MAX_MODELS);
        assert!(
            models
                .iter()
                .all(|m| m.chars().count() <= MAX_MODEL_NAME_CHARS)
        );
    }

    #[tokio::test]
    async fn redirects_are_not_followed_and_the_key_stays_home() {
        let other = MockServer::start().await;
        Mock::given(wiremock::matchers::any())
            .respond_with(ResponseTemplate::new(200))
            .mount(&other)
            .await;
        let first = MockServer::start().await;
        mount_chat(
            &first,
            ResponseTemplate::new(302)
                .insert_header("location", format!("{}/v1/chat/completions", other.uri())),
        )
        .await;
        let client = client_for(&first.uri(), Some(KEY));
        let err = client
            .stream(request(), CancellationToken::new())
            .await
            .expect_err("redirect refused");
        assert_eq!(err.code, ErrorCode::ProviderUnavailable);
        assert!(
            other
                .received_requests()
                .await
                .unwrap_or_default()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn list_failure_maps_and_hides_the_key() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(401).set_body_string(format!("nope {KEY}")))
            .mount(&server)
            .await;
        let client = client_for(&server.uri(), Some(KEY));
        let err = client.list_models().await.expect_err("401");
        assert_eq!(err.code, ErrorCode::ProviderAuth);
        assert!(!format!("{err:?}").contains(KEY));
    }

    #[tokio::test]
    async fn test_call_checks_key_and_endpoint() {
        let server = MockServer::start().await;
        mount_chat(&server, sse(sse_body(&["ok"]))).await;
        assert!(client_for(&server.uri(), Some(KEY)).test().await.is_ok());

        let refusing = MockServer::start().await;
        mount_chat(&refusing, ResponseTemplate::new(401)).await;
        let err = client_for(&refusing.uri(), Some(KEY))
            .test()
            .await
            .expect_err("bad key");
        assert_eq!(err.code, ErrorCode::ProviderAuth);
    }

    #[test]
    fn debug_never_shows_the_key() {
        let client = client_for("http://127.0.0.1:1", Some(KEY));
        let text = format!("{client:?} {client:#?}");
        assert!(!text.contains(KEY), "{text}");
        assert!(text.contains("***"));
    }

    #[test]
    fn construction_checks_profile_and_url() {
        let openai = profile("openai").expect("openai profile");
        for bad in [
            "ftp://x",
            "http://example.com/v1",
            "https://u:p@example.com",
        ] {
            let err = GenaiClient::new(openai, Some(bad), None).expect_err(bad);
            assert_eq!(err.code, ErrorCode::SchemaInvalid, "{bad}");
        }
        let cli = profile("claude-code").expect("cli profile");
        assert!(GenaiClient::new(cli, None, None).is_err());
        for p in crate::ai::profiles::profiles()
            .iter()
            .filter(|p| p.kind == ProviderKind::GenaiAdapter)
        {
            assert!(GenaiClient::new(p, None, None).is_ok(), "{}", p.id);
        }
    }
}
