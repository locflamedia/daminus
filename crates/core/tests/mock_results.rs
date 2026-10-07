//! The history screens' answers over the shared 12-scan timeline: what the
//! Tauri commands `history_list`, `report_at`, `history_facts` and `rules_list`
//! return for it. The dev mock serves the committed file
//! `src/testing/fixtures/results.json`; this test keeps it in step with the
//! core and checks the history functions against the board's numbers.
//!
//! ```sh
//! DAMINUS_BLESS=1 cargo test -p daminus-core --test mock_results
//! ```

// Integration tests are their own crate; panicking on a broken fixture is the point.
#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use daminus_core::domain::host::HostRef;
use daminus_core::domain::severity::Level;
use daminus_core::scan::{history_facts, history_view, report_at};
use daminus_core::store::FsStore;
use serde_json::{Value, json};

const OUT: &str = "../../src/testing/fixtures/results.json";

/// The checks whose raw values the charts and tabs read across scans.
const CHARTED: [&str; 12] = [
    "disk.fs",
    "disk.path",
    "db.size",
    "docker.compose",
    "pm2.app",
    "sys.load",
    "sys.mem",
    "sys.swap",
    "url.http",
    "url.tls",
    "sec.upload_php",
    "sec.tmp_exec",
];

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("mkdir");
    for entry in fs::read_dir(from).expect("read dir").flatten() {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("copy");
        }
    }
}

fn store() -> (tempfile::TempDir, FsStore) {
    let tmp = tempfile::tempdir().expect("tmp");
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/timeline");
    copy_dir(&src, tmp.path());
    let store = FsStore::new(tmp.path());
    (tmp, store)
}

fn bundle(store: &FsStore) -> Value {
    let history = history_view(store).expect("history");
    let reports: BTreeMap<String, Value> = history
        .scans
        .iter()
        .map(|s| {
            let report = report_at(store, s.seq).expect("report");
            (
                s.seq.to_string(),
                serde_json::to_value(report).expect("json"),
            )
        })
        .collect();
    let checks: Vec<String> = CHARTED.iter().map(|c| (*c).to_owned()).collect();
    let facts = history_facts(store, &checks, 20).expect("facts");
    let projects = store.load_projects().expect("projects").value;
    json!({
        "projects": projects.projects,
        "rules": projects.rules,
        "history": history,
        "reports": reports,
        "facts": facts,
    })
}

#[test]
fn committed_bundle_matches_the_core() {
    let (_tmp, store) = store();
    let mut text = serde_json::to_string(&bundle(&store)).expect("json");
    text.push('\n');
    let out: PathBuf = Path::new(env!("CARGO_MANIFEST_DIR")).join(OUT);
    if std::env::var_os("DAMINUS_BLESS").is_some() {
        fs::write(&out, &text).expect("write");
    }
    let have = fs::read_to_string(&out).expect("committed bundle; run with DAMINUS_BLESS=1");
    assert!(
        have == text,
        "src/testing/fixtures/results.json differs; run with DAMINUS_BLESS=1"
    );
}

#[test]
fn history_lists_every_scan_oldest_first_with_counts_and_check_levels() {
    let (_tmp, store) = store();
    let view = history_view(&store).expect("history");
    let seqs: Vec<u32> = view.scans.iter().map(|s| s.seq).collect();
    assert_eq!(seqs, (1..=12).collect::<Vec<_>>());
    assert_eq!(view.keep, Some(20));
    assert!(view.bytes > 0);

    let last = view.scans.last().expect("scan 12");
    assert_eq!((last.counts.crit, last.counts.warn), (2, 4));
    let kho = last.projects.iter().find(|p| p.id == "kho-hang").unwrap();
    assert_eq!((kho.crit, kho.warn), (2, 1));
    assert_eq!(kho.checks.get("url.exposed"), Some(&Level::Crit));
    assert_eq!(kho.checks.get("url.http"), Some(&Level::Ok));

    // legacy-shop stops answering from scan 7 and the summary says so.
    let seven = &view.scans[6];
    let outcome = &seven
        .hosts
        .get(&HostRef::parse("legacy-shop").unwrap())
        .unwrap()
        .outcome;
    assert!(!outcome.answered());
}

#[test]
fn an_old_report_is_evaluated_as_of_that_scan() {
    let (_tmp, store) = store();
    let five = report_at(&store, 5).expect("report 5");
    assert_eq!(five.seq, Some(5));
    let twelve = report_at(&store, 12).expect("report 12");
    assert!(five.counts.crit < twelve.counts.crit);
    assert!(report_at(&store, 99).is_err(), "a scan that is not kept");
}

#[test]
fn history_facts_returns_only_the_asked_checks_oldest_scan_first() {
    let (_tmp, store) = store();
    let facts = history_facts(&store, &["disk.fs".to_owned()], 3).expect("facts");
    assert!(facts.iter().all(|f| f.fact.check == "disk.fs"));
    let seqs: Vec<u32> = facts.iter().map(|f| f.seq).collect();
    let mut sorted = seqs.clone();
    sorted.sort_unstable();
    assert_eq!(seqs, sorted);
    assert_eq!(seqs.first(), Some(&10));
    assert_eq!(seqs.last(), Some(&12));
}
