use std::collections::BTreeSet;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use daminus_core::checks::bundle::{self, BundleVars, Selection};
use daminus_core::checks::{manifest, ndjson};
use daminus_core::store::FsStore;

#[derive(Parser)]
#[command(name = "daminus-dev", version = daminus_core::VERSION, about = "Daminus core dev CLI")]
struct Cli {
    /// Config folder. Defaults to `~/.daminus-dev`, never the app's own folder.
    #[arg(long, value_name = "PATH")]
    config_dir: Option<PathBuf>,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Print the check bundle a host would run, using Settings › Scan from the config folder.
    Bundle {
        /// Only this check (repeatable). Default: every enabled check.
        #[arg(long, value_name = "ID")]
        only: Vec<String>,
    },
    /// Validate a bundle's NDJSON output: every line v1, `begin` and `end`
    /// present, every check id in the manifest. Exits 1 otherwise.
    Ndjson {
        /// Output file to read.
        file: PathBuf,
    },
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
    match cli.command {
        None => config_summary(&store, &dir),
        Some(Command::Bundle { only }) => print_bundle(&store, only),
        Some(Command::Ndjson { file }) => validate_ndjson(&file),
    }
}

fn config_summary(store: &FsStore, dir: &std::path::Path) -> ExitCode {
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

fn print_bundle(store: &FsStore, only: Vec<String>) -> ExitCode {
    let settings = match store.load_settings() {
        Ok(s) => s.value,
        Err(e) => {
            eprintln!("settings: {e:?}");
            return ExitCode::FAILURE;
        }
    };
    let built = manifest()
        .map_err(|e| format!("manifest: {e}"))
        .and_then(|m| {
            let vars = BundleVars::from_scan(&settings.scan).map_err(|e| e.to_string())?;
            let selection = Selection {
                disabled_groups: settings.scan.disabled_groups.clone(),
                only: (!only.is_empty()).then(|| only.into_iter().collect::<BTreeSet<_>>()),
            };
            bundle::build(&m, &selection, &vars).map_err(|e| e.to_string())
        });
    match built {
        Ok(b) => {
            let mut stdout = std::io::stdout().lock();
            if stdout.write_all(b.text.as_bytes()).is_err() {
                return ExitCode::FAILURE;
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn validate_ndjson(file: &std::path::Path) -> ExitCode {
    let bytes = match std::fs::read(file) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("{}: {e}", file.display());
            return ExitCode::FAILURE;
        }
    };
    let m = match manifest() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("manifest: {e}");
            return ExitCode::FAILURE;
        }
    };
    let out = ndjson::parse(&bytes);
    let mut problems = Vec::new();
    if out.bundle.is_none() {
        problems.push("no v1 `begin` line".to_owned());
    }
    if !out.ended {
        problems.push("no `end` line".to_owned());
    }
    if out.dropped > 0 {
        problems.push(format!("{} line(s) are not valid NDJSON v1", out.dropped));
    }
    if out.truncated {
        problems.push("output over the per-host limit".to_owned());
    }
    for fact in &out.facts {
        if m.get(&fact.check).is_none() {
            problems.push(format!("check {:?} is not in the manifest", fact.check));
        }
    }
    let groups: Vec<String> = out.coverage.iter().map(|g| format!("{g:?}")).collect();
    println!(
        "{}: {} fact(s), groups [{}], {}",
        file.display(),
        out.facts.len(),
        groups.join(", "),
        if problems.is_empty() { "ok" } else { "INVALID" }
    );
    for p in &problems {
        eprintln!("  {p}");
    }
    if problems.is_empty() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
