//! The AI commands through the same functions the IPC commands call: an in-memory key store,
//! a scripted client and a temp config folder. No Keychain, provider or `claude` program.

#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::sync::Arc;
use std::time::Duration;

use daminus_core::ai::claude_cli::CliStatus;
use daminus_core::ai::fake::{FakeAiClient, FakeReply};
use daminus_core::ai::payload::SectionId;
use daminus_core::ai::profiles::{ModelSource, ProviderProfile};
use daminus_core::ai::view::{
    AiEventBody, AiStreamEvent, ClaudeCodeStatus, PreviewOptions, PreviewScope,
};
use daminus_core::ai::{AiClient, AiRequest, AiStream, BoxFuture, SecretString};
use daminus_core::domain::datetime::Timestamp;
use daminus_core::domain::error::{AppError, ErrorCode};
use daminus_core::domain::fact::CheckFact;
use daminus_core::domain::host::HostRef;
use daminus_core::domain::settings::AiSettings;
use daminus_core::domain::snapshot::{HostOutcome, Snapshot};
use daminus_core::probe::fake::FakeProbe;
use daminus_core::ssh::SshTools;
use daminus_core::ssh::fake::FakeTransport;
use daminus_core::store::FsStore;
use tempfile::TempDir;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::clients::ClientFactory;
use super::keystore::{MemoryStore, SecretStore};
use super::send::DisplayStream;
use crate::app::AppCore;

const CANARY: &str = "sk-CANARY-0123456789abcdef";

/// Hands out one client and remembers the key it was built with.
struct Fixed {
    client: Arc<dyn AiClient>,
    claude: ClaudeCodeStatus,
    key_seen: std::sync::Mutex<Option<String>>,
}

impl ClientFactory for Fixed {
    fn build(
        &self,
        profile: &ProviderProfile,
        _base_url: Option<&str>,
        key: Option<SecretString>,
        _claude_code_ack: bool,
    ) -> Result<Arc<dyn AiClient>, AppError> {
        if profile.needs_key && key.is_none() {
            return Err(ErrorCode::ProviderAuth.into());
        }
        *self.key_seen.lock().unwrap() = key.map(|k| k.expose().to_owned());
        Ok(Arc::clone(&self.client))
    }

    fn claude_code_status(&self) -> BoxFuture<'_, ClaudeCodeStatus> {
        let status = self.claude.clone();
        Box::pin(async move { status })
    }
}

struct Rig {
    _dir: TempDir,
    core: AppCore,
    keys: Arc<MemoryStore>,
    factory: Arc<Fixed>,
    events: mpsc::Receiver<AiStreamEvent>,
}

fn rig_with(client: Arc<dyn AiClient>) -> Rig {
    let dir = TempDir::new().unwrap();
    let keys = Arc::new(MemoryStore::default());
    let factory = Arc::new(Fixed {
        client,
        claude: ClaudeCodeStatus::from(CliStatus {
            version: "2.1.0".into(),
            logged_in: true,
            auth_method: Some("claude.ai".into()),
        }),
        key_seen: std::sync::Mutex::default(),
    });
    let (core, events) = AppCore::new(
        Arc::new(FakeTransport::new()),
        SshTools::new(),
        Arc::new(FakeProbe::new()),
        FsStore::new(dir.path()),
    );
    let core = core
        .with_secret_store(keys.clone())
        .with_client_factory(factory.clone());
    Rig {
        _dir: dir,
        core,
        keys,
        factory,
        events: events.ai,
    }
}

fn reply(summary: &str) -> Vec<String> {
    let json = format!(r#"{{"summary":"{summary}","findings":[]}}"#);
    let cut = json.len() / 2;
    vec![json[..cut].to_owned(), json[cut..].to_owned()]
}

fn rig(reply: FakeReply) -> (Rig, Arc<FakeAiClient>) {
    let client = Arc::new(FakeAiClient::new(reply));
    (rig_with(client.clone()), client)
}

async fn select(core: &AppCore, provider: &str) {
    core.ai_settings_set(AiSettings {
        provider: Some(provider.to_owned()),
        model: Some("m1".to_owned()),
        ..AiSettings::default()
    })
    .await
    .unwrap();
}

fn options() -> PreviewOptions {
    PreviewOptions {
        question: "What is wrong?".to_owned(),
        include: vec![SectionId::CheckResults, SectionId::Diff],
        hide_hosts: true,
    }
}

async fn until_end(rx: &mut mpsc::Receiver<AiStreamEvent>) -> Vec<AiStreamEvent> {
    let mut seen = Vec::new();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("an event in time")
            .expect("the channel stays open");
        let last = matches!(
            event.body,
            AiEventBody::Done { .. } | AiEventBody::Error { .. } | AiEventBody::Cancelled
        );
        seen.push(event);
        if last {
            return seen;
        }
    }
}

