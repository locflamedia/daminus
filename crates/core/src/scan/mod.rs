//! Scanning: resolving what to scan, running every host and URL at once, and
//! saving the raw snapshot. `evaluate` (in `domain`) turns snapshots into
//! what the user sees.

#[cfg(test)]
mod canary_tests;
pub mod event;
mod history;
mod report;
mod service;
pub mod targets;
#[cfg(test)]
mod tests;

pub use event::{HostProgress, HostState, ScanEvent, ScanEventBody, ScanRun};
pub use history::{
    HistoryView, HostSummary, MAX_FACT_SCANS, ProjectSummary, ScanFact, ScanSummary, history_facts,
    history_view, report_at,
};
pub use report::latest_report;
pub use service::{
    HOST_BUDGET, MAX_HOSTS_AT_ONCE, ScanService, ServiceOptions, Started, build_bundles,
};
pub(crate) use service::{MAX_CONNECT_TIMEOUT_S, concurrency};
pub use targets::{ScanScope, ScanTargets, resolve};
