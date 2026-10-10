//! Errors that cross into the UI. The core returns a closed code plus params;
//! the UI turns them into words in the current language.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Every error the UI can be told about. Serialized with a `kind` tag.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum ErrorCode {
    SshAuth,
    SshHostKeyUnknown,
    SshHostKeyChanged,
    SshUnreachable,
    /// The host's alias is no longer in `~/.ssh/config`, so ssh could not find it.
    SshNotInConfig,
    Timeout,
    ScanInProgress,
    /// The scan scope names no host and no URL (unknown project or host, or
    /// every host excluded in Settings › Hosts).
    NothingToScan,
    /// No host and no URL could be reached for network reasons: the Mac is offline.
    LocalNetworkDown,
    /// A past scan was asked for that is not kept (retention dropped it, or it never existed).
    ScanNotFound,
    /// A config file could not be parsed; it was moved aside to `*.corrupt-<ts>`.
    ConfigInvalid {
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        line: Option<u32>,
    },
    /// `ssh` refused the user's ssh config (a bad line in `path`, or the file
    /// cannot be opened). Every host of the file fails until it is fixed.
    SshConfigInvalid {
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        line: Option<u32>,
    },
    /// A config file was written by a newer Daminus; it is read-only here.
    ConfigFromNewerVersion {
        path: String,
        version: u32,
    },
    /// A config file changed on disk since it was loaded (hand edit); reload first.
    ConfigChangedOnDisk {
        path: String,
    },
    /// Another Daminus process holds the data folder lock.
    StoreBusy,
    /// A file operation failed.
    Io {
        path: String,
    },
    SecretAccessDenied,
    ProviderAuth,
    ProviderRateLimit,
    ProviderUnavailable,
    /// The `claude` command is not installed, or not on the login shell's PATH.
    ClaudeCliNotFound,
    /// `claude` is installed but has no signed-in account.
    ClaudeCliNotLoggedIn,
    /// The Claude subscription behind `claude` has no allowance left until it resets.
    ClaudeCliQuota,
    /// A reply (AI, or a file) did not match its schema.
    SchemaInvalid,
    /// The user stopped the work. Not a failure; trying again is the user's call.
    Cancelled,
    /// A bug: the work panicked. Logged; trying again will not help.
    Internal,
}

impl ErrorCode {
    /// Whether trying the same thing again may work without the user changing anything.
    pub fn retryable(&self) -> bool {
        matches!(
            self,
            ErrorCode::SshUnreachable
                | ErrorCode::Timeout
                | ErrorCode::ScanInProgress
                | ErrorCode::LocalNetworkDown
                | ErrorCode::StoreBusy
                | ErrorCode::Io { .. }
                | ErrorCode::ProviderRateLimit
                | ErrorCode::ProviderUnavailable
        )
    }
}

/// The error type of every IPC command.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[error("{code:?}")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AppError {
    pub code: ErrorCode,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub params: BTreeMap<String, String>,
    pub retryable: bool,
}

impl AppError {
    pub fn with_param(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.params.insert(key.into(), value.into());
        self
    }
}

impl From<ErrorCode> for AppError {
    fn from(code: ErrorCode) -> Self {
        let retryable = code.retryable();
        Self {
            code,
            params: BTreeMap::new(),
            retryable,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_with_its_fields() {
        let e = AppError::from(ErrorCode::ConfigInvalid {
            path: "projects.json".into(),
            line: Some(7),
        });
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(
            json,
            serde_json::json!({"code": {"kind": "config_invalid", "path": "projects.json", "line": 7}, "retryable": false})
        );
        for code in [
            ErrorCode::ClaudeCliNotFound,
            ErrorCode::ClaudeCliNotLoggedIn,
            ErrorCode::ClaudeCliQuota,
            ErrorCode::Cancelled,
        ] {
            assert!(!code.retryable(), "{code:?} needs the user to act");
        }
        let busy = AppError::from(ErrorCode::StoreBusy).with_param("pid", "42");
        assert!(busy.retryable);
        assert_eq!(serde_json::to_value(&busy).unwrap()["params"]["pid"], "42");
    }
}
