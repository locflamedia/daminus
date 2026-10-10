//! The Claude Code CLI as an [`AiClient`] (profile `claude-code`): the user's
//! own `claude` command, signed in with their subscription, run once per
//! question with no tools, no session and an empty working folder.
//!
//! The core never opens `~/.claude` and never reads a token: the CLI keeps its
//! own login. The caller resolves the binary (login shell `PATH`) and passes
//! it in; [`find_claude`] is the pure lookup for that.

use std::os::unix::fs::PermissionsExt as _;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use nix::sys::signal::{Signal, killpg};
use nix::unistd::Pid;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::process::{Child, ChildStdout, Command};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::{AiClient, AiEvent, AiRequest, AiStream, AiUsage, BoxFuture};
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::redact::redact_secrets;

/// Most text sent to `claude` on stdin.
pub const MAX_STDIN_BYTES: usize = 10 * 1024 * 1024;
/// Longest system prompt, as it travels in argv.
pub const MAX_SYSTEM_BYTES: usize = 100_000;
/// Longest stream-json line kept; a longer one is dropped.
const MAX_LINE_BYTES: usize = 1024 * 1024;
/// Most output read from one run.
const MAX_OUTPUT_BYTES: usize = 8 * 1024 * 1024;
/// Most stderr kept, for the log and for telling a login problem apart.
const MAX_STDERR_BYTES: usize = 16 * 1024;
/// How long a reply may take.
pub const RUN_TIMEOUT: Duration = Duration::from_secs(120);
/// How long `claude --version` and `claude auth status` may take.
const DETECT_TIMEOUT: Duration = Duration::from_secs(10);

type Sender = mpsc::Sender<Result<AiEvent, AppError>>;

/// What `claude` reports about itself, for the provider tile.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CliStatus {
    pub version: String,
    pub logged_in: bool,
    /// How it is signed in (`authMethod` of `claude auth status`), when it says.
    pub auth_method: Option<String>,
}

/// The first executable file named `claude` on `path_var` (a `PATH` value).
/// Empty and relative entries are skipped.
pub fn find_claude(path_var: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    find_claude_in(path_var, &fallback_dirs(home.as_deref()))
}

/// Where Claude Code installs itself when the login shell's PATH does not
/// name it: the native installer, the old local install, Homebrew on Apple
/// silicon and on Intel. Looked at after PATH, in this order.
fn fallback_dirs(home: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = home.filter(|h| h.is_absolute()) {
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".claude/local"));
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs
}

fn find_claude_in(path_var: &str, fallbacks: &[PathBuf]) -> Option<PathBuf> {
    path_var
        .split(':')
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .chain(fallbacks.iter().cloned())
        .map(|dir| dir.join("claude"))
        .find(|candidate| {
            std::fs::metadata(candidate)
                .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
                .unwrap_or(false)
        })
}

/// Runs `claude --version` and `claude auth status`. Not installed gives
/// `ClaudeCliNotFound`; installed but signed out is `logged_in: false`.
pub async fn detect(bin: &Path, path_var: &str) -> Result<CliStatus, AppError> {
    let dir = scratch_dir()?;
    let version = run_short(bin, path_var, dir.path(), &["--version"]).await?;
    let version = String::from_utf8_lossy(&version.stdout)
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_owned();
    let auth = run_short(bin, path_var, dir.path(), &["auth", "status", "--json"]).await?;
    // Text output (or anything that is not JSON) cannot say the user is signed in.
    let json: Value = serde_json::from_slice(&auth.stdout).unwrap_or(Value::Null);
    let logged_in = auth.status.success() && json["loggedIn"].as_bool() == Some(true);
    Ok(CliStatus {
        version,
        logged_in,
        auth_method: json["authMethod"]
            .as_str()
            .filter(|_| logged_in)
            .map(str::to_owned),
    })
}

/// The Claude Code CLI behind [`AiClient`].
#[derive(Clone, Debug)]
pub struct ClaudeCliClient {
    bin: PathBuf,
    path_var: String,
    ack: bool,
    timeout: Duration,
}

impl ClaudeCliClient {
    /// `bin` is the resolved `claude`; `path_var` the `PATH` it runs with (its
    /// own scripts may need `node`); `claude_code_ack` is the user's consent to
    /// send questions through their Claude account. Without it every call fails.
    pub fn new(bin: PathBuf, path_var: String, claude_code_ack: bool) -> Self {
        Self {
            bin,
            path_var,
            ack: claude_code_ack,
            timeout: RUN_TIMEOUT,
        }
    }

    pub fn with_timeout(self, timeout: Duration) -> Self {
        Self { timeout, ..self }
    }

    fn allowed(&self) -> Result<(), AppError> {
        if self.ack {
            Ok(())
        } else {
            Err(ErrorCode::ProviderAuth.into())
        }
    }
}