#[tokio::test]
async fn the_payload_sent_is_the_payload_previewed() {
    let (mut r, client) = rig(FakeReply::Deltas(reply("All fine")));
    select(&r.core, "ollama").await;
    let preview = r
        .core
        .ai_payload_preview(PreviewScope::Whole, options())
        .await
        .unwrap();
    r.core.ai_analyze("req-1", &preview.hash).await.unwrap();
    let events = until_end(&mut r.events).await;

    let sent = client.requests();
    assert_eq!(sent.len(), 1);
    assert_eq!(
        (sent[0].system.as_str(), sent[0].user.as_str()),
        (preview.system.as_str(), preview.user.as_str())
    );
    assert_eq!(sent[0].model.as_deref(), Some("m1"));
    let kept = r.core.ai.payload(&preview.hash).unwrap();
    assert_eq!(kept.current_hash(), preview.hash);

    assert!(events.iter().all(|e| e.request_id == "req-1"));
    let seqs: Vec<u32> = events.iter().map(|e| e.seq).collect();
    assert_eq!(
        seqs,
        (1..=u32::try_from(events.len()).unwrap()).collect::<Vec<_>>()
    );
    let deltas: String = events
        .iter()
        .filter_map(|e| match &e.body {
            AiEventBody::SummaryDelta { text } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert!("All fine".starts_with(&deltas));
    let Some(AiEventBody::Done {
        summary,
        reviewed_sends,
        offer_turning_off_review,
    }) = events.last().map(|e| e.body.clone())
    else {
        panic!("a send ends with done");
    };
    assert_eq!(summary, "All fine");
    assert_eq!((reviewed_sends, offer_turning_off_review), (1, false));
    assert_eq!(r.core.store.load_state().unwrap().ai_reviewed_sends, 1);
    // The request is free again once it ended.
    assert!(!r.core.ai_cancel("req-1"));
}

fn scan_of(hosts: &[&str]) -> Snapshot {
    let at = Timestamp::from_unix(1_790_000_000);
    let mut snap = Snapshot::new(at, at);
    for name in hosts {
        let host = HostRef::parse(name).unwrap();
        snap.hosts.insert(host.clone(), HostOutcome::Reached);
        snap.facts.insert(
            host,
            vec![CheckFact::new("disk.fs", "/").with_data(serde_json::json!({ "pct": 97 }))],
        );
    }
    snap
}

#[tokio::test]
async fn a_finding_carries_the_key_of_the_payload_sent_not_of_the_latest_report() {
    let json = r#"{"summary":"s","findings":[{"id":"c1","why":"w"},{"id":"c9","why":"unknown"}]}"#;
    let (mut r, _client) = rig(FakeReply::Deltas(vec![json.to_owned()]));
    select(&r.core, "ollama").await;
    r.core
        .store
        .save_snapshot(scan_of(&["vps-b"]), None)
        .unwrap();
    let preview = r
        .core
        .ai_payload_preview(PreviewScope::Whole, options())
        .await
        .unwrap();
    // A scan lands between the preview and the answer, and `c1` of the latest report is another result.
    r.core
        .store
        .save_snapshot(scan_of(&["vps-a", "vps-b"]), None)
        .unwrap();
    let latest = r.core.report_latest().unwrap();
    assert_ne!(
        latest.items.first().map(|i| i.key.host.clone()),
        Some(HostRef::parse("vps-b").unwrap())
    );

    r.core.ai_analyze("req-k", &preview.hash).await.unwrap();
    let events = until_end(&mut r.events).await;
    let keys: Vec<_> = events
        .iter()
        .filter_map(|e| match &e.body {
            AiEventBody::Finding { finding, key } => Some((finding.id.clone(), key.clone())),
            _ => None,
        })
        .collect();
    assert_eq!(keys.len(), 1, "the unknown id is dropped");
    let (id, key) = &keys[0];
    assert_eq!(id, "c1");
    let key = key.as_ref().expect("c1 names a result of the payload");
    assert_eq!(key.host, HostRef::parse("vps-b").unwrap());
    assert_eq!((key.check.as_str(), key.target.as_str()), ("disk.fs", "/"));
}

#[tokio::test]
async fn a_hash_that_was_not_previewed_sends_nothing() {
    let (r, client) = rig(FakeReply::Deltas(reply("x")));
    select(&r.core, "ollama").await;
    let preview = r
        .core
        .ai_payload_preview(PreviewScope::Whole, options())
        .await
        .unwrap();
    let mut other = preview.hash.clone();
    other.replace_range(
        0..1,
        if preview.hash.starts_with('0') {
            "1"
        } else {
            "0"
        },
    );
    for hash in [other.as_str(), "", "not-a-hash"] {
        let e = r.core.ai_analyze("req-2", hash).await.unwrap_err();
        assert_eq!(e.code, ErrorCode::SchemaInvalid);
    }
    assert!(client.requests().is_empty());
    assert!(
        !r.core.ai_cancel("req-2"),
        "a refused request is not left running"
    );
}

#[tokio::test]
async fn a_send_needs_a_selected_provider_and_its_key() {
    let (r, client) = rig(FakeReply::Deltas(reply("x")));
    let preview = r
        .core
        .ai_payload_preview(PreviewScope::Whole, options())
        .await
        .unwrap();
    let e = r.core.ai_analyze("a", &preview.hash).await.unwrap_err();
    assert_eq!(e.code, ErrorCode::SchemaInvalid, "AI is off");
    select(&r.core, "anthropic").await;
    let e = r.core.ai_analyze("a", &preview.hash).await.unwrap_err();
    assert_eq!(e.code, ErrorCode::ProviderAuth, "no key stored");
    assert!(client.requests().is_empty());
}

#[tokio::test]
async fn a_provider_failure_is_an_error_event_and_not_counted() {
    let (mut r, _client) = rig(FakeReply::Fail(ErrorCode::ProviderRateLimit));
    select(&r.core, "ollama").await;
    let preview = r
        .core
        .ai_payload_preview(PreviewScope::Whole, options())
        .await
        .unwrap();
    r.core.ai_analyze("e", &preview.hash).await.unwrap();
    let events = until_end(&mut r.events).await;
    assert_eq!(
        events.last().map(|e| e.body.clone()),
        Some(AiEventBody::Error {
            error: ErrorCode::ProviderRateLimit
        })
    );
    assert_eq!(r.core.store.load_state().unwrap().ai_reviewed_sends, 0);
}

/// Answers nothing until it is cancelled.
struct Hanging;

impl AiClient for Hanging {
    fn stream(
        &self,
        _req: AiRequest,
        cancel: CancellationToken,
    ) -> BoxFuture<'_, Result<AiStream, AppError>> {
        Box::pin(async move {
            let (tx, rx) = mpsc::channel(1);
            tokio::spawn(async move {
                cancel.cancelled().await;
                drop(tx);
            });
            Ok(rx)
        })
    }

    fn list_models(&self) -> BoxFuture<'_, Result<Vec<String>, AppError>> {
        Box::pin(async { Ok(Vec::new()) })
    }

    fn test(&self) -> BoxFuture<'_, Result<(), AppError>> {
        Box::pin(async { Ok(()) })
    }
}

