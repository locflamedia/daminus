use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::json;
use tracing::field::{Field, Visit};

use super::*;
use crate::ai::fake::{FakeAiClient, FakeReply};
use crate::ai::payload::{FixedNonce, PayloadOptions, Scope, build_payload};
use crate::domain::datetime::Timestamp;
use crate::domain::evaluate::{Counts, Disposition, Item, Owner, Report};
use crate::domain::fact::{CheckFact, CheckKey};
use crate::domain::host::{HostAlias, HostRef};
use crate::domain::manifest::CheckGroup;
use crate::domain::severity::Severity;

type Test = Result<(), Box<dyn std::error::Error>>;

fn item(check: &str, target: &str, severity: Severity, data: serde_json::Value) -> Item {
    let host = HostAlias::parse("vps-hn-3")
        .map(HostRef::Alias)
        .unwrap_or(HostRef::Local);
    let key = CheckKey::new(host, check, target);
    let fact = CheckFact::new(key.check.clone(), key.target.clone()).with_data(data);
    Item {
        key,
        group: CheckGroup::Security,
        owner: Owner::Project {
            id: "kho-hang".to_owned(),
        },
        severity,
        disposition: Disposition::Active,
        delta: None,
        fact: Some(fact),
        checked_seq: Some(12),
        rule_broken: None,
    }
}

fn report() -> Report {
    Report {
        seq: Some(12),
        scanned_at: None,
        evaluated_at: Timestamp::from_unix(0),
        items: vec![
            item(
                "sec.upload_php",
                "uploads/x.php",
                Severity::Crit,
                json!({ "count": 1 }),
            ),
            item(
                "url.exposed",
                "https://shop.test/",
                Severity::Warn,
                json!({ "exposed": ["/.env"] }),
            ),
        ],
        projects: Vec::new(),
        servers: Vec::new(),
        disabled_groups: Vec::new(),
        rules_due: Vec::new(),
        counts: Counts::default(),
    }
}

fn payload_of(report: &Report) -> Result<Payload, AppError> {
    build_payload(
        report,
        &Scope::Whole,
        &PayloadOptions::new("Is this server hacked?"),
        &FixedNonce([0x22; 16]),
    )
}

fn payload() -> Result<Payload, AppError> {
    payload_of(&report())
}

const TARGET: SendTarget<'static> = SendTarget {
    provider: "fake",
    model: Some("m-1"),
};

const GOOD: &str = r#"{"summary":"Fix uploads first.","findings":[
  {"id":"c2","why":"The .env is public.","suggested_command":"curl -sI https://shop.test/.env"},
  {"id":"c1","why":"A PHP file sits in uploads.","suggested_command":""}]}"#;

fn fake(texts: &[&str]) -> FakeAiClient {
    FakeAiClient::new(FakeReply::Deltas(
        texts.iter().map(|t| (*t).to_owned()).collect(),
    ))
}

async fn run(client: &FakeAiClient, p: &Payload) -> Result<AiAnalysis, AppError> {
    analyze(
        client,
        &TARGET,
        p,
        &p.hash,
        &CancellationToken::new(),
        |_| {},
    )
    .await
}

#[test]
fn reads_plain_fenced_and_surrounded_replies() -> Test {
    let p = payload()?;
    let plain = parse_analysis(GOOD, &p)?;
    assert_eq!(plain.summary, "Fix uploads first.");
    assert_eq!(
        plain
            .findings
            .iter()
            .map(|f| (f.id.as_str(), f.rank))
            .collect::<Vec<_>>(),
        [("c2", 1), ("c1", 2)]
    );
    assert_eq!(
        plain
            .findings
            .first()
            .and_then(|f| f.suggested_command.as_deref()),
        Some("curl -sI https://shop.test/.env")
    );
    assert_eq!(
        plain
            .findings
            .get(1)
            .and_then(|f| f.suggested_command.clone()),
        None
    );

    let fenced = format!("Here you go {{not json}}:\n```json\n{GOOD}\n```\nHope it helps {{}}");
    assert_eq!(parse_analysis(&fenced, &p)?, plain);
    let prose = format!("Sure!\n{GOOD}\nAnything else?");
    assert_eq!(parse_analysis(&prose, &p)?, plain);
    Ok(())
}

#[test]
fn unknown_ids_repeats_and_extra_fields_are_dropped() -> Test {
    let p = payload()?;
    let text = r#"{"summary":"s","extra":1,"findings":[
      {"id":"c99","why":"made up"},
      {"id":"c1","why":"a","severity":"info","confidence":"high"},
      {"id":"c1","why":"again"}]}"#;
    let a = parse_analysis(text, &p)?;
    assert_eq!(a.findings.len(), 1);
    let first = a.findings.first().ok_or("no finding")?;
    assert_eq!(
        (first.id.as_str(), first.why.as_str(), first.rank),
        ("c1", "a", 1)
    );
    Ok(())
}