impl AiClient for ClaudeCliClient {
    fn stream(
        &self,
        req: AiRequest,
        cancel: CancellationToken,
    ) -> BoxFuture<'_, Result<AiStream, AppError>> {
        Box::pin(async move {
            self.allowed()?;
            check_request(&req)?;
            let dir = scratch_dir()?;
            let mut cmd = command(&self.bin, &self.path_var, dir.path());
            cmd.args(run_args(&req))
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            let mut child = spawn(&mut cmd).await?;
            let guard = GroupGuard::of(&child);
            let (Some(mut stdin), Some(stdout), Some(stderr)) =
                (child.stdin.take(), child.stdout.take(), child.stderr.take())
            else {
                return Err(ErrorCode::Internal.into());
            };
            let user = req.user.into_bytes();
            let writer = tokio::spawn(async move {
                // A child that exits early closes the pipe; its output says why.
                let _ = stdin.write_all(&user).await;
                let _ = stdin.shutdown().await;
            });
            let stderr = tokio::spawn(read_capped(stderr, MAX_STDERR_BYTES));
            let (tx, rx) = mpsc::channel(64);
            let timeout = self.timeout;
            tokio::spawn(async move {
                supervise(
                    Running { child, guard, dir },
                    stdout,
                    stderr,
                    writer,
                    tx,
                    cancel,
                    timeout,
                )
                .await;
            });
            Ok(rx)
        })
    }

    fn list_models(&self) -> BoxFuture<'_, Result<Vec<String>, AppError>> {
        // The CLI has no model list; the profile's suggestions are used.
        Box::pin(async move { self.allowed().map(|()| Vec::new()) })
    }

    fn test(&self) -> BoxFuture<'_, Result<(), AppError>> {
        Box::pin(async move {
            self.allowed()?;
            let status = detect(&self.bin, &self.path_var).await?;
            if status.logged_in {
                Ok(())
            } else {
                Err(ErrorCode::ClaudeCliNotLoggedIn.into())
            }
        })
    }
}

fn check_request(req: &AiRequest) -> Result<(), AppError> {
    let bad = |what: &str| AppError::from(ErrorCode::SchemaInvalid).with_param("field", what);
    if req.user.len() > MAX_STDIN_BYTES {
        return Err(bad("user").with_param("max_bytes", MAX_STDIN_BYTES.to_string()));
    }
    if req.system.len() > MAX_SYSTEM_BYTES {
        return Err(bad("system").with_param("max_bytes", MAX_SYSTEM_BYTES.to_string()));
    }
    // A model name must not be read as a flag.
    if req.model.as_deref().is_some_and(|m| m.starts_with('-')) {
        return Err(bad("model"));
    }
    Ok(())
}

/// The command line for one question. The user's text is not here: it goes on stdin.
fn run_args(req: &AiRequest) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--tools",
        "",
        "--no-session-persistence",
        "--safe-mode",
        "--permission-mode",
        "dontAsk",
        "--permission-prompts",
        "none",
        "--max-turns",
        "1",
        "--system-prompt",
    ]
    .map(str::to_owned)
    .into();
    args.push(req.system.clone());
    if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
        args.push("--model".to_owned());
        args.push(model.to_owned());
    }
    args
}

/// Credentials a child must never see. Ported from Hermes
/// (NousResearch/hermes-agent dce1e9b, `tools/environments/local_env_policy.py`
/// `_STATIC_PROVIDER_ENV_BLOCKLIST`), the provider keys and service secrets it
/// strips from every CLI it spawns.
const SECRET_ENV: &[&str] = &[
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "OPENAI_API_BASE",
    "OPENAI_ORG_ID",
    "OPENAI_ORGANIZATION",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_TOKEN",
    "LLM_MODEL",
    "GOOGLE_API_KEY",
    "VERTEX_CREDENTIALS_PATH",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "DEEPSEEK_API_KEY",
    "MISTRAL_API_KEY",
    "GROQ_API_KEY",
    "TOGETHER_API_KEY",
    "PERPLEXITY_API_KEY",
    "COHERE_API_KEY",
    "FIREWORKS_API_KEY",
    "XAI_API_KEY",
    "HELICONE_API_KEY",
    "PARALLEL_API_KEY",
    "FIRECRAWL_API_KEY",
    "FIRECRAWL_API_URL",
    "EMAIL_PASSWORD",
    "GH_TOKEN",
    "GITHUB_APP_PRIVATE_KEY_PATH",
    "MODAL_TOKEN_ID",
    "MODAL_TOKEN_SECRET",
    "DAYTONA_API_KEY",
    "GATEWAY_RELAY_SECRET",
    "GATEWAY_RELAY_DELIVERY_KEY",
    "VERCEL_OIDC_TOKEN",
    "VERCEL_TOKEN",
    "NOUS_API_KEY",
    "QWEN_API_KEY",
    "AWS_BEARER_TOKEN_BEDROCK",
    "MSGRAPH_CLIENT_SECRET",
    "QQ_STT_API_KEY",
];

/// Whether `name` holds a secret: the Hermes list and its dynamic names
/// (`AUXILIARY_*_API_KEY`/`_BASE_URL`, `GATEWAY_RELAY_*_SECRET`/`_KEY`/`_TOKEN`,
/// `_is_hermes_internal_secret`), every `ANTHROPIC_*` and `CLAUDE_CODE_*` (no
/// key or token may steer `claude` away from the user's own sign-in), and any
/// name ending in `_API_KEY`, `_TOKEN`, `_SECRET` or `_PASSWORD`. Case-folded,
/// as Hermes matches.
fn is_secret_env(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    SECRET_ENV.contains(&upper.as_str())
        || upper.starts_with("ANTHROPIC_")
        || upper.starts_with("CLAUDE_CODE_")
        || (upper.starts_with("AUXILIARY_")
            && (upper.ends_with("_API_KEY") || upper.ends_with("_BASE_URL")))
        || (upper.starts_with("GATEWAY_RELAY_")
            && ["_SECRET", "_KEY", "_TOKEN"]
                .iter()
                .any(|s| upper.ends_with(s)))
        || ["_API_KEY", "_TOKEN", "_SECRET", "_PASSWORD"]
            .iter()
            .any(|s| upper.ends_with(s))
}

