use super::*;
use crate::discover::{EnvFile, discover_bundle, login_bundle};
use crate::domain::ingest::MAX_LINE_BYTES;
use crate::domain::settings::ScanSettings;

fn bundle() -> Bundle {
    discover_bundle(&ScanSettings::default(), true).unwrap()
}

fn begin(b: &Bundle) -> String {
    format!("{{\"_\":\"begin\",\"v\":1,\"bundle\":\"{}\"}}\n", b.hash)
}

const END: &str = "{\"_\":\"end\"}\n";
const ENV: &str = "{\"rec\":\"env\",\"path\":\"/srv/shop/.env\",\"readable\":true}\n";

fn parse_all(b: &Bundle, text: &str) -> RecordOutput {
    let mut p = RecordParser::for_bundle(b);
    p.feed(text.as_bytes());
    p.finish()
}

#[test]
fn records_between_begin_and_end_are_kept() {
    let b = bundle();
    let text = format!(
        "{}{ENV}{{\"_\":\"step\",\"group\":\"discover\",\"ms\":4}}\n{END}",
        begin(&b)
    );
    let out = parse_all(&b, &text);
    assert!(out.ended);
    assert_eq!(out.dropped, 0);
    assert_eq!(out.bundle.as_deref(), Some(b.hash.as_str()));
    assert_eq!(out.records.len(), 1);
}

#[test]
fn a_chunk_boundary_may_fall_anywhere() {
    let b = bundle();
    let text = format!("{}{ENV}{ENV}{END}", begin(&b));
    let mut p = RecordParser::for_bundle(&b);
    let mut got = 0;
    for chunk in text.as_bytes().chunks(7) {
        got += p.feed(chunk).len();
    }
    assert_eq!(got, 2);
    assert!(p.begun());
    let out = p.finish();
    assert!(out.ended);
    assert_eq!(out.records.len(), 2);
}

#[test]
fn another_bundle_hash_drops_the_whole_run() {
    let b = bundle();
    let other = login_bundle(&[], true).unwrap();
    let out = parse_all(&b, &format!("{}{ENV}{END}", begin(&other)));
    assert_eq!(out.bundle, None);
    assert!(!out.ended);
    assert!(out.records.is_empty());
    assert_eq!(out.dropped, 3);
}

#[test]
fn records_outside_begin_and_end_are_dropped() {
    let b = bundle();
    let out = parse_all(&b, &format!("{ENV}{}{END}{ENV}", begin(&b)));
    assert_eq!(out.records.len(), 0);
    assert!(out.ended);
    assert_eq!(out.dropped, 2);
}

#[test]
fn junk_is_dropped_and_counted_never_fatal() {
    let b = bundle();
    let text = format!(
        "{}not json\n[1,2]\n{{\"rec\":\"shell\"}}\n{{\"_\":3}}\n{{\"check\":\"sys.load\"}}\n{{\"_\":\"unknown\"}}\n{ENV}{END}",
        begin(&b)
    );
    let out = parse_all(&b, &text);
    assert_eq!(out.records.len(), 1);
    assert_eq!(out.dropped, 6);
    assert!(out.ended);
}

#[test]
fn escape_sequences_and_binary_in_lines_are_scrubbed() {
    let b = bundle();
    let text = format!(
        "{}{{\"rec\":\"env\",\"path\":\"/srv/\u{1b}[31mshop\u{1b}[0m/.env\",\"readable\":true}}\n{END}",
        begin(&b)
    );
    let out = parse_all(&b, &text);
    assert_eq!(
        out.records,
        [SetupRecord::Env(EnvFile {
            path: "/srv/shop/.env".into(),
            readable: true
        })]
    );
}

#[test]
fn an_overlong_line_is_dropped_without_growing_memory() {
    let b = bundle();
    let long = "x".repeat(MAX_LINE_BYTES + 10);
    let text = format!("{}{long}\n{ENV}{END}", begin(&b));
    let out = parse_all(&b, &text);
    assert_eq!(out.records.len(), 1);
    assert_eq!(out.dropped, 1);
}

#[test]
fn each_kind_has_its_own_cap() {
    let b = bundle();
    let mut text = begin(&b);
    for i in 0..150 {
        text.push_str(&format!(
            "{{\"rec\":\"env\",\"path\":\"/srv/a{i}/.env\",\"readable\":true}}\n"
        ));
    }
    for i in 0..3 {
        text.push_str(&format!(
            "{{\"rec\":\"port\",\"port\":{},\"bind\":\"any\"}}\n",
            3000 + i
        ));
    }
    text.push_str(END);
    let out = parse_all(&b, &text);
    let envs = out
        .records
        .iter()
        .filter(|r| matches!(r, SetupRecord::Env(_)))
        .count();
    assert_eq!(envs, 100);
    assert_eq!(out.records.len(), 103);
    assert_eq!(out.dropped, 50);
}

#[test]
fn no_end_line_leaves_the_run_unfinished() {
    let b = bundle();
    let out = parse_all(&b, &format!("{}{ENV}", begin(&b)));
    assert!(!out.ended);
    assert_eq!(out.records.len(), 1);
}

#[test]
fn a_last_line_without_a_newline_still_counts() {
    let b = bundle();
    let text = format!("{}{}", begin(&b), ENV.trim_end());
    let out = parse_all(&b, &text);
    assert_eq!(out.records.len(), 1);
}

#[test]
fn the_any_parser_takes_recorded_output_of_any_hash() {
    let mut p = RecordParser::any();
    p.feed(b"{\"_\":\"begin\",\"v\":1,\"bundle\":\"0123456789abcdef\"}\n");
    p.feed(ENV.as_bytes());
    p.feed(END.as_bytes());
    let out = p.finish();
    assert!(out.ended);
    assert_eq!(out.records.len(), 1);
}

#[test]
fn a_run_that_is_not_version_one_is_not_accepted() {
    let b = bundle();
    let text = format!(
        "{{\"_\":\"begin\",\"v\":2,\"bundle\":\"{}\"}}\n{ENV}{END}",
        b.hash
    );
    let out = parse_all(&b, &text);
    assert!(out.records.is_empty());
    assert!(!out.ended);
}
