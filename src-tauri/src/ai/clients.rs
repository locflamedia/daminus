//! How a provider's client is built. Behind a trait so tests answer with a
//! scripted client and never reach a provider or the `claude` program.

use std::sync::Arc;

use daminus_core::ai::claude_cli::{ClaudeCliClient, detect, find_claude};
use daminus_core::ai::client::GenaiClient;
use daminus_core::ai::profiles::{ProviderKind, ProviderProfile};
use daminus_core::ai::view::ClaudeCodeStatus;
use daminus_core::ai::{AiClient, BoxFuture, SecretString};
use daminus_core::domain::error::{AppError, ErrorCode};

/// Builds the client of a profile and says what `claude` reports.
pub trait ClientFactory: Send + Sync {
    /// `base_url` is the user's custom endpoint, `key` the stored key, `claude_code_ack` the
    /// user's consent for the Claude Code profile.
    fn build(
        &self,
        profile: &ProviderProfile,
        base_url: Option<&str>,
        key: Option<SecretString>,
        claude_code_ack: bool,
    ) -> Result<Arc<dyn AiClient>, AppError>;

    /// `claude --version` and `claude auth status`. Any failure is `found: false`.
    fn claude_code_status(&self) -> BoxFuture<'_, ClaudeCodeStatus>;
}

/// The real clients. `path_var` is the login shell's `PATH` (see `gui_env`), where `claude` is
/// looked for and which it runs with.
#[derive(Clone, Debug, Default)]
pub struct RealClients {
    path_var: String,
}

impl RealClients {
    pub fn new(path_var: impl Into<String>) -> Self {
        Self {
            path_var: path_var.into(),
        }
    }
}

impl ClientFactory for RealClients {
    fn build(
        &self,
        profile: &ProviderProfile,
        base_url: Option<&str>,
        key: Option<SecretString>,
        claude_code_ack: bool,
    ) -> Result<Arc<dyn AiClient>, AppError> {
        match profile.kind {
            ProviderKind::GenaiAdapter => {
                if profile.needs_key && key.is_none() {
                    return Err(AppError::from(ErrorCode::ProviderKeyMissing)
                        .with_param("provider", &profile.name));
                }
                Ok(Arc::new(GenaiClient::new(profile, base_url, key)?))
            }
            ProviderKind::ClaudeCli => {
                let bin = find_claude(&self.path_var).ok_or(ErrorCode::ClaudeCliNotFound)?;
                Ok(Arc::new(ClaudeCliClient::new(
                    bin,
                    self.path_var.clone(),
                    claude_code_ack,
                )))
            }
        }
    }

    fn claude_code_status(&self) -> BoxFuture<'_, ClaudeCodeStatus> {
        Box::pin(async move {
            let Some(bin) = find_claude(&self.path_var) else {
                return ClaudeCodeStatus::missing();
            };
            match detect(&bin, &self.path_var).await {
                Ok(status) => status.into(),
                Err(e) => {
                    tracing::info!(code = ?e.code, "claude did not answer");
                    ClaudeCodeStatus::missing()
                }
            }
        })
    }
}
