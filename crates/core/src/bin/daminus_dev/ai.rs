//! `daminus-dev ai`: the AI review from a terminal. `--dry-run` prints the
//! exact payload and sends nothing; otherwise the key is read from the
//! `DAMINUS_AI_KEY` environment variable and the streamed summary and the
//! ranked findings are printed. Suggested commands are printed, never run.

use std::io::Write as _;
use std::process::ExitCode;

use daminus_core::ai::claude_cli::{ClaudeCliClient, find_claude};
use daminus_core::ai::client::GenaiClient;
use daminus_core::ai::payload::{OsNonce, Payload, PayloadOptions, Scope, build_payload};
use daminus_core::ai::profiles::{ProviderKind, ProviderProfile, profile};
use daminus_core::ai::schema::{SendTarget, analyze};
use daminus_core::ai::{AiClient, SecretString};
use daminus_core::domain::datetime::Timestamp;
use daminus_core::domain::evaluate::Report;
use daminus_core::domain::host::HostAlias;
use daminus_core::scan::latest_report;
use daminus_core::store::FsStore;
use tokio_util::sync::CancellationToken;

const KEY_VAR: &str = "DAMINUS_AI_KEY";
const DEFAULT_PROVIDER: &str = "anthropic";
const DEFAULT_QUESTION: &str = "What should I do first?";

pub struct AiArgs {
    pub project: String,
    pub server: Option<String>,
    pub dry_run: bool,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub claude_code_ack: bool,
    pub question: Option<String>,
}

pub fn run(store: &FsStore, dir: &std::path::Path, args: AiArgs) -> ExitCode {
    match run_inner(store, dir, args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn run_inner(store: &FsStore, dir: &std::path::Path, args: AiArgs) -> Result<(), String> {
    let now = Timestamp::new(time::OffsetDateTime::now_utc());
    let report = latest_report(store, now).map_err(|e| format!("report: {e:?}"))?;
    if report.seq.is_none() {
        return Err(format!(
            "no scan saved in {}; run `daminus-dev scan` first",
            dir.display()
        ));
    }
    let scope = match &args.server {
        Some(alias) => {
            Scope::Server(HostAlias::parse(alias).map_err(|e| format!("--server {alias:?}: {e}"))?)
        }
        None => Scope::Project(args.project.clone()),
    };
    let question = args.question.as_deref().unwrap_or(DEFAULT_QUESTION);
    let payload = build_payload(&report, &scope, &PayloadOptions::new(question), &OsNonce)
        .map_err(|e| format!("payload: {e:?}"))?;
    if args.dry_run {
        print_payload(&payload);
        return Ok(());
    }

    let provider_id = args.provider.as_deref().unwrap_or(DEFAULT_PROVIDER);
    let profile =
        profile(provider_id).ok_or_else(|| format!("unknown provider {provider_id:?}"))?;
    let client = build_client(profile, &args)?;
    let runtime = tokio::runtime::Runtime::new().map_err(|e| format!("runtime: {e}"))?;
    let target = SendTarget {
        provider: &profile.id,
        model: args.model.as_deref(),
    };
    let cancel = CancellationToken::new();
    let analysis = runtime
        .block_on(async {
            tokio::select! {
                r = analyze(client.as_ref(), &target, &payload, &payload.hash, &cancel, |piece| {
                    print!("{piece}");
                    let _ = std::io::stdout().flush();
                }) => Some(r),
                _ = tokio::signal::ctrl_c() => {
                    cancel.cancel();
                    None
                }
            }
        })
        .ok_or("cancelled")?
        .map_err(|e| format!("\nai: {e:?}"))?;
    println!();
    print_findings(&report, &payload, &analysis);
    Ok(())
}

fn build_client(profile: &ProviderProfile, args: &AiArgs) -> Result<Box<dyn AiClient>, String> {
    match profile.kind {
        ProviderKind::ClaudeCli => {
            if !args.claude_code_ack {
                return Err(
                    "claude-code sends the question through your Claude account; pass --claude-code-ack to agree"
                        .to_owned(),
                );
            }
            let path_var = std::env::var("PATH").unwrap_or_default();
            let bin = find_claude(&path_var).ok_or("`claude` was not found on PATH")?;
            Ok(Box::new(ClaudeCliClient::new(bin, path_var, true)))
        }
        ProviderKind::GenaiAdapter => {
            let key = match std::env::var(KEY_VAR).ok().filter(|k| !k.trim().is_empty()) {
                Some(k) => Some(SecretString::new(k)),
                None if profile.needs_key => {
                    return Err(format!("{} needs a key: set {KEY_VAR}", profile.name));
                }
                None => None,
            };
            let client = GenaiClient::new(profile, args.base_url.as_deref(), key)
                .map_err(|e| format!("client: {e:?}"))?;
            Ok(Box::new(client))
        }
    }
}

fn print_payload(p: &Payload) {
    println!("== system ==\n{}\n\n== user ==\n{}\n", p.system, p.user);
    println!("== sections ==");
    for s in &p.sections {
        println!(
            "{:<16} {:>8} B  {} items  {} omitted  {}",
            s.id.key(),
            s.bytes,
            s.items,
            s.omitted,
            if s.included { "sent" } else { "not sent" }
        );
    }
    println!(
        "data {} B, total {} B\nhash {}",
        p.data_bytes, p.total_bytes, p.hash
    );
}

fn print_findings(
    report: &Report,
    payload: &Payload,
    analysis: &daminus_core::ai::schema::AiAnalysis,
) {
    let shown = analysis.restore_for_display(payload);
    if shown.findings.is_empty() {
        println!("no findings");
    }
    for f in &shown.findings {
        let item = payload
            .finding_key(&f.id)
            .and_then(|key| report.items.iter().find(|i| &i.key == key));
        let (severity, what) = item.map_or(("?".to_owned(), String::new()), |i| {
            (
                format!("{:?}", i.severity),
                format!("{} {}", i.key.check, i.key.target),
            )
        });
        println!("\n{}. [{severity}] {} {}", f.rank, f.id, what.trim());
        println!("   {}", f.why);
        if let Some(cmd) = &f.suggested_command {
            println!("   copy: {cmd}");
        }
    }
}
