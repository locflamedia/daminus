use super::*;
use crate::domain::severity::UnknownReason;

const BEGIN: &str = r#"{"_":"begin","v":1,"bundle":"abc"}"#;
const END: &str = r#"{"_":"end"}"#;

fn lines(items: &[&str]) -> Vec<u8> {
    let mut out = items.join("\n").into_bytes();
    out.push(b'\n');
    out
}

#[test]
fn full_run_is_reached_with_coverage() {
    let out = parse(&lines(&[
        BEGIN,
        r#"{"check":"sys.load","target":"","value":0.4,"unit":"load","data":{"cores":2}}"#,
        r#"{"_":"step","group":"system","ms":12}"#,
        r#"{"check":"disk.fs","target":"/","data":{"pct":41,"ipct":12}}"#,
        r#"{"check":"disk.fs","target":"/data","unknown":"needs_perm"}"#,
        r#"{"_":"step","group":"disk","ms":80}"#,
        END,
    ]));
    assert_eq!(out.dropped, 0);
    assert!(out.ended);
    assert_eq!(out.outcome(), HostOutcome::Reached);
    assert_eq!(out.bundle.as_deref(), Some("abc"));
    assert_eq!(out.facts.len(), 3);
    assert_eq!(out.facts[0].value, Some(0.4));
    assert_eq!(out.facts[2].unknown, Some(UnknownReason::NeedsPerm));
    assert_eq!(
        out.coverage,
        BTreeSet::from([CheckGroup::System, CheckGroup::Disk])
    );
    assert_eq!(out.step_ms.get(&CheckGroup::Disk), Some(&80));
}

#[test]
fn missing_end_is_partial() {
    let out = parse(&lines(&[
        BEGIN,
        r#"{"check":"sys.load","target":"","value":0.4,"unit":"load","data":{"cores":2}}"#,
        r#"{"_":"step","group":"system","ms":12}"#,
    ]));
    assert!(!out.ended);
    assert_eq!(out.outcome(), HostOutcome::Partial);
    assert_eq!(out.facts.len(), 1);
    assert_eq!(out.coverage, BTreeSet::from([CheckGroup::System]));
}

