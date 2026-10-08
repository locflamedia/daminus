//! What the AI screens read and send: the provider tiles, the review sheet and the events of a
//! send. These are the shapes that cross IPC; none of them can hold a key.

use serde::{Deserialize, Serialize};

use super::claude_cli::CliStatus;
use super::payload::{Payload, SectionId, SectionInfo};
use super::profiles::{ProviderProfile, profile, validate_base_url};
use super::schema::AiFinding;
use crate::domain::error::{AppError, ErrorCode};
use crate::domain::host::HostAlias;
use crate::domain::settings::AiSettings;

/// One provider tile: the profile and whether a key is stored for it (never the key).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AiProviderEntry {
    pub profile: ProviderProfile,
    pub key_set: bool,
}

/// What `claude` says about itself. Not finding it, or failing to ask, is `found: false`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ClaudeCodeStatus {
    pub found: bool,
    pub version: Option<String>,
    pub logged_in: bool,
    pub auth_method: Option<String>,
}

impl ClaudeCodeStatus {
    pub fn missing() -> Self {
        Self::default()
    }
}

impl From<CliStatus> for ClaudeCodeStatus {
    fn from(s: CliStatus) -> Self {
        Self {
            found: true,
            version: Some(s.version).filter(|v| !v.is_empty()),
            logged_in: s.logged_in,
            auth_method: s.auth_method,
        }
    }
}

/// The provider screens' one read.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AiProvidersView {
    pub providers: Vec<AiProviderEntry>,
    /// The selected provider; `None` is AI off.
    pub provider: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub claude_code_ack: bool,
    pub claude_code: ClaudeCodeStatus,
}

/// How a connection test ended.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AiTestResult {
    pub ok: bool,
    pub ms: u32,
    pub error: Option<ErrorCode>,
}

/// What a question is about.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum PreviewScope {
    Whole,
    Project { id: String },
    Server { host: HostAlias },
}

/// The review sheet's choices.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct PreviewOptions {
    pub question: String,
    /// Sections to send; the question is always sent.
    pub include: Vec<SectionId>,
    pub hide_hosts: bool,
}

/// The text that would be sent, for display, and the hash that lets `ai_analyze` send exactly it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct PayloadPreview {
    pub sections: Vec<SectionInfo>,
    pub system: String,
    pub user: String,
    pub total_bytes: u32,
    pub hash: String,
    /// How many names are hidden behind placeholders.
    pub alias_table_count: u32,
}

impl From<&Payload> for PayloadPreview {
    fn from(p: &Payload) -> Self {
        let count = |n: usize| u32::try_from(n).unwrap_or(u32::MAX);
        Self {
            sections: p.sections.clone(),
            system: p.system.clone(),
            user: p.user.clone(),
            total_bytes: count(p.total_bytes),
            hash: p.hash.clone(),
            alias_table_count: count(p.alias_table.len()),
        }
    }
}

/// One event of a send, on `ai://event`. `seq` rises by one per event of a request.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AiStreamEvent {
    pub request_id: String,
    pub seq: u32,
    #[serde(flatten)]
    #[cfg_attr(feature = "ts", ts(flatten))]
    pub body: AiEventBody,
}

/// Serialized with a `kind` tag. Text is shown with the real names back in.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum AiEventBody {
    /// More of the summary, to append.
    SummaryDelta {
        text: String,
    },
    /// One ranked finding of the finished reply.
    Finding {
        finding: AiFinding,
    },
    /// The reply is complete. `summary` is the whole text, to replace what the deltas built.
    Done {
        summary: String,
        reviewed_sends: u32,
        offer_turning_off_review: bool,
    },
    Error {
        error: ErrorCode,
    },
    /// The user stopped it. Not an error.
    Cancelled,
}

/// Checks what only the profiles can tell: the provider is one of them, the URL is allowed and
/// belongs to a provider that is reached over HTTP.
pub fn check_ai_settings(ai: &AiSettings) -> Result<(), AppError> {
    ai.validate()?;
    let invalid =
        |field: &str| AppError::from(ErrorCode::SchemaInvalid).with_param("detail", field);
    let chosen = match ai.provider.as_deref() {
        Some(id) => Some(profile(id).ok_or_else(|| invalid("ai.provider"))?),
        None => None,
    };
    if let Some(url) = ai.base_url.as_deref() {
        let http = chosen.is_some_and(|p| p.adapter.is_some());
        if !http {
            return Err(invalid("ai.base_url"));
        }
        validate_base_url(url)?;
    }
    if ai.model.as_deref().is_some_and(|m| m.trim().is_empty()) {
        return Err(invalid("ai.model"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ai(provider: Option<&str>, base_url: Option<&str>) -> AiSettings {
        AiSettings {
            provider: provider.map(str::to_owned),
            base_url: base_url.map(str::to_owned),
            ..AiSettings::default()
        }
    }

    #[test]
    fn settings_must_name_a_profile_and_an_allowed_url() {
        assert!(check_ai_settings(&AiSettings::default()).is_ok());
        assert!(check_ai_settings(&ai(Some("anthropic"), None)).is_ok());
        assert!(check_ai_settings(&ai(Some("ollama"), Some("http://localhost:11434"))).is_ok());
        for bad in [
            ai(Some("nope"), None),
            ai(None, Some("https://example.com")),
            ai(Some("claude-code"), Some("https://example.com")),
            ai(Some("ollama"), Some("http://example.com")),
        ] {
            let e = check_ai_settings(&bad).unwrap_err();
            assert_eq!(e.code, ErrorCode::SchemaInvalid, "{bad:?}");
        }
    }

    #[test]
    fn an_event_is_tagged_by_kind_next_to_its_request() {
        let e = AiStreamEvent {
            request_id: "r1".into(),
            seq: 2,
            body: AiEventBody::Error {
                error: ErrorCode::Timeout,
            },
        };
        let wire = serde_json::to_value(&e).unwrap();
        assert_eq!(wire["request_id"], "r1");
        assert_eq!(wire["kind"], "error");
        assert_eq!(wire["error"]["kind"], "timeout");
    }
}
