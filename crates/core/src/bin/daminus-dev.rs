use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;
use daminus_core::store::FsStore;

#[derive(Parser)]
#[command(name = "daminus-dev", version = daminus_core::VERSION, about = "Daminus core dev CLI")]
struct Cli {
    /// Config folder. Defaults to `~/.daminus-dev`, never the app's own folder.
    #[arg(long, value_name = "PATH")]
    config_dir: Option<PathBuf>,
}

fn default_config_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(".daminus-dev")
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let dir = cli.config_dir.unwrap_or_else(default_config_dir);
    let store = FsStore::new(&dir);
    // Loading both files validates them (and migrates older versions).
    let loaded = store
        .load_projects()
        .and_then(|p| store.load_settings().map(|s| (p, s)));
    match loaded {
        Ok((projects, _settings)) => {
            println!(
                "config {}: {} project(s), {} expected rule(s)",
                dir.display(),
                projects.value.projects.len(),
                projects.value.rules.len()
            );
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("config {}: {e:?}", dir.display());
            ExitCode::FAILURE
        }
    }
}