#[test]
fn severity_from_the_model_is_not_kept() -> Test {
    let p = payload()?;
    let a = parse_analysis(
        r#"{"summary":"s","severity":"ok","findings":[{"id":"c1","why":"w","severity":"ok","level":"info"}]}"#,
        &p,
    )?;
    let json = serde_json::to_value(&a)?;
    let keys: Vec<&str> = json["findings"][0]
        .as_object()
        .ok_or("not an object")?
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(keys, ["id", "rank", "why"]);
    assert!(json.get("severity").is_none());
    Ok(())
}

#[test]
fn texts_are_capped_and_commands_are_plain_text() -> Test {
    let p = payload()?;
    let long = "a".repeat(5000);
    let text = json!({
        "summary": format!("ok\u{202E}{long}"),
        "findings": [{
            "id": "c1",
            "why": long,
            "suggested_command": format!("ls\u{202E} -la\n\u{0007}\u{200B}&& rm x{long}")
        }]
    })
    .to_string();
    let a = parse_analysis(&text, &p)?;
    assert_eq!(a.summary.chars().count(), MAX_SUMMARY_CHARS);
    assert!(!a.summary.contains('\u{202E}'));
    let f = a.findings.first().ok_or("no finding")?;
    assert_eq!(f.why.chars().count(), MAX_WHY_CHARS);
    let cmd = f.suggested_command.as_deref().ok_or("no command")?;
    assert_eq!(cmd.chars().count(), MAX_COMMAND_CHARS);
    assert!(cmd.starts_with("ls -la&& rm x"));
    assert!(!cmd.chars().any(|c| c.is_control() || is_disguise(c)));
    Ok(())
}

#[test]
fn refuses_text_without_a_summary() -> Test {
    let p = payload()?;
    for bad in [
        "",
        "no json here",
        "{\"findings\":[]}",
        "{\"summary\":\"  \"}",
        "{\"summary\":",
    ] {
        let e = parse_analysis(bad, &p).err().ok_or("accepted")?;
        assert_eq!(e.code, ErrorCode::SchemaInvalid, "{bad}");
    }
    Ok(())
}

#[test]
fn display_puts_real_names_back_and_keeps_commands_plain() -> Test {
    let p = payload()?;
    let (alias, real) = p.alias_table.iter().next().ok_or("no alias")?;
    let a = AiAnalysis {
        summary: format!("{alias} is hit"),
        findings: vec![AiFinding {
            id: "c1".into(),
            why: format!("on {alias}"),
            suggested_command: Some(format!("ssh {alias} 'ls'\u{202E}")),
            rank: 1,
        }],
    };
    let shown = a.restore_for_display(&p);
    assert_eq!(shown.summary, format!("{real} is hit"));
    assert_eq!(
        shown
            .findings
            .first()
            .and_then(|f| f.suggested_command.clone()),
        Some(format!("ssh {real} 'ls'"))
    );
    assert!(
        a.summary.contains(alias.as_str()),
        "the stored text is not changed"
    );
    Ok(())
}

#[tokio::test]
async fn changed_payload_sends_nothing() -> Test {
    let p = payload()?;
    let client = fake(&[GOOD]);
    let e = analyze(
        &client,
        &TARGET,
        &p,
        "0000",
        &CancellationToken::new(),
        |_| {},
    )
    .await
    .err()
    .ok_or("sent anyway")?;
    assert_eq!(e.code, ErrorCode::SchemaInvalid);
    assert_eq!(
        e.params.get("detail").map(String::as_str),
        Some("payload_changed")
    );
    assert!(client.requests().is_empty());
    Ok(())
}

#[tokio::test]
async fn sends_the_previewed_bytes_and_returns_the_analysis() -> Test {
    let p = payload()?;
    let client = fake(&[GOOD]);
    let a = run(&client, &p).await?;
    assert_eq!(a.findings.len(), 2);
    assert_eq!(client.requests(), [p.request(Some("m-1".into()), &p.hash)?]);
    Ok(())
}

#[tokio::test]
async fn broken_reply_is_asked_once_more_then_fails_clearly() -> Test {
    let p = payload()?;
    let client = fake(&["this is {not json"]);
    let e = run(&client, &p).await.err().ok_or("accepted")?;
    assert_eq!(e.code, ErrorCode::SchemaInvalid);
    assert_eq!(
        e.params.get("detail").map(String::as_str),
        Some("reply_not_json")
    );
    assert_eq!(client.requests().len(), 2);
    Ok(())
}

/// Answers each call from a list, so a retry can differ from the first try.
struct Sequence {
    replies: Mutex<Vec<FakeReply>>,
    seen: Arc<Mutex<usize>>,
}

