//! Developer CLI for exercising the core without the app.
//! Subcommands (scan, discover, evaluate) land with the phases that build them.

use clap::Parser;

#[derive(Parser)]
#[command(name = "daminus-dev", version = daminus_core::VERSION, about = "Daminus core dev CLI")]
struct Cli {}

fn main() {
    let _cli = Cli::parse();
}
