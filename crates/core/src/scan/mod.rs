//! Scanning: resolving what to scan, running every host and URL at once, and
//! saving the raw snapshot. `evaluate` (in `domain`) turns snapshots into
//! what the user sees.

#[cfg(test)]
mod canary_tests;
pub mod event;
mod report;
mod service;
pub mod targets;
#[cfg(test)]
mod tests;

pub use event::{HostProgress, HostState, ScanEvent, ScanEventBody, ScanRun};
pub use report::latest_report;
pub use service::{
    HOST_BUDGET, MAX_HOSTS_AT_ONCE, ScanService, ServiceOptions, Started, build_bundles,
};
pub use targets::{ScanScope, ScanTargets, resolve};
