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

/// The whole call (connect, every chunk, the end) must finish within this.
const CALL_TIMEOUT: Duration = Duration::from_secs(60);
/// Events waiting for the reader before the producer waits too.
const CHANNEL_CAPACITY: usize = 32;
/// More answer text than this ends the reply with an error.
const MAX_REPLY_BYTES: usize = 1024 * 1024;
/// More model names than this are dropped.
const MAX_MODELS: usize = 2000;
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
    default_model: Option<String>,
    timeout: Duration,
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
        let mut builder = Client::builder()
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
            default_model: profile.default_model().map(str::to_owned),
            timeout: CALL_TIMEOUT,
        })
    }

    /// Replaces the 60 s limit on a whole call.
    pub fn with_timeout(self, timeout: Duration) -> Self {
        Self { timeout, ..self }
    }

    fn map_error(&self, err: &genai::Error) -> AppError {
        map_error(err, self.key.as_ref())
    }

    /// Sends the request and reads up to the first event that carries content,
    /// so a refused call fails here and not on the stream.
    async fn open(
        &self,
        model: String,
        chat: ChatRequest,
    ) -> Result<(EventStream, Option<ChatStreamEvent>), AppError> {
        let options = ChatOptions::default().with_capture_usage(true);
        let response = self
            .client
            .exec_chat_stream(model, chat, Some(&options))
            .await
            .map_err(|e| self.map_error(&e))?;
        let mut stream: EventStream = Box::pin(response.stream);
        loop {
            match stream.next().await {
                None => return Ok((stream, None)),
                Some(Err(e)) => return Err(self.map_error(&e)),
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
            let input_bytes = req.system.len() + req.user.len();
            let mut chat = ChatRequest::new(vec![ChatMessage::user(req.user)]);
            if !req.system.is_empty() {
                chat = chat.with_system(req.system);
            }

            let (tx, rx) = mpsc::channel(CHANNEL_CAPACITY);
            let opened = tokio::select! {
                () = cancel.cancelled() => return Ok(rx),
                r = tokio::time::timeout_at(deadline, self.open(model, chat)) => r,
            };
            let (stream, first) = opened.map_err(|_| timeout_error())??;
            let key = self.key.clone();
            tokio::spawn(pump(Pump {
                stream,
                first,
                tx,
                cancel,
                deadline,
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
                self.timeout,
                self.client.all_model_names(self.adapter, config),
            )
            .await
            .map_err(|_| timeout_error())?;
            let mut names = listing.map_err(|e| self.map_error(&e))?;
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
                    r = tokio::time::timeout_at(p.deadline, p.stream.next()) => match r {
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
                send(&p.tx, &p.cancel, Err(map_error(&e, p.key.as_ref()))).await;
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

/// Maps a `genai` error to the closed error codes. The text kept for the UI
/// has the key and anything credential-shaped removed.
fn map_error(err: &genai::Error, key: Option<&SecretString>) -> AppError {
    use genai::Error as E;
    let status = status_of(err);
    let code = match (status, err) {
        (Some(401 | 403), _) => ErrorCode::ProviderAuth,
        (Some(429), _) => ErrorCode::ProviderRateLimit,
        (
            None,
            E::RequiresApiKey { .. }
            | E::NoAuthResolver { .. }
            | E::NoAuthData { .. }
            | E::Resolver { .. },
        ) => ErrorCode::ProviderAuth,
        _ => ErrorCode::ProviderUnavailable,
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
            (429, ErrorCode::ProviderRateLimit),
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