#[tokio::test]
async fn cancelling_ends_with_cancelled_and_one_request_id_runs_once() {
    let mut r = rig_with(Arc::new(Hanging));
    select(&r.core, "ollama").await;
    let preview = r
        .core
        .ai_payload_preview(PreviewScope::Whole, options())
        .await
        .unwrap();
    r.core.ai_analyze("c", &preview.hash).await.unwrap();
    let again = r.core.ai_analyze("c", &preview.hash).await.unwrap_err();
    assert_eq!(again.code, ErrorCode::SchemaInvalid);
    assert!(r.core.ai_cancel("c"));
    let events = until_end(&mut r.events).await;
    assert_eq!(
        events.last().map(|e| e.body.clone()),
        Some(AiEventBody::Cancelled)
    );
    assert!(
        !events
            .iter()
            .any(|e| matches!(e.body, AiEventBody::Error { .. }))
    );
    assert!(!r.core.ai_cancel("c"));
    assert_eq!(r.core.store.load_state().unwrap().ai_reviewed_sends, 0);
}

#[tokio::test]
async fn keys_are_stored_removed_and_checked() {
    let (r, _client) = rig(FakeReply::Deltas(vec![]));
    assert!(
        r.core
            .ai_set_key("anthropic", Some(format!("  {CANARY} ")))
            .await
            .unwrap()
    );
    assert_eq!(
        r.keys
            .get("anthropic")
            .unwrap()
            .map(|k| k.expose().to_owned()),
        Some(CANARY.to_owned()),
        "stored trimmed"
    );
    let view = r.core.ai_providers().await.unwrap();
    assert_eq!(view.providers.len(), 8);
    let set: Vec<&str> = view
        .providers
        .iter()
        .filter(|p| p.key_set)
        .map(|p| p.profile.id.as_str())
        .collect();
    assert_eq!(set, ["anthropic"]);
    assert!(view.claude_code.found && view.claude_code.logged_in);
    assert!(!r.core.ai_set_key("anthropic", None).await.unwrap());
    assert!(r.keys.get("anthropic").unwrap().is_none());

    for (id, key) in [
        ("nope", Some("k".to_owned())),
        ("ollama", Some("k".to_owned())),
        ("claude-code", Some("k".to_owned())),
        ("anthropic", Some("   ".to_owned())),
        ("anthropic", Some("a\nb".to_owned())),
        ("anthropic", Some("k".repeat(5000))),
    ] {
        let e = r.core.ai_set_key(id, key).await.unwrap_err();
        assert_eq!(e.code, ErrorCode::SchemaInvalid, "{id}");
    }
}

