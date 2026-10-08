//! The eight provider profiles embedded in the app, the check for a custom
//! `base_url`, and the shape of a model list (provider answer, or typed by hand).

use std::net::IpAddr;
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use url::{Host, Url};

use crate::domain::error::{AppError, ErrorCode};

const EMBEDDED: &str = include_str!("providers.json");

/// How a profile is reached.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum ProviderKind {
    /// An HTTP API spoken through the `genai` adapter named in `adapter`.
    GenaiAdapter,
    /// The user's own `claude` command line tool.
    ClaudeCli,
}

/// The hint shown on a provider tile.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum ProviderTag {
    Recommended,
    FreeLocal,
    Beta,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ProviderProfile {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    /// The `genai` adapter for `GenaiAdapter` profiles.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub adapter: Option<String>,
    /// Default endpoint; empty when the user must supply one (or there is none).
    pub base_url: String,
    pub needs_key: bool,
    /// What the key starts with, shown as a placeholder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_hint: Option<String>,
    /// Suggested models, the first being the default.
    pub models: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag: Option<ProviderTag>,
}

impl ProviderProfile {
    pub fn default_model(&self) -> Option<&str> {
        self.models.first().map(String::as_str)
    }
}

static PROFILES: LazyLock<Vec<ProviderProfile>> =
    LazyLock::new(|| serde_json::from_str(EMBEDDED).unwrap_or_default());

/// The embedded profiles, in tile order.
pub fn profiles() -> &'static [ProviderProfile] {
    &PROFILES
}

pub fn profile(id: &str) -> Option<&'static ProviderProfile> {
    profiles().iter().find(|p| p.id == id)
}

fn invalid_url() -> AppError {
    AppError::from(ErrorCode::SchemaInvalid).with_param("detail", "base_url")
}

/// Checks a custom endpoint: `https`, or `http` only to this machine; no
/// credentials in the URL; a host. Refused with `SchemaInvalid` naming the field.
pub fn validate_base_url(raw: &str) -> Result<Url, AppError> {
    let url = Url::parse(raw.trim()).map_err(|_| invalid_url())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(invalid_url());
    }
    let loopback = match url.host() {
        Some(Host::Domain(name)) => !name.is_empty() && name.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(ip)) => IpAddr::V4(ip).is_loopback(),
        Some(Host::Ipv6(ip)) => IpAddr::V6(ip).is_loopback(),
        None => return Err(invalid_url()),
    };
    match url.scheme() {
        "https" => Ok(url),
        "http" if loopback => Ok(url),
        _ => Err(invalid_url()),
    }
}

/// Where a model list came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum ModelSource {
    /// The provider's own list.
    Provider,
    /// Listing failed or is unsupported: the profile's suggestions, and the
    /// user may type any model name.
    Suggested,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ModelList {
    pub models: Vec<String>,
    pub source: ModelSource,
    /// The UI offers a free-text model field.
    pub manual_entry: bool,
}

/// Combines what the provider listed with the profile's suggestions. A good,
/// non-empty listing wins (suggestions that it also has come first, then the
/// rest in its order); a failed or empty one falls back to the suggestions with
/// manual entry switched on.
pub fn merge_models(profile: &ProviderProfile, listed: Result<Vec<String>, AppError>) -> ModelList {
    match listed {
        Ok(listed) if !listed.is_empty() => {
            let mut models: Vec<String> = profile
                .models
                .iter()
                .filter(|m| listed.contains(m))
                .cloned()
                .collect();
            for m in listed {
                if !models.contains(&m) {
                    models.push(m);
                }
            }
            ModelList {
                models,
                source: ModelSource::Provider,
                manual_entry: false,
            }
        }
        _ => ModelList {
            models: profile.models.clone(),
            source: ModelSource::Suggested,
            manual_entry: true,
        },
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    #[test]
    fn eight_unique_profiles_parse() {
        let parsed: Vec<ProviderProfile> = serde_json::from_str(EMBEDDED).unwrap();
        assert_eq!(parsed.len(), 8);
        assert_eq!(profiles(), parsed.as_slice());
        let ids: BTreeSet<_> = parsed.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids.len(), 8);
        for p in &parsed {
            assert_eq!(
                p.kind == ProviderKind::GenaiAdapter,
                p.adapter.is_some(),
                "{}",
                p.id
            );
            if !p.base_url.is_empty() {
                assert!(validate_base_url(&p.base_url).is_ok(), "{}", p.id);
            }
        }
        assert_eq!(
            profile("claude-code").map(|p| p.kind),
            Some(ProviderKind::ClaudeCli)
        );
        assert_eq!(
            profile("anthropic").and_then(|p| p.tag),
            Some(ProviderTag::Recommended)
        );
        assert_eq!(profile("ollama").map(|p| p.needs_key), Some(false));
    }

    #[test]
    fn base_url_table() {
        let ok = [
            "https://api.example.com/v1",
            "http://localhost:11434",
            "http://127.0.0.1:11434",
            "http://127.9.9.9",
            "http://[::1]:8080",
        ];
        let bad = [
            "http://example.com",
            "http://10.0.0.5:11434",
            "https://user:pass@example.com",
            "http://user@localhost",
            "ftp://example.com",
            "file:///etc/passwd",
            "https://",
            "",
            "not a url",
        ];
        for u in ok {
            assert!(validate_base_url(u).is_ok(), "{u}");
        }
        for u in bad {
            let e = validate_base_url(u).unwrap_err();
            assert_eq!(e.code, ErrorCode::SchemaInvalid, "{u}");
        }
    }

    #[test]
    fn model_list_falls_back_to_manual_entry() {
        let p = profile("anthropic").unwrap();
        let failed = merge_models(p, Err(ErrorCode::ProviderUnavailable.into()));
        assert!(failed.manual_entry);
        assert_eq!(failed.source, ModelSource::Suggested);
        assert_eq!(failed.models, p.models);

        let listed = merge_models(p, Ok(vec!["zeta".into(), "claude-haiku-4-5".into()]));
        assert!(!listed.manual_entry);
        assert_eq!(listed.models, ["claude-haiku-4-5", "zeta"]);
        assert!(merge_models(p, Ok(vec![])).manual_entry);
    }
}
