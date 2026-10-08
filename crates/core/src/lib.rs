//! Daminus core.
//!
//! Pure Rust: domain, check runtime, SSH transport, URL probe, scan service,
//! evaluation, AI client and file store. The Tauri shell (`src-tauri`) and the
//! dev CLI (`daminus-dev`) are thin callers of this crate.

/// Crate version, shared by the app shell and the dev CLI.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub mod checks;
pub mod data;
pub mod diagnostics;
pub mod discover;
pub mod domain;
pub mod probe;
pub mod scan;
pub mod setup;
pub mod ssh;
pub mod store;