#[tokio::test]
async fn settings_are_checked_before_they_are_written() {
    let (r, _client) = rig(FakeReply::Deltas(vec![]));
    let bad = [
        AiSettings {
            provider: Some("nope".into()),
            ..AiSettings::default()
        },
        AiSettings {
            provider: Some("ollama".into()),
            base_url: Some("http://example.com".into()),
            ..AiSettings::default()
        },
        AiSettings {
            provider: Some("claude-code".into()),
            base_url: Some("https://example.com".into()),
            ..AiSettings::default()
        },
    ];
    for ai in bad {
        let e = r.core.ai_settings_set(ai).await.unwrap_err();
        assert_eq!(e.code, ErrorCode::SchemaInvalid);
    }
    assert_eq!(r.core.settings_get().unwrap().ai, AiSettings::default());

    let good = AiSettings {
        provider: Some("ollama".into()),
        model: Some("llama3".into()),
        base_url: Some("http://localhost:11434".into()),
        claude_code_acknowledged: true,
    };
    let saved = r.core.ai_settings_set(good.clone()).await.unwrap();
    assert_eq!(saved.ai, good);
    let view = r.core.ai_providers().await.unwrap();
    assert_eq!(
        (
            view.provider.as_deref(),
            view.model.as_deref(),
            view.base_url.as_deref(),
            view.claude_code_ack
        ),
        (
            Some("ollama"),
            Some("llama3"),
            Some("http://localhost:11434"),
            true
        )
    );
}

#[tokio::test]
async fn models_come_from_the_provider_or_fall_back_to_manual_entry() {
    let client =
        Arc::new(FakeAiClient::new(FakeReply::Deltas(vec![])).with_models(Ok(vec!["zeta".into()])));
    let r = rig_with(client);
    let listed = r.core.ai_models("ollama").await.unwrap();
    assert_eq!(
        (listed.source, listed.manual_entry),
        (ModelSource::Provider, false)
    );

    let failing = Arc::new(
        FakeAiClient::new(FakeReply::Deltas(vec![]))
            .with_models(Err(ErrorCode::ProviderUnavailable)),
    );
    let r = rig_with(failing);
    let fallback = r.core.ai_models("ollama").await.unwrap();
    assert_eq!(
        (fallback.source, fallback.manual_entry),
        (ModelSource::Suggested, true)
    );
    // No key stored: the list cannot be asked for, and typing a model is still possible.
    let keyless = r.core.ai_models("anthropic").await.unwrap();
    assert!(keyless.manual_entry);
    assert_eq!(
        r.core.ai_models("nope").await.unwrap_err().code,
        ErrorCode::SchemaInvalid
    );
}

