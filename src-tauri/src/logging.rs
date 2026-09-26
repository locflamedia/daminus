//! Local log: `~/Library/Logs/dev.daminus.app/daminus.log`, at most five
//! files of 1 MB. Every line goes through `redact_secrets` before it is
//! written, so whatever a caller logs, a credential-looking token never
//! reaches the file (Settings › About copies this log as diagnostics).
//!
//! The core logs with `tracing`; its `log` feature forwards events here.

use daminus_core::domain::redact::redact_secrets;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// Size at which the log file rotates.
pub const MAX_FILE_BYTES: u128 = 1_000_000;
/// Rotated files kept beside the active one (five files in total).
pub const KEEP_ROTATED: usize = 4;

pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };
    let mut targets = vec![Target::new(TargetKind::LogDir {
        file_name: Some("daminus".to_owned()),
    })];
    if cfg!(debug_assertions) {
        targets.push(Target::new(TargetKind::Stderr));
    }
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .targets(targets)
        .level(level)
        // Dependencies stay quiet unless something goes wrong.
        .level_for("tao", log::LevelFilter::Warn)
        .level_for("wry", log::LevelFilter::Warn)
        .level_for("reqwest", log::LevelFilter::Warn)
        .level_for("rustls", log::LevelFilter::Warn)
        .level_for("hyper_util", log::LevelFilter::Warn)
        .max_file_size(MAX_FILE_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(KEEP_ROTATED))
        .timezone_strategy(TimezoneStrategy::UseUtc)
        .format(|out, message, record| {
            out.finish(format_args!(
                "{} {:<5} {} {}",
                time::OffsetDateTime::now_utc()
                    .format(&time::format_description::well_known::Rfc3339)
                    .unwrap_or_default(),
                record.level(),
                record.target(),
                line(&message.to_string())
            ))
        })
        .build()
}

/// One log line as written: secrets redacted, kept on one line.
pub fn line(message: &str) -> String {
    redact_secrets(message).replace(['\n', '\r'], " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_never_reach_the_line() {
        let l = line("provider said: key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\nnext");
        assert!(!l.contains("AbCdEfGhIjKlMnOp"), "{l}");
        assert!(!l.contains('\n'));
    }
}