/// The environment `claude` runs with, the way Hermes spawns a CLI: the app's
/// own environment, PATH from the login shell, and every secret left out
/// ([`is_secret_env`]). `USER` and `LOGNAME` are filled in when missing: on
/// macOS Claude Code finds its sign-in in the Keychain by user name and reads
/// as signed out without it. `LANG` falls back to `en_US.UTF-8`.
fn child_env(
    app: impl IntoIterator<Item = (String, String)>,
    path_var: &str,
) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = app
        .into_iter()
        .filter(|(name, _)| name != "PATH" && !is_secret_env(name))
        .collect();
    env.push(("PATH".to_owned(), path_var.to_owned()));
    let has =
        |env: &[(String, String)], name: &str| env.iter().any(|(n, v)| n == name && !v.is_empty());
    if !has(&env, "LANG") {
        env.retain(|(n, _)| n != "LANG");
        env.push(("LANG".to_owned(), "en_US.UTF-8".to_owned()));
    }
    let given = |name: &str| env.iter().find(|(n, _)| n == name).map(|(_, v)| v.clone());
    if let Some(user) = user_name(given("USER"), given("LOGNAME")) {
        env.retain(|(n, _)| n != "USER" && n != "LOGNAME");
        env.push(("USER".to_owned(), user.clone()));
        env.push(("LOGNAME".to_owned(), user));
    }
    env
}

/// The login name: `USER`, else `LOGNAME`, else the passwd entry of this
/// process's user (an app started from Finder can lack both variables).
fn user_name(user: Option<String>, logname: Option<String>) -> Option<String> {
    user.filter(|u| !u.is_empty())
        .or_else(|| logname.filter(|u| !u.is_empty()))
        .or_else(|| {
            nix::unistd::User::from_uid(nix::unistd::Uid::current())
                .ok()
                .flatten()
                .map(|u| u.name)
        })
}

fn command(bin: &Path, path_var: &str, cwd: &Path) -> Command {
    let mut cmd = Command::new(bin);
    cmd.env_clear()
        .envs(child_env(std::env::vars(), path_var))
        .current_dir(cwd)
        .process_group(0)
        .kill_on_drop(true);
    cmd
}

fn scratch_dir() -> Result<tempfile::TempDir, AppError> {
    tempfile::Builder::new()
        .prefix("daminus-claude-")
        .tempdir()
        .map_err(|e| {
            tracing::warn!(error = %e, "no scratch folder for claude");
            AppError::from(ErrorCode::Io {
                path: std::env::temp_dir().display().to_string(),
            })
        })
}

/// Spawns, telling a missing binary apart. A script just written can be
/// briefly busy; that is retried.
async fn spawn(cmd: &mut Command) -> Result<Child, AppError> {
    let mut tries = 0;
    loop {
        match cmd.spawn() {
            Ok(child) => return Ok(child),
            Err(e) if e.kind() == std::io::ErrorKind::ExecutableFileBusy && tries < 5 => {
                tries += 1;
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            Err(e) => {
                tracing::warn!(error = %e, "claude could not be started");
                return Err(ErrorCode::ClaudeCliNotFound.into());
            }
        }
    }
}

async fn run_short(
    bin: &Path,
    path_var: &str,
    cwd: &Path,
    args: &[&str],
) -> Result<std::process::Output, AppError> {
    let mut cmd = command(bin, path_var, cwd);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let child = spawn(&mut cmd).await?;
    let _guard = GroupGuard::of(&child);
    match tokio::time::timeout(DETECT_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(out)) => Ok(out),
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "claude did not answer");
            Err(ErrorCode::ClaudeCliNotFound.into())
        }
        Err(_) => Err(ErrorCode::Timeout.into()),
    }
}

/// Kills the whole process group of the child when dropped, so nothing it
/// started outlives the question.
struct GroupGuard(Option<Pid>);

impl GroupGuard {
    fn of(child: &Child) -> Self {
        Self(
            child
                .id()
                .and_then(|p| i32::try_from(p).ok())
                .map(Pid::from_raw),
        )
    }
}

impl Drop for GroupGuard {
    fn drop(&mut self) {
        if let Some(pgid) = self.0 {
            let _ = killpg(pgid, Signal::SIGKILL);
        }
    }
}

async fn read_capped(mut from: impl tokio::io::AsyncRead + Unpin, cap: usize) -> String {
    let mut kept = Vec::new();
    let mut buf = [0u8; 4096];
    while let Ok(n) = from.read(&mut buf).await {
        if n == 0 {
            break;
        }
        // Keep reading so the child never blocks on a full pipe.
        let room = cap.saturating_sub(kept.len());
        kept.extend_from_slice(&buf[..n.min(room)]);
    }
    String::from_utf8_lossy(&kept).into_owned()
}

/// Why a reply stopped without `Done`.
enum Stop {
    /// The caller cancelled or stopped listening.
    Quiet,
    Failed(AppError),
}

impl From<ErrorCode> for Stop {
    fn from(code: ErrorCode) -> Self {
        Stop::Failed(code.into())
    }
}

/// A started `claude`: the child, the group guard made when it was spawned
/// (the child's id is gone once it is reaped), and the scratch folder.
struct Running {
    child: Child,
    guard: GroupGuard,
    dir: tempfile::TempDir,
}

/// Runs one question to its end. The guard outlives every exit path,
/// including a child that exits without a result.
async fn supervise(
    running: Running,
    mut stdout: ChildStdout,
    mut stderr: JoinHandle<String>,
    writer: JoinHandle<()>,
    tx: Sender,
    cancel: CancellationToken,
    timeout: Duration,
) {
    let Running {
        mut child,
        guard,
        dir: _dir,
    } = running;
    let started = Instant::now();
    let outcome = tokio::select! {
        () = cancel.cancelled() => Err(Stop::Quiet),
        () = tokio::time::sleep(timeout) => Err(ErrorCode::Timeout.into()),
        r = read_reply(&mut stdout, &mut child, &mut stderr, &tx) => r,
    };
    // Kill the group first, then reap the leader.
    drop(guard);
    let _ = child.kill().await;
    writer.abort();
    stderr.abort();
    let last = match outcome {
        Ok(usage) => Ok(AiEvent::Done {
            usage,
            ms: u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
        }),
        Err(Stop::Failed(e)) => Err(e),
        Err(Stop::Quiet) => return,
    };
    let _ = tx.send(last).await;
}

