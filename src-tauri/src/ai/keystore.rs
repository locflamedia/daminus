//! Where API keys live: the macOS Keychain, one item per provider (service
//! `dev.daminus.app`, account = the provider id). A key is read only to build
//! a client and is wrapped in a [`SecretString`] at once; nothing here logs it.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use daminus_core::ai::SecretString;
use daminus_core::domain::error::{AppError, ErrorCode};

/// The Keychain service name of every item the app writes.
pub const KEYCHAIN_SERVICE: &str = "dev.daminus.app";

/// A place for keys. Behind a trait so tests never touch a real Keychain.
pub trait SecretStore: Send + Sync {
    /// The key stored for `account`, or `None` when there is none.
    fn get(&self, account: &str) -> Result<Option<SecretString>, AppError>;
    /// Stores or replaces the key.
    fn set(&self, account: &str, key: &SecretString) -> Result<(), AppError>;
    /// Removes the key; removing one that is not there is fine.
    fn delete(&self, account: &str) -> Result<(), AppError>;
}

fn denied() -> AppError {
    ErrorCode::SecretAccessDenied.into()
}

/// The macOS Keychain. On other systems every call is refused.
#[derive(Clone, Copy, Debug, Default)]
pub struct KeychainStore;

#[cfg(target_os = "macos")]
mod keychain {
    use security_framework::passwords::{
        delete_generic_password, get_generic_password, set_generic_password,
    };

    use super::{AppError, KEYCHAIN_SERVICE, KeychainStore, SecretStore, SecretString, denied};

    /// `errSecItemNotFound`.
    const NOT_FOUND: i32 = -25300;

    impl SecretStore for KeychainStore {
        fn get(&self, account: &str) -> Result<Option<SecretString>, AppError> {
            match get_generic_password(KEYCHAIN_SERVICE, account) {
                Ok(bytes) => match String::from_utf8(bytes) {
                    Ok(text) => Ok(Some(SecretString::new(text))),
                    Err(_) => Err(denied()),
                },
                Err(e) if e.code() == NOT_FOUND => Ok(None),
                Err(e) => {
                    tracing::warn!(code = e.code(), "keychain read refused");
                    Err(denied())
                }
            }
        }

        fn set(&self, account: &str, key: &SecretString) -> Result<(), AppError> {
            set_generic_password(KEYCHAIN_SERVICE, account, key.expose().as_bytes()).map_err(|e| {
                tracing::warn!(code = e.code(), "keychain write refused");
                denied()
            })
        }

        fn delete(&self, account: &str) -> Result<(), AppError> {
            match delete_generic_password(KEYCHAIN_SERVICE, account) {
                Ok(()) => Ok(()),
                Err(e) if e.code() == NOT_FOUND => Ok(()),
                Err(e) => {
                    tracing::warn!(code = e.code(), "keychain delete refused");
                    Err(denied())
                }
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
impl SecretStore for KeychainStore {
    fn get(&self, _account: &str) -> Result<Option<SecretString>, AppError> {
        Err(denied())
    }

    fn set(&self, _account: &str, _key: &SecretString) -> Result<(), AppError> {
        Err(denied())
    }

    fn delete(&self, _account: &str) -> Result<(), AppError> {
        Err(denied())
    }
}

/// Keys kept in memory, for tests.
#[derive(Debug, Default)]
pub struct MemoryStore {
    keys: Mutex<HashMap<String, String>>,
}

impl MemoryStore {
    fn keys(&self) -> std::sync::MutexGuard<'_, HashMap<String, String>> {
        self.keys.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl SecretStore for MemoryStore {
    fn get(&self, account: &str) -> Result<Option<SecretString>, AppError> {
        Ok(self.keys().get(account).map(SecretString::new))
    }

    fn set(&self, account: &str, key: &SecretString) -> Result<(), AppError> {
        self.keys()
            .insert(account.to_owned(), key.expose().to_owned());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), AppError> {
        self.keys().remove(account);
        Ok(())
    }
}