impl AiClient for Sequence {
    fn stream(
        &self,
        req: crate::ai::AiRequest,
        cancel: CancellationToken,
    ) -> crate::ai::BoxFuture<'_, Result<crate::ai::AiStream, AppError>> {
        let next = self.replies.lock().map(|mut r| r.remove(0)).ok();
        if let Ok(mut n) = self.seen.lock() {
            *n += 1;
        }
        Box::pin(async move {
            FakeAiClient::new(next.unwrap_or(FakeReply::Deltas(Vec::new())))
                .stream(req, cancel)
                .await
        })
    }

    fn list_models(&self) -> crate::ai::BoxFuture<'_, Result<Vec<String>, AppError>> {
        Box::pin(async { Ok(Vec::new()) })
    }

    fn test(&self) -> crate::ai::BoxFuture<'_, Result<(), AppError>> {
        Box::pin(async { Ok(()) })
    }
}

#[tokio::test]
async fn valid_reply_on_the_retry_succeeds() -> Test {
    let p = payload()?;
    let seen = Arc::new(Mutex::new(0));
    let client = Sequence {
        replies: Mutex::new(vec![
            FakeReply::Deltas(vec!["{\"summary\": \"Fix up".into()]),
            FakeReply::Deltas(vec![GOOD.into()]),
        ]),
        seen: Arc::clone(&seen),
    };
    let mut summary = String::new();
    let a = analyze(
        &client,
        &TARGET,
        &p,
        &p.hash,
        &CancellationToken::new(),
        |d| {
            summary.push_str(d);
        },
    )
    .await?;
    assert_eq!(a.summary, "Fix uploads first.");
    assert_eq!(seen.lock().map(|n| *n).unwrap_or(0), 2);
    // The retry's text continues what the first attempt showed, once.
    assert_eq!(summary, "Fix uploads first.");
    Ok(())
}

#[tokio::test]
async fn size_limit_failures_are_not_asked_again() -> Test {
    let p = payload()?;
    let huge = "a".repeat(MAX_REPLY_BYTES + 1);
    let client = fake(&[huge.as_str()]);
    let e = run(&client, &p).await.err().ok_or("accepted")?;
    assert_eq!(
        e.params.get("detail").map(String::as_str),
        Some("reply_too_long")
    );
    assert_eq!(client.requests().len(), 1);
    Ok(())
}

#[tokio::test]
async fn cancelling_returns_cancelled_and_logs_nothing() -> Test {
    let p = payload()?;
    let lines = Arc::new(Lines::default());
    let _guard = tracing::subscriber::set_default(Capture(Arc::clone(&lines)));
    // A callsite first hit while no subscriber was set (another test thread) caches "never";
    // without a rebuild its events would skip this capture now and then.
    tracing::callsite::rebuild_interest_cache();
    let client = fake(&[GOOD]);
    let cancel = CancellationToken::new();
    cancel.cancel();
    let e = analyze(&client, &TARGET, &p, &p.hash, &cancel, |_| {})
        .await
        .err()
        .ok_or("finished")?;
    assert_eq!(e.code, ErrorCode::Cancelled);
    assert!(!e.retryable);
    assert_eq!(client.requests().len(), 1);
    assert!(lines.0.lock().map(|l| l.is_empty()).unwrap_or(false));
    Ok(())
}

#[test]
fn a_request_needs_the_previewed_hash() -> Test {
    let p = payload()?;
    let e = p.request(None, "0000").err().ok_or("built anyway")?;
    assert_eq!(
        e.params.get("detail").map(String::as_str),
        Some("payload_changed")
    );
    assert!(p.request(None, &p.hash).is_ok());
    Ok(())
}

#[tokio::test]
async fn provider_errors_are_not_retried() -> Test {
    let p = payload()?;
    let client = FakeAiClient::new(FakeReply::Fail(ErrorCode::ProviderAuth));
    let e = run(&client, &p).await.err().ok_or("accepted")?;
    assert_eq!(e.code, ErrorCode::ProviderAuth);
    assert_eq!(client.requests().len(), 1);
    Ok(())
}

#[tokio::test]
async fn summary_arrives_in_pieces_before_the_reply_ends() -> Test {
    let p = payload()?;
    let pieces = [
        "{\"summ",
        "ary\": \"Fix up",
        "loads fi",
        "rst.\", \"findings\": []}",
    ];
    let client = fake(&pieces);
    let mut got: Vec<String> = Vec::new();
    let a = analyze(
        &client,
        &TARGET,
        &p,
        &p.hash,
        &CancellationToken::new(),
        |d| {
            got.push(d.to_owned());
        },
    )
    .await?;
    assert_eq!(a.summary, "Fix uploads first.");
    assert_eq!(got, ["Fix up", "loads fi", "rst."]);
    Ok(())
}

