// Listing the app's commands here makes Tauri generate a permission per
// command (`allow-scan-start`, …); a window may only call what its
// capability in `capabilities/` grants. Keep in step with `generate_handler!`.
const COMMANDS: &[&str] = &[
    "scan_start",
    "scan_stop",
    "scan_status",
    "report_latest",
    "history_list",
    "report_at",
    "history_facts",
    "rules_list",
    "projects_list",
    "reveal_config_dir",
    "reveal_ssh_dir",
    "hosts_list",
    "ssh_environment",
    "setup_start",
    "setup_stop",
    "setup_status",
    "setup_result",
    "projects_validate",
    "projects_save",
    "projects_remove",
    "url_check",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .unwrap_or_else(|e| panic!("tauri build: {e:#}"));
}
