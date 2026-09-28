// Listing the app's commands here makes Tauri generate a permission per
// command (`allow-scan-start`, …); a window may only call what its
// capability in `capabilities/` grants. Keep in step with `generate_handler!`.
const COMMANDS: &[&str] = &[
    "scan_start",
    "scan_stop",
    "scan_status",
    "report_latest",
    "reveal_config_dir",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .unwrap_or_else(|e| panic!("tauri build: {e:#}"));
}