// -- the log

#[derive(Default)]
struct Lines(Mutex<Vec<String>>);

struct Collect<'a>(&'a mut String);

impl Visit for Collect<'_> {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.0.push_str(&format!("{}={value:?} ", field.name()));
    }
}

struct Capture(Arc<Lines>);

impl tracing::Subscriber for Capture {
    fn enabled(&self, _: &tracing::Metadata<'_>) -> bool {
        true
    }
    fn new_span(&self, _: &tracing::span::Attributes<'_>) -> tracing::span::Id {
        tracing::span::Id::from_u64(1)
    }
    fn record(&self, _: &tracing::span::Id, _: &tracing::span::Record<'_>) {}
    fn record_follows_from(&self, _: &tracing::span::Id, _: &tracing::span::Id) {}
    fn event(&self, event: &tracing::Event<'_>) {
        let mut line = String::new();
        event.record(&mut Collect(&mut line));
        if let Ok(mut all) = self.0.0.lock() {
            all.push(line);
        }
    }
    fn enter(&self, _: &tracing::span::Id) {}
    fn exit(&self, _: &tracing::span::Id) {}
}

#[tokio::test]
async fn canaries_reach_neither_the_request_nor_the_log() -> Test {
    let mut r = report();
    r.items.push(item(
        "url.http",
        "https://CANARY_USER:CANARY_PASS@shop.test/?token=CANARY_QUERY#CANARY_FRAGMENT",
        Severity::Warn,
        json!({ "args": "vite --token sk-CANARY_KEY_0123456789abcdef", "tokens": ["ghp_CANARY0123456789abcdefABCDEF"] }),
    ));
    let p = payload_of(&r)?;
    let lines = Arc::new(Lines::default());
    let _guard = tracing::subscriber::set_default(Capture(Arc::clone(&lines)));
    // A callsite first hit while no subscriber was set (another test thread) caches "never";
    // without a rebuild its events would skip this capture now and then.
    tracing::callsite::rebuild_interest_cache();
    // The reply echoes a canary; it must not reach the log either.
    let client = fake(&["{\"summary\":\"CANARY_REPLY\",\"findings\":[]}"]);
    run(&client, &p).await?;
    let failing = FakeAiClient::new(FakeReply::Fail(ErrorCode::ProviderRateLimit));
    run(&failing, &p).await.err().ok_or("accepted")?;

    let sent: String = client
        .requests()
        .iter()
        .map(|q| format!("{}{}", q.system, q.user))
        .collect();
    let logged = lines.0.lock().map(|l| l.join("\n")).unwrap_or_default();
    assert!(
        logged.contains("provider=\"fake\"") || logged.contains("provider=fake"),
        "{logged}"
    );
    assert!(logged.contains("outcome"), "{logged}");
    assert!(logged.contains("provider_rate_limit"), "{logged}");
    for canary in [
        "CANARY_USER",
        "CANARY_PASS",
        "CANARY_QUERY",
        "CANARY_FRAGMENT",
        "CANARY_KEY",
        "ghp_CANARY",
    ] {
        assert!(!sent.contains(canary), "{canary} was sent");
        assert!(!logged.contains(canary), "{canary} was logged");
    }
    assert!(!logged.contains("CANARY_REPLY"));
    assert!(!logged.contains(&p.hash) && !logged.contains("data_"));
    Ok(())
}

// -- nothing runs a command

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            rust_files(&path, out)?;
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
    Ok(())
}

#[test]
fn only_the_claude_cli_starts_a_process() -> Test {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/ai");
    let mut files = Vec::new();
    rust_files(&dir, &mut files)?;
    assert!(files.len() > 5, "scan found too few files");
    // Written in pieces so this file does not match itself.
    let needles = [
        concat!("Command", "::new"),
        concat!("process", "::Command"),
        concat!("std::", "process"),
        concat!("tokio::", "process"),
    ];
    for file in files {
        if file.file_name().is_some_and(|n| n == "claude_cli.rs") {
            continue;
        }
        let text = fs::read_to_string(&file)?;
        for needle in needles {
            assert!(!text.contains(needle), "{needle} in {}", file.display());
        }
    }
    Ok(())
}

#[test]
fn no_field_of_the_analysis_is_executable() -> Test {
    let a = AiAnalysis {
        summary: "s".into(),
        findings: vec![AiFinding {
            id: "c1".into(),
            why: "w".into(),
            suggested_command: Some("ls".into()),
            rank: 1,
        }],
    };
    let json = serde_json::to_value(&a)?;
    assert_eq!(
        json["findings"][0],
        json!({"id": "c1", "why": "w", "suggested_command": "ls", "rank": 1})
    );
    assert_eq!(json.as_object().map(|o| o.len()), Some(2));
    Ok(())
}
