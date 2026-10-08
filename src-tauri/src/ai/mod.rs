//! The AI commands of the app: provider tiles, keys, the review sheet and
//! the send. A key is read from the Keychain only to build a client and is
//! never part of a return value, an event, a log line or an error.

pub mod clients;
pub mod keystore;
mod send;

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Instant;

use daminus_core::ai::payload::{OsNonce, Payload, PayloadOptions, Scope, build_payload};
use daminus_core::ai::profiles::{ModelList, ProviderProfile, merge_models, profile, profiles};
use daminus_core::ai::view::{
    AiProviderEntry, AiProvidersView, AiStreamEvent, AiTestResult, PayloadPreview, PreviewOptions,
    PreviewScope, check_ai_settings,
};
use daminus_core::ai::{AiClient, SecretString};
use daminus_core::domain::error::{AppError, ErrorCode};
use daminus_core::domain::settings::{AiSettings, Settings};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use self::clients::{ClientFactory, RealClients};
use self::keystore::{KeychainStore, SecretStore};
use crate::app::AppCore;

/// The event channel of a send.
pub const AI_EVENT: &str = "ai://event";

/// Previewed payloads kept, so a few sheets can be open at once; the oldest goes first.
const KEPT_PAYLOADS: usize = 8;
/// Longest request id taken.
const MAX_REQUEST_ID_CHARS: usize = 64;
/// Longest key taken. Real keys are well under a kilobyte.
const MAX_KEY_CHARS: usize = 4096;

/// Previewed payloads, oldest first, with their hashes.
type Kept = VecDeque<(String, Arc<Payload>)>;

/// Keys, clients and what a send needs between the preview and the answer.
#[derive(Clone)]
pub(crate) struct AiRuntime {
    keys: Arc<dyn SecretStore>,
    clients: Arc<dyn ClientFactory>,
    events: mpsc::Sender<AiStreamEvent>,
    payloads: Arc<Mutex<Kept>>,
    sends: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl AiRuntime {
    pub(crate) fn new(events: mpsc::Sender<AiStreamEvent>) -> Self {
        Self {
            keys: Arc::new(KeychainStore),
            clients: Arc::new(RealClients::default()),
            events,
            payloads: Arc::default(),
            sends: Arc::default(),
        }
    }

    fn payloads(&self) -> MutexGuard<'_, Kept> {
        self.payloads.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn sends(&self) -> MutexGuard<'_, HashMap<String, CancellationToken>> {
        self.sends.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn keep(&self, payload: Payload) {
        let mut kept = self.payloads();
        kept.retain(|(hash, _)| *hash != payload.hash);
        kept.push_back((payload.hash.clone(), Arc::new(payload)));
        while kept.len() > KEPT_PAYLOADS {
            kept.pop_front();
        }
    }

    fn payload(&self, hash: &str) -> Option<Arc<Payload>> {
        self.payloads()
            .iter()
            .find(|(h, _)| h.eq_ignore_ascii_case(hash))
            .map(|(_, p)| Arc::clone(p))
    }
}

fn invalid(detail: &str) -> AppError {
    AppError::from(ErrorCode::SchemaInvalid).with_param("detail", detail)
}

fn known_profile(id: &str) -> Result<&'static ProviderProfile, AppError> {
    profile(id).ok_or_else(|| invalid("provider_id"))
}

/// Runs work that reads files or the Keychain off the async threads.
async fn blocking<T: Send + 'static>(
    what: &'static str,
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tokio::task::spawn_blocking(work).await.map_err(|e| {
        tracing::error!(error = %e, "{what} panicked");
        AppError::from(ErrorCode::Internal)
    })?
}

fn millis(started: Instant) -> u32 {
    u32::try_from(started.elapsed().as_millis()).unwrap_or(u32::MAX)
}

impl AppCore {
    /// Replaces where keys are kept (the Keychain by default).
    #[must_use]
    pub fn with_secret_store(mut self, keys: Arc<dyn SecretStore>) -> Self {
        self.ai.keys = keys;
        self
    }

    /// Replaces how provider clients are built (tests answer with a scripted one).
    #[must_use]
    pub fn with_client_factory(mut self, clients: Arc<dyn ClientFactory>) -> Self {
        self.ai.clients = clients;
        self
    }

    /// Looks for `claude` on `path_var`, the login shell's `PATH`.
    #[must_use]
    pub fn with_path_var(self, path_var: impl Into<String>) -> Self {
        self.with_client_factory(Arc::new(RealClients::new(path_var)))
    }

    /// The client of `profile`, with its stored key and (for the selected provider) the custom
    /// endpoint. Blocks on the Keychain.
    fn ai_client(
        &self,
        profile: &ProviderProfile,
        settings: &AiSettings,
    ) -> Result<Arc<dyn AiClient>, AppError> {
        let key = if profile.needs_key {
            self.ai.keys.get(&profile.id)?
        } else {
            None
        };
        let selected = settings.provider.as_deref() == Some(profile.id.as_str());
        let base_url = settings.base_url.as_deref().filter(|_| selected);
        self.ai
            .clients
            .build(profile, base_url, key, settings.claude_code_acknowledged)
    }

    fn ai_settings(&self) -> Result<AiSettings, AppError> {
        Ok(self.settings_get()?.ai)
    }

