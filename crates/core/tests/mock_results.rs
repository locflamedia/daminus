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

use std::fs;
use std::path::{Path, PathBuf};

use daminus_core::domain::error::ErrorCode;
use daminus_core::domain::host::HostRef;
use daminus_core::domain::severity::Level;
use daminus_core::scan::{history_bundle, history_facts, history_view, report_at};
use daminus_core::store::FsStore;

const OUT: &str = "../../src/testing/fixtures/results.json";

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

#[test]
fn committed_bundle_matches_the_core() {
    let (_tmp, store) = store();
    let mut text = serde_json::to_string(&history_bundle(&store).expect("bundle")).expect("json");
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
    let missing = report_at(&store, 99).expect_err("a scan that is not kept");
    assert_eq!(missing.code, ErrorCode::ScanNotFound);
    assert!(!missing.retryable);
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

#[test]
fn an_old_report_does_not_see_newer_scans() {
    let (_tmp, store) = store();
    let five = report_at(&store, 5).expect("report 5");
    assert_eq!(
        five.counts.crit, 0,
        "the exposed .env and the uploaded shell came later"
    );
    assert!(five.scanned_at.is_some());
}

#[test]
fn too_many_checks_are_refused() {
    let (_tmp, store) = store();
    let checks: Vec<String> = (0..40).map(|i| format!("sys.fake{i}")).collect();
    assert!(history_facts(&store, &checks, 3).is_err());
}

#[test]
fn malformed_check_ids_are_refused() {
    let (_tmp, store) = store();
    for bad in ["", "Disk.fs", "disk fs", "disk.fs;rm", &"a".repeat(65)] {
        let err = history_facts(&store, &[bad.to_owned()], 3).expect_err("a bad check id");
        assert_eq!(err.code, ErrorCode::SchemaInvalid, "{bad}");
    }
    assert!(history_facts(&store, &["a".repeat(64)], 3).is_ok());
}