#[tokio::test]
async fn a_test_uses_the_stored_key_and_reports_failure_as_data() {
    let (r, _client) = rig(FakeReply::Deltas(vec![]));
    let no_key = r.core.ai_test("anthropic").await.unwrap();
    assert!(!no_key.ok);
    assert_eq!(no_key.error, Some(ErrorCode::ProviderAuth));
    r.core
        .ai_set_key("anthropic", Some(CANARY.to_owned()))
        .await
        .unwrap();
    let ok = r.core.ai_test("anthropic").await.unwrap();
    assert!(ok.ok && ok.error.is_none());
    assert_eq!(r.factory.key_seen.lock().unwrap().as_deref(), Some(CANARY));

    let (r, _client) = rig(FakeReply::Fail(ErrorCode::ProviderAuth));
    let bad = r.core.ai_test("ollama").await.unwrap();
    assert_eq!((bad.ok, bad.error), (false, Some(ErrorCode::ProviderAuth)));
}

#[tokio::test]
async fn the_key_is_in_no_answer_event_or_error() {
    let (mut r, _client) = rig(FakeReply::Deltas(reply("done")));
    let mut seen: Vec<String> = Vec::new();
    let mut note = |v: serde_json::Value| seen.push(v.to_string());
    fn json<T: serde::Serialize>(v: &T) -> serde_json::Value {
        serde_json::to_value(v).unwrap()
    }

    note(json(
        &r.core
            .ai_set_key("anthropic", Some(CANARY.to_owned()))
            .await,
    ));
    note(json(
        &r.core.ai_set_key("nope", Some(CANARY.to_owned())).await,
    ));
    note(json(
        &r.core
            .ai_set_key("anthropic", Some(format!("{CANARY}\n")))
            .await,
    ));
    note(json(&r.core.ai_providers().await));
    note(json(
        &r.core
            .ai_settings_set(AiSettings {
                provider: Some("anthropic".into()),
                model: Some("m".into()),
                ..AiSettings::default()
            })
            .await,
    ));
    note(json(&r.core.ai_models("anthropic").await));
    note(json(&r.core.ai_test("anthropic").await));
    let preview = r
        .core
        .ai_payload_preview(PreviewScope::Whole, options())
        .await
        .unwrap();
    note(json(&Ok::<_, AppError>(preview.clone())));
    r.core.ai_analyze("k", &preview.hash).await.unwrap();
    for e in until_end(&mut r.events).await {
        note(serde_json::to_value(e).unwrap());
    }
    note(json(&r.core.ai_analyze("k2", "bad").await));
    note(json(&Ok::<_, AppError>(r.core.ai_cancel("k"))));
    note(json(&Ok::<_, AppError>(r.core.settings_get().unwrap())));

    assert!(seen.len() >= 11);
    for text in &seen {
        assert!(!text.contains("CANARY"), "{text}");
    }
    let state = std::fs::read_dir(r._dir.path()).unwrap();
    for entry in state.flatten() {
        if entry.path().is_file() {
            let text = std::fs::read_to_string(entry.path()).unwrap_or_default();
            assert!(!text.contains("CANARY"), "{}", entry.path().display());
        }
    }
}

#[test]
fn a_half_written_placeholder_is_held_back() {
    let restore = |t: &str| t.replace("[host-1]", "web-1");
    let mut shown = DisplayStream::new(&restore);
    let mut all = String::new();
    for piece in ["ok [ho", "st-1] and [", "x", "]"] {
        if let Some(text) = shown.push(piece) {
            all.push_str(&text);
        }
    }
    assert_eq!(all, "ok web-1 and [x]");
}
