// Binary is named "Daminus" so the Dock shows the product name in dev.
#![allow(non_snake_case)]
// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> Result<(), tauri::Error> {
    daminus_app::run()
}
