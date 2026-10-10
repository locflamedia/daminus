//! Scanning: resolving what to scan, running every host and URL at once, and
//! saving the raw snapshot. `evaluate` (in `domain`) turns snapshots into
//! what the user sees.

#[cfg(test)]
mod canary_tests;
pub mod event;
mod history;
mod hosts;
mod report;
mod rules;
mod service;
pub mod targets;
#[cfg(test)]
mod tests;

pub use event::{HostProgress, HostState, ScanEvent, ScanEventBody, ScanRun};
pub use history::{
    CHARTED_CHECKS, HistoryView, HostSummary, MAX_FACT_CHECKS, MAX_FACT_SCANS, MAX_HISTORY_SCANS,
    MAX_SUMMARISED_SCANS, ProjectSummary, ScanFact, ScanSummary, history_bundle, history_facts,
    history_view, report_at,
};
pub use hosts::{excluded_hosts, set_host_included};
pub use report::{has_critical, latest_report, record_scan_streak};
pub use rules::{
    Covers, ExpectedDraft, MAX_NOTE_CHARS, REVIEW_DAYS, add_rule, make_rule, remove_rule,
};
pub use service::{
    ConfigCheck, ConfigHosts, HOST_BUDGET, MAX_HOSTS_AT_ONCE, ScanService, ServiceOptions, Started,
    build_bundles,
};
pub(crate) use service::{MAX_CONNECT_TIMEOUT_S, concurrency};
pub use targets::{ScanScope, ScanTargets, resolve};
