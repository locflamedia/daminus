//! Pure domain: data model, contracts and rules. No I/O; must not import
//! `ssh`, `probe`, `ai` or `store` (checked by `scripts/check-core-boundaries.sh`).

pub mod app_state;
pub mod datetime;
pub mod error;
pub mod evaluate;
pub mod expected;
pub mod fact;
pub mod host;
pub mod ingest;
pub mod manifest;
pub mod project;
pub mod redact;
pub mod rule;
pub mod settings;
pub mod severity;
pub mod snapshot;