/// What the stream-json lines say, gathered as they arrive.
#[derive(Default)]
struct Reply {
    sent_text: bool,
    /// The `error` of an assistant message (`authentication_failed`, ...).
    assistant_error: Option<String>,
    result: Option<ResultMsg>,
}

struct ResultMsg {
    is_error: bool,
    text: String,
    status: Option<u64>,
    usage: AiUsage,
}

impl Reply {
    /// Takes one line; returns the text delta it carries, if any.
    fn line(&mut self, raw: &[u8]) -> Option<String> {
        let v: Value = serde_json::from_slice(raw).ok()?;
        match v["type"].as_str()? {
            "stream_event" => {
                let ev = &v["event"];
                if ev["type"] == "content_block_delta" && ev["delta"]["type"] == "text_delta" {
                    let text = ev["delta"]["text"].as_str()?;
                    return (!text.is_empty()).then(|| text.to_owned());
                }
            }
            "assistant" => {
                if let Some(e) = v["error"].as_str() {
                    self.assistant_error = Some(e.to_owned());
                }
            }
            "result" => {
                let tokens = |k: &str| {
                    u32::try_from(v["usage"][k].as_u64().unwrap_or(0)).unwrap_or(u32::MAX)
                };
                self.result = Some(ResultMsg {
                    is_error: v["is_error"].as_bool().unwrap_or(false),
                    text: v["result"].as_str().unwrap_or_default().to_owned(),
                    status: v["api_error_status"].as_u64(),
                    usage: AiUsage {
                        tokens_in: tokens("input_tokens")
                            .saturating_add(tokens("cache_read_input_tokens"))
                            .saturating_add(tokens("cache_creation_input_tokens")),
                        tokens_out: tokens("output_tokens"),
                    },
                });
            }
            _ => {}
        }
        None
    }
}

/// Cuts output into lines, dropping any over [`MAX_LINE_BYTES`] and refusing
/// more than [`MAX_OUTPUT_BYTES`] in all.
#[derive(Default)]
struct LineSplitter {
    pending: Vec<u8>,
    overlong: bool,
    total: usize,
}

impl LineSplitter {
    /// `None` when the output passed its total limit.
    fn push(&mut self, chunk: &[u8]) -> Option<Vec<Vec<u8>>> {
        self.total += chunk.len();
        if self.total > MAX_OUTPUT_BYTES {
            return None;
        }
        let mut lines = Vec::new();
        for part in chunk.split_inclusive(|b| *b == b'\n') {
            let (body, complete) = match part.strip_suffix(b"\n") {
                Some(body) => (body, true),
                None => (part, false),
            };
            if !self.overlong {
                if self.pending.len() + body.len() > MAX_LINE_BYTES {
                    self.overlong = true;
                    self.pending.clear();
                } else {
                    self.pending.extend_from_slice(body);
                }
            }
            if complete {
                let line = std::mem::take(&mut self.pending);
                if !std::mem::take(&mut self.overlong) {
                    lines.push(line);
                }
            }
        }
        Some(lines)
    }

    fn finish(&mut self) -> Option<Vec<u8>> {
        let last = std::mem::take(&mut self.pending);
        (!self.overlong && !last.is_empty()).then_some(last)
    }
}

async fn read_reply(
    stdout: &mut ChildStdout,
    child: &mut Child,
    stderr: &mut JoinHandle<String>,
    tx: &Sender,
) -> Result<AiUsage, Stop> {
    let mut reply = Reply::default();
    let mut splitter = LineSplitter::default();
    let mut buf = vec![0u8; 16 * 1024];
    'read: loop {
        let n = stdout.read(&mut buf).await.unwrap_or(0);
        let lines = if n == 0 {
            splitter.finish().into_iter().collect()
        } else {
            splitter.push(&buf[..n]).ok_or(ErrorCode::SchemaInvalid)?
        };
        for line in lines {
            if let Some(text) = reply.line(&line) {
                reply.sent_text = true;
                tx.send(Ok(AiEvent::Delta(text)))
                    .await
                    .map_err(|_| Stop::Quiet)?;
            }
            if reply.result.is_some() {
                break 'read;
            }
        }
        if n == 0 {
            break;
        }
    }
    let mut err_text = String::new();
    if reply.result.is_none() {
        let _ = child.wait().await;
        err_text = stderr.await.unwrap_or_default();
        if !err_text.is_empty() {
            tracing::warn!(stderr = %redact_secrets(&err_text), "claude wrote to stderr");
        }
    }
    outcome(reply, &err_text, tx).await
}

async fn outcome(reply: Reply, err_text: &str, tx: &Sender) -> Result<AiUsage, Stop> {
    let known = |code: ErrorCode| (code != ErrorCode::ProviderUnavailable).then_some(code);
    let Some(result) = reply.result else {
        let code = reply
            .assistant_error
            .as_deref()
            .and_then(|e| known(classify(e)))
            .or_else(|| known(classify(err_text)))
            .unwrap_or(ErrorCode::SchemaInvalid);
        return Err(code.into());
    };
    if result.is_error {
        tracing::warn!(error = %redact_secrets(&result.text), status = ?result.status, "claude reported an error");
        let code = match result.status {
            Some(401 | 403) => ErrorCode::ClaudeCliNotLoggedIn,
            Some(429) => ErrorCode::ClaudeCliQuota,
            _ => reply
                .assistant_error
                .as_deref()
                .and_then(|e| known(classify(e)))
                .unwrap_or_else(|| classify(&result.text)),
        };
        return Err(code.into());
    }
    if !reply.sent_text && !result.text.is_empty() {
        tx.send(Ok(AiEvent::Delta(result.text)))
            .await
            .map_err(|_| Stop::Quiet)?;
    }
    Ok(result.usage)
}