#[test]
fn broken_lines_are_dropped_and_counted() {
    let cases: &[&str] = &[
        "",
        "not json",
        r#"{"check":"sys.load","#,
        "[1,2,3]",
        r#""a string""#,
        r#"{"_":"step","group":"nope","ms":1}"#,
        r#"{"_":"surprise"}"#,
        r#"{"_":7}"#,
        r#"{"check":"","target":""}"#,
        r#"{"check":"Sys Load","target":""}"#,
        r#"{"check":"sys.load","target":"","unknown":"because"}"#,
        r#"{"check":"sys.load","target":"","value":"high"}"#,
        r#"{"_":"begin","v":1,"bundle":"again"}"#,
        r#"{"target":"no check"}"#,
    ];
    let mut input = vec![BEGIN];
    input.extend_from_slice(cases);
    input.push(r#"{"check":"sys.load","target":"","value":1,"unit":"load","data":{"cores":1}}"#);
    input.push(END);
    let out = parse(&lines(&input));
    assert_eq!(out.dropped as usize, cases.len());
    assert_eq!(out.facts.len(), 1);
    assert!(out.ended);
}

#[test]
fn facts_outside_begin_and_end_are_dropped() {
    let fact = r#"{"check":"sys.load","target":"","value":1,"unit":"load","data":{"cores":1}}"#;
    let out = parse(&lines(&[fact, BEGIN, fact, END, fact, END]));
    assert_eq!(out.facts.len(), 1);
    assert_eq!(out.dropped, 3);
    assert!(out.ended);
}

#[test]
fn other_version_is_not_trusted() {
    let out = parse(&lines(&[
        r#"{"_":"begin","v":2,"bundle":"x"}"#,
        r#"{"check":"sys.load","target":"","value":1}"#,
        END,
    ]));
    assert_eq!(out.dropped, 3);
    assert!(out.facts.is_empty());
    assert_eq!(out.outcome(), HostOutcome::Partial);
}

#[test]
fn unknown_fields_are_ignored() {
    let out = parse(&lines(&[
        r#"{"_":"begin","v":1,"bundle":"x","extra":true}"#,
        r#"{"check":"sys.load","target":"","value":1,"later":{"a":1}}"#,
        r#"{"_":"end","why":"done"}"#,
    ]));
    assert_eq!((out.dropped, out.facts.len(), out.ended), (0, 1, true));
}

#[test]
fn control_characters_are_scrubbed_before_parsing() {
    let raw =
        b"{\"check\":\"disk.fs\",\"target\":\"/mnt/\x1b[31mred\x1b[0m\",\"data\":{\"pct\":1}}";
    let mut input = lines(&[BEGIN]);
    input.extend_from_slice(raw);
    input.extend_from_slice(b"\n");
    input.extend_from_slice(&lines(&[END]));
    let out = parse(&input);
    assert_eq!(out.dropped, 0);
    assert_eq!(out.facts[0].target, "/mnt/red");
}

#[test]
fn data_arrays_are_capped() {
    let big: Vec<String> = (0..50).map(|i| i.to_string()).collect();
    let fact = format!(
        r#"{{"check":"disk.path","target":"/srv","data":{{"top":[{}]}}}}"#,
        big.join(",")
    );
    let out = parse(&lines(&[BEGIN, &fact, END]));
    assert_eq!(
        out.facts[0].data["top"].as_array().map(Vec::len),
        Some(crate::domain::ingest::MAX_DATA_ARRAY)
    );
}

#[test]
fn overlong_line_is_dropped_even_across_chunks() {
    let mut parser = Parser::new();
    parser.feed(format!("{BEGIN}\n").as_bytes());
    let long = format!(
        r#"{{"check":"x","target":"{}"}}"#,
        "a".repeat(MAX_LINE_BYTES)
    );
    let (a, b) = long.as_bytes().split_at(long.len() / 2);
    assert!(parser.feed(a).is_empty());
    assert!(parser.feed(b).is_empty());
    let tail = parser.feed(format!("\n{END}\n").as_bytes());
    assert_eq!(tail, vec![Line::End]);
    let out = parser.finish();
    assert_eq!(out.dropped, 1);
    assert!(out.ended);
}

#[test]
fn chunks_split_anywhere_give_the_same_result() {
    let input = lines(&[
        BEGIN,
        r#"{"check":"sys.load","target":"","value":0.5,"unit":"load","data":{"cores":4}}"#,
        r#"{"_":"step","group":"system","ms":3}"#,
        END,
    ]);
    let whole = parse(&input);
    for size in [1, 2, 7, 64] {
        let mut parser = Parser::new();
        let mut seen = Vec::new();
        for chunk in input.chunks(size) {
            seen.extend(parser.feed(chunk));
        }
        assert_eq!(seen.len(), 4, "chunk size {size}");
        assert_eq!(parser.finish(), whole, "chunk size {size}");
    }
}

#[test]
fn last_line_without_newline_counts() {
    let mut input = lines(&[BEGIN]);
    input.extend_from_slice(END.as_bytes());
    let out = parse(&input);
    assert!(out.ended);
    assert_eq!(out.dropped, 0);
}

#[test]
fn cut_mid_line_is_partial() {
    let input = format!("{BEGIN}\n{{\"check\":\"sys.load\",\"tar");
    let out = parse(input.as_bytes());
    assert_eq!(out.outcome(), HostOutcome::Partial);
    assert_eq!(out.dropped, 1);
}

#[test]
fn output_over_the_host_limit_is_truncated() {
    let fact = r#"{"check":"sys.load","target":"","value":1}"#;
    let mut parser = Parser::new();
    parser.feed(format!("{BEGIN}\n").as_bytes());
    let block = format!("{fact}\n").repeat(1024);
    while !parser.out.truncated {
        parser.feed(block.as_bytes());
    }
    parser.feed(format!("{END}\n").as_bytes());
    let out = parser.finish();
    assert!(out.truncated);
    assert!(!out.ended, "end after the limit is not read");
    assert_eq!(out.facts.len(), MAX_HOST_FACTS);
}

fn sent() -> Bundle {
    Bundle {
        text: String::new(),
        hash: "abc".into(),
        checks: vec!["sys.load".into(), "disk.fs".into()],
        groups: vec![CheckGroup::System, CheckGroup::Disk],
    }
}

#[test]
fn a_bundle_parser_drops_checks_and_groups_it_did_not_send() {
    let out = parse_for(
        &sent(),
        &lines(&[
            BEGIN,
            r#"{"check":"sys.load","target":"","value":0.4,"unit":"load"}"#,
            r#"{"check":"url.tls","target":"example.com","data":{"days":90}}"#,
            r#"{"check":"svc.docker","target":"x"}"#,
            r#"{"_":"step","group":"system","ms":1}"#,
            r#"{"_":"step","group":"containers","ms":1}"#,
            END,
        ]),
    );
    assert_eq!(out.dropped, 3);
    assert_eq!(out.facts.len(), 1);
    assert_eq!(out.facts[0].check, "sys.load");
    assert_eq!(out.coverage, BTreeSet::from([CheckGroup::System]));
    assert_eq!(out.outcome(), HostOutcome::Reached);
}

#[test]
fn a_bundle_parser_rejects_another_bundle_hash() {
    let out = parse_for(
        &sent(),
        &lines(&[
            r#"{"_":"begin","v":1,"bundle":"stale"}"#,
            r#"{"check":"sys.load","target":"","value":0.4}"#,
            r#"{"_":"step","group":"system","ms":1}"#,
            END,
        ]),
    );
    assert_eq!(out.bundle, None);
    assert!(out.facts.is_empty() && out.coverage.is_empty());
    assert_eq!(out.dropped, 4);
    assert_eq!(out.outcome(), HostOutcome::Partial);
}