    /// The provider tiles with which keys are set, the selection, and what `claude` reports.
    pub async fn ai_providers(&self) -> Result<AiProvidersView, AppError> {
        let core = self.clone();
        let (settings, key_set) = blocking("ai_providers", move || {
            let settings = core.ai_settings()?;
            let key_set =
                profiles()
                    .iter()
                    .map(|p| {
                        p.needs_key
                        && core.ai.keys.get(&p.id).map(|k| k.is_some()).unwrap_or_else(|e| {
                            tracing::warn!(provider = %p.id, code = ?e.code, "key not read");
                            false
                        })
                    })
                    .collect::<Vec<_>>();
            Ok((settings, key_set))
        })
        .await?;
        let claude_code = self.ai.clients.claude_code_status().await;
        Ok(AiProvidersView {
            providers: profiles()
                .iter()
                .zip(key_set)
                .map(|(p, key_set)| AiProviderEntry {
                    profile: p.clone(),
                    key_set,
                })
                .collect(),
            provider: settings.provider,
            model: settings.model,
            base_url: settings.base_url,
            claude_code_ack: settings.claude_code_acknowledged,
            claude_code,
        })
    }

    /// Stores (`Some`) or removes (`None`) the key of a provider that needs one. Answers whether
    /// a key is stored afterwards. The key string is wrapped at once and never echoed.
    pub async fn ai_set_key(
        &self,
        provider_id: &str,
        key: Option<String>,
    ) -> Result<bool, AppError> {
        let profile = known_profile(provider_id)?;
        if !profile.needs_key {
            return Err(invalid("provider_id"));
        }
        let key = key.map(SecretString::new);
        if let Some(k) = &key {
            let text = k.expose();
            let bad = text.trim().is_empty()
                || text.chars().count() > MAX_KEY_CHARS
                || text.chars().any(char::is_control);
            if bad {
                return Err(invalid("key"));
            }
        }
        let core = self.clone();
        let account = profile.id.clone();
        blocking("ai_set_key", move || match key {
            Some(k) => core
                .ai
                .keys
                .set(&account, &SecretString::new(k.expose().trim()))
                .map(|()| true),
            None => core.ai.keys.delete(&account).map(|()| false),
        })
        .await
    }

    /// Replaces Settings › AI. The provider and the URL are checked against the profiles, then
    /// the whole file is checked again; nothing is written when one is not valid.
    pub async fn ai_settings_set(&self, ai: AiSettings) -> Result<Settings, AppError> {
        let core = self.clone();
        blocking("ai_settings_set", move || {
            check_ai_settings(&ai)?;
            core.settings_set_ai(ai)
        })
        .await
    }

    /// The models of a provider: its own list merged with the suggestions, or the suggestions
    /// and manual entry when the list cannot be had.
    pub async fn ai_models(&self, provider_id: &str) -> Result<ModelList, AppError> {
        let profile = known_profile(provider_id)?;
        let core = self.clone();
        let client = blocking("ai_models", move || {
            let settings = core.ai_settings()?;
            core.ai_client(profile, &settings)
        })
        .await;
        let listed = match client {
            Ok(client) => client.list_models().await,
            Err(e) => Err(e),
        };
        Ok(merge_models(profile, listed))
    }

    /// Checks the key and endpoint (for Claude Code: that it is signed in and allowed).
    /// A failure is the answer, not an error.
    pub async fn ai_test(&self, provider_id: &str) -> Result<AiTestResult, AppError> {
        let profile = known_profile(provider_id)?;
        let started = Instant::now();
        let core = self.clone();
        let outcome = async {
            let client = blocking("ai_test", move || {
                let settings = core.ai_settings()?;
                core.ai_client(profile, &settings)
            })
            .await?;
            client.test().await
        }
        .await;
        Ok(AiTestResult {
            ok: outcome.is_ok(),
            ms: millis(started),
            error: outcome.err().map(|e| e.code),
        })
    }

    /// Builds the payload for `scope` from the latest report and keeps its bytes under their
    /// hash, so `ai_analyze` sends exactly what is shown.
    pub async fn ai_payload_preview(
        &self,
        scope: PreviewScope,
        options: PreviewOptions,
    ) -> Result<PayloadPreview, AppError> {
        let core = self.clone();
        blocking("ai_payload_preview", move || {
            let report = core.report_latest()?;
            let mut build = PayloadOptions::new(options.question);
            build.include = options.include.into_iter().collect();
            build.hide_hosts = options.hide_hosts;
            build.reply_language = core.settings_get()?.general.ai_language;
            let scope = match scope {
                PreviewScope::Whole => Scope::Whole,
                PreviewScope::Project { id } => Scope::Project(id),
                PreviewScope::Server { host } => Scope::Server(host),
            };
            let payload = build_payload(&report, &scope, &build, &OsNonce)?;
            let preview = PayloadPreview::from(&payload);
            core.ai.keep(payload);
            Ok(preview)
        })
        .await
    }

    /// Cancels a send. `false` when `request_id` is not running.
    pub fn ai_cancel(&self, request_id: &str) -> bool {
        match self.ai.sends().get(request_id) {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }
}

#[cfg(test)]
mod tests;