/// Which error a message from `claude` is, by what it says. Anything
/// unrecognised is taken as the service being unavailable (worth retrying).
fn classify(text: &str) -> ErrorCode {
    let t = text.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| t.contains(w));
    if has(&[
        "authentication_failed",
        "authentication_error",
        "not logged in",
        "/login",
        "invalid api key",
        "oauth token",
    ]) {
        ErrorCode::ClaudeCliNotLoggedIn
    } else if has(&[
        "rate_limit",
        "rate limit",
        "usage limit",
        "limit reached",
        "quota",
    ]) {
        ErrorCode::ClaudeCliQuota
    } else {
        ErrorCode::ProviderUnavailable
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const SAFE_PATH: &str = "/usr/bin:/bin";

    const OK_BODY: &str = r#"cat >/dev/null
cat <<'END'
{"type":"system","subtype":"init"}
not json at all
{"type":"stream_event","event":{"type":"message_start"}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}}
{"type":"future_thing","x":1}
{"type":"result","subtype":"success","is_error":false,"result":"Hello","usage":{"input_tokens":12,"cache_read_input_tokens":8,"output_tokens":3}}
END
"#;

    fn script(dir: &Path, name: &str, body: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, format!("#!/bin/sh\n{body}")).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    fn client(bin: PathBuf) -> ClaudeCliClient {
        ClaudeCliClient::new(bin, SAFE_PATH.to_owned(), true)
    }

    fn req(user: &str) -> AiRequest {
        AiRequest {
            system: "be brief".into(),
            user: user.into(),
            model: None,
        }
    }

    async fn collect(c: &ClaudeCliClient, r: AiRequest) -> Vec<Result<AiEvent, AppError>> {
        let mut rx = c.stream(r, CancellationToken::new()).await.unwrap();
        let mut all = Vec::new();
        while let Some(ev) = rx.recv().await {
            all.push(ev);
        }
        all
    }

    fn error_of(events: Vec<Result<AiEvent, AppError>>) -> AppError {
        events
            .into_iter()
            .find_map(|e| e.err())
            .unwrap_or_else(|| ErrorCode::Internal.into())
    }

    fn alive(pid: i32) -> bool {
        nix::sys::signal::kill(Pid::from_raw(pid), None).is_ok()
    }

    async fn pid_from(file: &Path) -> i32 {
        for _ in 0..500 {
            if let Ok(text) = fs::read_to_string(file)
                && let Ok(pid) = text.trim().parse()
            {
                return pid;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        0
    }

    async fn gone(pid: i32) -> bool {
        for _ in 0..100 {
            if !alive(pid) {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        false
    }

    #[tokio::test]
    async fn streams_text_then_done_and_ignores_unknown_lines() {
        let dir = tempfile::tempdir().unwrap();
        let c = client(script(dir.path(), "claude", OK_BODY));
        let events = collect(&c, req("hi")).await;
        assert_eq!(events.len(), 3, "{events:?}");
        assert_eq!(events[0], Ok(AiEvent::Delta("Hel".into())));
        assert_eq!(events[1], Ok(AiEvent::Delta("lo".into())));
        match &events[2] {
            Ok(AiEvent::Done { usage, .. }) => {
                assert_eq!(
                    *usage,
                    AiUsage {
                        tokens_in: 20,
                        tokens_out: 3
                    }
                );
            }
            other => panic!("{other:?}"),
        }
    }

    #[tokio::test]
    async fn payload_only_on_stdin_with_clean_cwd_and_env() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("seen");
        fs::create_dir(&out).unwrap();
        let body = format!(
            "OUT='{o}'\nprintf '%s\\n' \"$@\" > \"$OUT/argv\"\npwd -P > \"$OUT/cwd\"\nls -A > \"$OUT/ls\"\nenv > \"$OUT/env\"\ncat > \"$OUT/stdin\"\n{OK_BODY}",
            o = out.display()
        );
        let c = client(script(dir.path(), "claude", &body));
        let mut r = req("SECRET-PAYLOAD line two");
        r.model = Some("opus".into());
        let events = collect(&c, r).await;
        assert!(
            matches!(events.last(), Some(Ok(AiEvent::Done { .. }))),
            "{events:?}"
        );

        let stdin = fs::read_to_string(out.join("stdin")).unwrap();
        assert_eq!(stdin, "SECRET-PAYLOAD line two");
        let argv = fs::read_to_string(out.join("argv")).unwrap();
        assert!(!argv.contains("SECRET-PAYLOAD"), "{argv}");
        let args: Vec<&str> = argv.lines().collect();
        assert!(!args.contains(&"--bare"), "{argv}");
        assert!(args.windows(2).any(|w| w == ["--model", "opus"]), "{argv}");
        assert!(
            args.windows(2)
                .any(|w| w == ["--system-prompt", "be brief"]),
            "{argv}"
        );
        assert!(args.contains(&"--no-session-persistence"), "{argv}");

        let cwd = fs::read_to_string(out.join("cwd")).unwrap();
        assert!(cwd.contains("daminus-claude-"), "{cwd}");
        assert_eq!(fs::read_to_string(out.join("ls")).unwrap(), "");
        assert!(
            !Path::new(cwd.trim()).exists(),
            "scratch folder left behind"
        );

        let env = fs::read_to_string(out.join("env")).unwrap();
        for line in env.lines() {
            let name = line.split('=').next().unwrap_or_default();
            assert!(
                !is_secret_env(name),
                "secret variable {name} reached claude"
            );
        }
        assert!(env.lines().any(|l| l.starts_with("PATH=")), "{env}");
        assert!(env.lines().any(|l| l.starts_with("USER=")), "{env}");
        assert!(!env.contains("ANTHROPIC_") && !env.contains("CLAUDE_CODE"));
    }

    fn vars(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect()
    }

    fn value<'a>(env: &'a [(String, String)], name: &str) -> Option<&'a str> {
        env.iter().find(|(n, _)| n == name).map(|(_, v)| v.as_str())
    }

    #[test]
    fn secrets_never_reach_claude() {
        let app = vars(&[
            ("ANTHROPIC_API_KEY", "sk-ant-x"),
            ("ANTHROPIC_BASE_URL", "https://proxy"),
            ("CLAUDE_CODE_OAUTH_TOKEN", "t"),
            ("CLAUDE_CODE_USE_BEDROCK", "1"),
            ("OPENAI_API_KEY", "sk"),
            ("openrouter_api_key", "sk"),
            ("MY_SERVICE_API_KEY", "k"),
            ("SOME_TOKEN", "t"),
            ("DB_PASSWORD", "p"),
            ("AUXILIARY_VISION_BASE_URL", "u"),
            ("GATEWAY_RELAY_X_SECRET", "s"),
            ("GH_TOKEN", "g"),
        ]);
        let env = child_env(app, "/bin");
        for (name, _) in &env {
            assert!(!is_secret_env(name), "{name} leaked");
        }
        assert!(value(&env, "ANTHROPIC_API_KEY").is_none());
        assert!(value(&env, "SOME_TOKEN").is_none());
    }

    #[test]
    fn the_rest_of_the_app_environment_passes() {
        let app = vars(&[
            ("PATH", "/usr/bin"),
            ("HOME", "/Users/ann"),
            ("USER", "ann"),
            ("TMPDIR", "/var/folders/x/T/"),
            ("SHELL", "/bin/zsh"),
            ("HTTPS_PROXY", "http://proxy:8080"),
            ("no_proxy", "localhost"),
            ("NODE_EXTRA_CA_CERTS", "/etc/ca.pem"),
            ("CLAUDE_CONFIG_DIR", "/Users/ann/.claude-work"),
            ("LANG", "vi_VN.UTF-8"),
        ]);
        let env = child_env(app, "/opt/homebrew/bin:/usr/bin");
        assert_eq!(value(&env, "PATH"), Some("/opt/homebrew/bin:/usr/bin"));
        assert_eq!(env.iter().filter(|(n, _)| n == "PATH").count(), 1);
        for (name, want) in [
            ("HOME", "/Users/ann"),
            ("USER", "ann"),
            ("LOGNAME", "ann"),
            ("TMPDIR", "/var/folders/x/T/"),
            ("SHELL", "/bin/zsh"),
            ("HTTPS_PROXY", "http://proxy:8080"),
            ("no_proxy", "localhost"),
            ("NODE_EXTRA_CA_CERTS", "/etc/ca.pem"),
            ("CLAUDE_CONFIG_DIR", "/Users/ann/.claude-work"),
            ("LANG", "vi_VN.UTF-8"),
        ] {
            assert_eq!(value(&env, name), Some(want), "{name}");
        }
    }

    #[test]
    fn user_and_language_are_filled_in_when_the_app_lacks_them() {
        let env = child_env(vars(&[("HOME", "/h")]), "/bin");
        let own = nix::unistd::User::from_uid(nix::unistd::Uid::current())
            .unwrap()
            .unwrap()
            .name;
        assert_eq!(value(&env, "USER"), Some(own.as_str()));
        assert_eq!(value(&env, "LOGNAME"), Some(own.as_str()));
        assert_eq!(value(&env, "LANG"), Some("en_US.UTF-8"));
        let env = child_env(vars(&[("LOGNAME", "bob"), ("USER", "")]), "/bin");
        assert_eq!(value(&env, "USER"), Some("bob"));
        assert_eq!(
            user_name(Some("ann".into()), Some("bob".into())).as_deref(),
            Some("ann")
        );
    }

    #[tokio::test]
    async fn signed_out_quota_and_overload_map_to_their_codes() {
        let cases = [
            (
                r#"{"type":"result","subtype":"success","is_error":true,"result":"Invalid API key · Please run /login","usage":{}}"#,
                ErrorCode::ClaudeCliNotLoggedIn,
            ),
            (
                r#"{"type":"result","is_error":true,"result":"Claude AI usage limit reached|1760000000","usage":{}}"#,
                ErrorCode::ClaudeCliQuota,
            ),
            (
                r#"{"type":"result","is_error":true,"result":"x","api_error_status":429,"usage":{}}"#,
                ErrorCode::ClaudeCliQuota,
            ),
            (
                r#"{"type":"result","is_error":true,"result":"API Error: 529 overloaded_error","usage":{}}"#,
                ErrorCode::ProviderUnavailable,
            ),
            (
                "{\"type\":\"assistant\",\"error\":\"authentication_failed\"}\n{\"type\":\"result\",\"is_error\":true,\"result\":\"oops\",\"usage\":{}}",
                ErrorCode::ClaudeCliNotLoggedIn,
            ),
        ];
        for (lines, want) in cases {
            let dir = tempfile::tempdir().unwrap();
            let body = format!("cat >/dev/null\ncat <<'END'\n{lines}\nEND\nexit 1\n");
            let c = client(script(dir.path(), "claude", &body));
            assert_eq!(error_of(collect(&c, req("q")).await).code, want, "{lines}");
        }
    }

    #[tokio::test]
    async fn output_without_a_result_is_schema_invalid_and_stderr_stays_inside() {
        let dir = tempfile::tempdir().unwrap();
        let c = client(script(
            dir.path(),
            "claude",
            "cat >/dev/null\necho garbage\necho 'token sk-ant-api03-abcdefghijklmnop leaked' >&2\nexit 2\n",
        ));
        let err = error_of(collect(&c, req("q")).await);
        assert_eq!(err.code, ErrorCode::SchemaInvalid);
        assert!(err.params.is_empty());

        let c = client(script(
            dir.path(),
            "claude2",
            "cat >/dev/null\necho 'Not logged in · Please run /login' >&2\nexit 1\n",
        ));
        let err = error_of(collect(&c, req("q")).await);
        assert_eq!(err.code, ErrorCode::ClaudeCliNotLoggedIn);
        assert!(err.params.is_empty());
    }

    #[tokio::test]
    async fn refusals_before_spawning() {
        let dir = tempfile::tempdir().unwrap();
        let bin = script(dir.path(), "claude", OK_BODY);

        let off = ClaudeCliClient::new(bin.clone(), SAFE_PATH.into(), false);
        let e = off
            .stream(req("q"), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(e.code, ErrorCode::ProviderAuth);
        assert_eq!(off.test().await.unwrap_err().code, ErrorCode::ProviderAuth);
        assert_eq!(
            off.list_models().await.unwrap_err().code,
            ErrorCode::ProviderAuth
        );

        let c = client(bin);
        let big = "x".repeat(MAX_STDIN_BYTES + 1);
        let e = c
            .stream(req(&big), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(e.code, ErrorCode::SchemaInvalid);
        let mut flag = req("q");
        flag.model = Some("--bare".into());
        let e = c.stream(flag, CancellationToken::new()).await.unwrap_err();
        assert_eq!(e.code, ErrorCode::SchemaInvalid);

        let missing = client(dir.path().join("nope"));
        let e = missing
            .stream(req("q"), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(e.code, ErrorCode::ClaudeCliNotFound);
    }

    fn slow_script(dir: &Path) -> (PathBuf, PathBuf) {
        let pidfile = dir.join("pid");
        let body = format!(
            "[ \"$1\" = warm ] && exit 0\nsleep 300 &\necho $! > '{}'\ncat >/dev/null\nsleep 300\n",
            pidfile.display()
        );
        let bin = script(dir, "claude", &body);
        warm_up(&bin);
        (bin, pidfile)
    }

    /// The first run of a new file can be slow to start; take that cost before timing.
    /// A file just written can be briefly busy while another test's forked child still
    /// holds it open for writing, so that is retried.
    fn warm_up(bin: &Path) {
        let mut tries = 0;
        let status = loop {
            match std::process::Command::new(bin).arg("warm").status() {
                Err(e) if e.kind() == std::io::ErrorKind::ExecutableFileBusy && tries < 50 => {
                    tries += 1;
                    std::thread::sleep(Duration::from_millis(20));
                }
                other => break other,
            }
        };
        assert!(status.is_ok_and(|s| s.success()));
    }

    #[tokio::test]
    async fn timeout_kills_the_whole_group() {
        let dir = tempfile::tempdir().unwrap();
        let (bin, pidfile) = slow_script(dir.path());
        let c = client(bin).with_timeout(Duration::from_secs(3));
        let err = error_of(collect(&c, req("q")).await);
        assert_eq!(err.code, ErrorCode::Timeout);
        let pid = pid_from(&pidfile).await;
        assert!(pid > 0);
        assert!(gone(pid).await, "child of claude outlived the timeout");
    }

    #[tokio::test]
    async fn child_that_exits_without_a_result_still_loses_its_group() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("pid");
        let body = format!(
            "[ \"$1\" = warm ] && exit 0\nsleep 300 >/dev/null 2>&1 &\necho $! > '{}'\ncat >/dev/null\necho garbage\n",
            pidfile.display()
        );
        let bin = script(dir.path(), "claude", &body);
        warm_up(&bin);
        let c = client(bin);
        let events = collect(&c, req("q")).await;
        assert!(error_of(events).code != ErrorCode::Internal);
        let pid = pid_from(&pidfile).await;
        assert!(pid > 0);
        assert!(
            gone(pid).await,
            "grandchild outlived a child with no result"
        );
    }

    #[tokio::test]
    async fn cancel_ends_the_stream_and_kills_the_group() {
        let dir = tempfile::tempdir().unwrap();
        let (bin, pidfile) = slow_script(dir.path());
        let c = client(bin);
        let cancel = CancellationToken::new();
        let mut rx = c.stream(req("q"), cancel.clone()).await.unwrap();
        let pid = pid_from(&pidfile).await;
        assert!(pid > 0 && alive(pid));
        cancel.cancel();
        assert!(rx.recv().await.is_none());
        assert!(gone(pid).await, "child of claude outlived the cancel");
    }

    #[tokio::test]
    async fn detect_reads_version_and_login() {
        let dir = tempfile::tempdir().unwrap();
        let body = r#"case "$1" in
  --version) echo "2.1.4 (Claude Code)" ;;
  auth) echo '{"loggedIn":true,"authMethod":"claude.ai","email":"a@b.c"}' ;;
esac
"#;
        let bin = script(dir.path(), "claude", body);
        warm_up(&bin);
        let s = detect(&bin, SAFE_PATH).await.unwrap();
        assert_eq!(
            s,
            CliStatus {
                version: "2.1.4".into(),
                logged_in: true,
                auth_method: Some("claude.ai".into())
            }
        );
        assert!(client(bin).test().await.is_ok());

        let out = r#"case "$1" in
  --version) echo "2.1.4 (Claude Code)" ;;
  auth) echo '{"loggedIn":false}'; exit 1 ;;
esac
"#;
        let text = r#"case "$1" in
  --version) echo "2.1.4 (Claude Code)" ;;
  auth) case "$*" in *--json*) echo '{"loggedIn":true}' ;; *) echo 'Logged in as a@b.c' ;; esac ;;
esac
"#;
        let bin = script(dir.path(), "claude-text", text);
        warm_up(&bin);
        assert!(detect(&bin, SAFE_PATH).await.unwrap().logged_in);
        let plain = r#"case "$1" in
  --version) echo "2.1.4 (Claude Code)" ;;
  auth) echo 'Logged in as a@b.c' ;;
esac
"#;
        let bin = script(dir.path(), "claude-plain", plain);
        warm_up(&bin);
        assert!(!detect(&bin, SAFE_PATH).await.unwrap().logged_in);

        let bin = script(dir.path(), "claude-out", out);
        warm_up(&bin);
        let s = detect(&bin, SAFE_PATH).await.unwrap();
        assert!(!s.logged_in && s.auth_method.is_none());
        assert_eq!(
            client(bin).test().await.unwrap_err().code,
            ErrorCode::ClaudeCliNotLoggedIn
        );

        let e = detect(&dir.path().join("none"), SAFE_PATH)
            .await
            .unwrap_err();
        assert_eq!(e.code, ErrorCode::ClaudeCliNotFound);
    }

    #[test]
    fn find_claude_table() {
        let root = tempfile::tempdir().unwrap();
        let mk = |name: &str, mode: u32| {
            let d = root.path().join(name);
            fs::create_dir(&d).unwrap();
            let f = d.join("claude");
            fs::write(&f, "#!/bin/sh\n").unwrap();
            fs::set_permissions(&f, fs::Permissions::from_mode(mode)).unwrap();
            d
        };
        let plain = mk("plain", 0o644);
        let first = mk("first", 0o755);
        let second = mk("second", 0o755);
        let isdir = root.path().join("isdir");
        fs::create_dir_all(isdir.join("claude")).unwrap();
        let p = |d: &Path| d.display().to_string();
        let cases: Vec<(String, Option<PathBuf>)> = vec![
            (String::new(), None),
            (":::".into(), None),
            (p(&plain), None),
            (p(&isdir), None),
            ("relative/bin:claude".into(), None),
            (p(&root.path().join("missing")), None),
            (
                format!("{}:{}", p(&plain), p(&first)),
                Some(first.join("claude")),
            ),
            (
                format!(":{}:{}", p(&first), p(&second)),
                Some(first.join("claude")),
            ),
        ];
        for (path, want) in cases {
            assert_eq!(find_claude_in(&path, &[]), want, "{path}");
        }
    }

    /// Asks the real `claude` on this Mac whether it is signed in, with the
    /// environment the app builds (no prompt is sent). Run by hand:
    /// `cargo test -p daminus-core real_claude -- --ignored`.
    #[tokio::test]
    #[ignore = "needs a signed-in Claude Code on this machine"]
    async fn real_claude_reads_as_signed_in() {
        let path_var = std::env::var("PATH").unwrap_or_default();
        let bin = find_claude(&path_var).expect("claude installed");
        let status = detect(&bin, &path_var).await.expect("claude answered");
        assert!(status.logged_in, "{status:?}");
    }

    #[test]
    fn find_claude_looks_in_the_install_folders_after_path() {
        let root = tempfile::tempdir().unwrap();
        let bin = |name: &str| {
            let d = root.path().join(name);
            fs::create_dir_all(&d).unwrap();
            let f = d.join("claude");
            fs::write(&f, "#!/bin/sh\n").unwrap();
            fs::set_permissions(&f, fs::Permissions::from_mode(0o755)).unwrap();
            d
        };
        let on_path = bin("on-path");
        let local = bin("home/.local/bin");
        let missing = root.path().join("nothing-here");
        let fallbacks = [missing, local.clone()];
        assert_eq!(find_claude_in("", &fallbacks), Some(local.join("claude")));
        assert_eq!(
            find_claude_in(&on_path.display().to_string(), &fallbacks),
            Some(on_path.join("claude"))
        );
        let dirs = fallback_dirs(Some(Path::new("/Users/ann")));
        assert_eq!(
            dirs,
            [
                PathBuf::from("/Users/ann/.local/bin"),
                PathBuf::from("/Users/ann/.claude/local"),
                PathBuf::from("/opt/homebrew/bin"),
                PathBuf::from("/usr/local/bin"),
            ]
        );
        assert_eq!(fallback_dirs(None).len(), 2);
    }

    #[test]
    fn splitter_drops_overlong_lines_and_caps_total() {
        let mut s = LineSplitter::default();
        let mut big = vec![b'a'; MAX_LINE_BYTES + 5];
        big.extend_from_slice(b"\nok\ntail");
        let lines = s.push(&big).unwrap_or_default();
        assert_eq!(lines, vec![b"ok".to_vec()]);
        assert_eq!(s.finish(), Some(b"tail".to_vec()));

        let mut s = LineSplitter::default();
        let chunk = vec![b'\n'; 1024 * 1024];
        let mut over = false;
        for _ in 0..9 {
            over |= s.push(&chunk).is_none();
        }
        assert!(over);
    }
}
