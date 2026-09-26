use std::io::Write as _;
use std::process::{Command, Stdio};

use super::*;
use crate::checks::manifest;
use crate::checks::ndjson::{self, HostOutput};

/// Runs `text` the way a server does (`sh -s`, bundle on stdin) and parses
/// stdout. Where `dash` (Debian and Ubuntu's `sh`) is installed too, the bundle
/// must give the same facts under it.
fn run(text: &str) -> HostOutput {
    let out = run_with("sh", text);
    if std::path::Path::new("/bin/dash").exists() {
        let dash = run_with("/bin/dash", text);
        assert_eq!(
            (&dash.facts, dash.ended, dash.dropped),
            (&out.facts, out.ended, out.dropped),
            "dash and sh disagree"
        );
    }
    out
}

fn run_with(shell: &str, text: &str) -> HostOutput {
    let mut child = Command::new(shell)
        .arg("-s")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(text.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(
        out.stderr.is_empty(),
        "stderr must stay on the server ({shell})"
    );
    ndjson::parse(&out.stdout)
}

fn part(id: &str, body: &str) -> Part {
    Part {
        id: id.into(),
        body: body.into(),
    }
}

fn custom(groups: Vec<(CheckGroup, Vec<Part>)>, vars: &BundleVars) -> Bundle {
    assemble(PRELUDE, groups.into_iter().collect(), vars).unwrap()
}

#[test]
fn quote_table() {
    let cases = [
        ("plain", "'plain'"),
        ("", "''"),
        ("it's", r"'it'\''s'"),
        ("''", r"''\'''\'''"),
        ("$(id)", "'$(id)'"),
    ];
    for (input, want) in cases {
        assert_eq!(quote(input), want, "{input:?}");
    }
}

#[test]
fn hostile_values_reach_the_script_unchanged_and_never_run() {
    let dir = tempfile::tempdir().unwrap();
    let marker = dir.path().join("pwned");
    let m = marker.display();
    let values = [
        "it's".to_owned(),
        "'; touch {m}; '".replace("{m}", &m.to_string()),
        format!("$(touch {m})"),
        format!("`touch {m}`"),
        format!("; touch {m}"),
        format!("a\ntouch {m}\nb"),
        "-o".to_owned(),
        "--help".to_owned(),
        "$HOME * ? [a] ~".to_owned(),
        "back\\slash \"quote\" tab\tend".to_owned(),
        "trailing\\".to_owned(),
        "tiếng việt ✓".to_owned(),
    ];
    let mut vars = BundleVars::new();
    let mut body = String::new();
    for (i, v) in values.iter().enumerate() {
        vars.set(&format!("DAMINUS_V{i}"), v.clone()).unwrap();
        body.push_str(&format!("emit t.echo \"$DAMINUS_V{i}\"\n"));
    }
    let bundle = custom(
        vec![(CheckGroup::System, vec![part("t.echo", &body)])],
        &vars,
    );
    let out = run(&bundle.text);
    assert!(!marker.exists(), "a value ran as shell");
    assert!(out.ended);
    assert_eq!(out.dropped, 0);
    let got: Vec<&str> = out.facts.iter().map(|f| f.target.as_str()).collect();
    assert_eq!(got, values.iter().map(String::as_str).collect::<Vec<_>>());
}

#[test]
fn control_characters_in_values_are_escaped_or_dropped() {
    let mut vars = BundleVars::new();
    vars.set("DAMINUS_X", "a\u{1b}[31mb\rc\u{7}d").unwrap();
    let bundle = custom(
        vec![(
            CheckGroup::System,
            vec![part("t.echo", "emit t.echo \"$DAMINUS_X\"")],
        )],
        &vars,
    );
    let out = run(&bundle.text);
    assert_eq!(out.dropped, 0);
    assert_eq!(out.facts[0].target, "a[31mbcd");
}

#[test]
fn a_check_reading_stdin_cannot_swallow_the_rest() {
    let bundle = custom(
        vec![
            (
                CheckGroup::System,
                vec![
                    part(
                        "t.cat",
                        "cat\nwhile read -r line; do emit t.cat \"$line\"; done",
                    ),
                    part("t.after", "emit t.after \"\" 1 n"),
                ],
            ),
            (CheckGroup::Disk, vec![part("t.disk", "emit t.disk / 2 n")]),
        ],
        &BundleVars::new(),
    );
    let out = run(&bundle.text);
    let ids: Vec<&str> = out.facts.iter().map(|f| f.check.as_str()).collect();
    assert_eq!(ids, ["t.after", "t.disk"]);
    assert!(out.ended);
    assert_eq!(
        out.coverage,
        BTreeSet::from([CheckGroup::System, CheckGroup::Disk])
    );
}

#[test]
fn exit_cd_and_variables_stay_inside_their_check() {
    let bundle = custom(
        vec![(
            CheckGroup::System,
            vec![
                part("t.a", "cd /\nleak=1\nset -e\nfalse\nexit 3"),
                part("t.b", "emit t.b \"${leak-none}\" 1 n"),
            ],
        )],
        &BundleVars::new(),
    );
    let out = run(&bundle.text);
    assert_eq!(out.facts.len(), 1);
    assert_eq!(out.facts[0].target, "none");
    assert!(out.ended);
}

#[test]
fn stderr_never_leaves_the_server() {
    let bundle = custom(
        vec![(
            CheckGroup::System,
            vec![part(
                "t.noise",
                "echo boom >&2\nls /definitely/not/here\nemit t.noise \"\" 1 n",
            )],
        )],
        &BundleVars::new(),
    );
    // `run` asserts stderr is empty.
    let out = run(&bundle.text);
    assert_eq!(out.facts.len(), 1);
}

#[test]
fn prelude_helpers_write_valid_json() {
    let body = r#"
emit t.a "quote\" back\\ ctl$(printf '\001\002')" 12.5 "%" '{"k":1}' "fp one"
emit t.b "" not-a-number n
emit_unknown t.c /x needs_perm
perm_missing t.d /y
emit t.e "" -3 n
is_num 1.2.3 || emit t.f "" 0 n
emit t.x "" 01 n
emit t.y "" -00.5 n
emit t.g "" 0.5 n
"#;
    let bundle = custom(
        vec![(CheckGroup::System, vec![part("t.a", body)])],
        &BundleVars::new(),
    );
    let out = run(&bundle.text);
    assert_eq!(out.dropped, 0);
    let ids: Vec<&str> = out.facts.iter().map(|f| f.check.as_str()).collect();
    assert_eq!(ids, ["t.a", "t.c", "t.d", "t.e", "t.f", "t.g"]);
    let a = &out.facts[0];
    assert_eq!(a.target, "quote\" back\\ ctl");
    assert_eq!((a.value, a.unit.as_deref()), (Some(12.5), Some("%")));
    assert_eq!(a.data["k"], 1);
    assert_eq!(a.fp.as_deref(), Some("fp one"));
    assert_eq!(
        out.facts[1].unknown,
        Some(crate::domain::severity::UnknownReason::NeedsPerm)
    );
    assert_eq!(out.facts[3].value, Some(-3.0));
}

#[test]
fn shipped_bundle_runs_to_end_with_valid_lines() {
    let m = manifest().unwrap();
    let bundle = build(
        &m,
        &Selection::default(),
        &BundleVars::from_scan(&ScanSettings::default()).unwrap(),
    )
    .unwrap();
    assert_eq!(bundle.text.lines().next(), Some("exec 2>/dev/null"));
    assert!(bundle.text.ends_with("\nmain </dev/null\n"));
    assert_eq!(bundle.checks, ["sys.load", "disk.fs"]);
    let out = run(&bundle.text);
    assert_eq!(out.dropped, 0);
    assert!(out.ended);
    assert_eq!(out.bundle.as_deref(), Some(bundle.hash.as_str()));
    assert_eq!(
        out.coverage,
        BTreeSet::from([CheckGroup::System, CheckGroup::Disk])
    );
    // On Linux both checks answer for real; elsewhere sys.load says unsupported.
    let load = out.facts.iter().find(|f| f.check == "sys.load").unwrap();
    if cfg!(target_os = "linux") {
        assert!(load.value.is_some() && load.data["cores"].as_f64() > Some(0.0));
        assert!(out.facts.iter().any(|f| f.check == "disk.fs"));
    } else {
        assert_eq!(
            load.unknown,
            Some(crate::domain::severity::UnknownReason::Unsupported)
        );
    }
}

/// Puts an executable `df` printing `script` output in `bin`.
fn fake_df(bin: &std::path::Path, script: impl AsRef<[u8]>) {
    use std::os::unix::fs::PermissionsExt as _;
    let df = bin.join("df");
    std::fs::write(&df, script).unwrap();
    std::fs::set_permissions(&df, std::fs::Permissions::from_mode(0o755)).unwrap();
}

/// Runs the disk.fs-only bundle with `bin` first on PATH.
fn run_disk_fs(bin: &std::path::Path) -> HostOutput {
    let only = Selection {
        only: Some(BTreeSet::from(["disk.fs".to_owned()])),
        ..Selection::default()
    };
    let bundle = build(&manifest().unwrap(), &only, &BundleVars::new()).unwrap();
    let path = format!(
        "{}:{}",
        bin.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let mut child = Command::new("sh")
        .arg("-s")
        .env("PATH", path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(bundle.text.as_bytes())
        .unwrap();
    ndjson::parse_for(&bundle, &child.wait_with_output().unwrap().stdout)
}

#[test]
fn disk_fs_reports_each_device_once_at_a_directory_mount() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    let file_mount = dir.join("f");
    let other_file = dir.join("g");
    let data = dir.join("my data");
    std::fs::write(&file_mount, "").unwrap();
    std::fs::write(&other_file, "").unwrap();
    std::fs::create_dir(&data).unwrap();
    let (f, g, d) = (file_mount.display(), other_file.display(), data.display());
    // A bind mount of a file comes first for sda1, as in a container.
    let table = |pct: &str| {
        format!(
            "Filesystem Type 1024-blocks Used Available Capacity Mounted on\n\
             /dev/sda1 ext4 100 40 60 {pct}% {f}\n\
             /dev/sda1 ext4 100 40 60 {pct}% /\n\
             /dev/sdb1 ext4 100 10 90 10% {g}\n\
             tmpfs tmpfs 100 1 99 1% /tmp\n\
             /dev/sdc1 xfs 200 50 150 25% {d}\n"
        )
    };
    let bin = dir.join("bin");
    std::fs::create_dir(&bin).unwrap();
    fake_df(
        &bin,
        format!(
            "#!/bin/sh\ncase \"$*\" in\n*-i*) cat <<'EOF'\n{}EOF\n;;\n*) cat <<'EOF'\n{}EOF\n;;\nesac\n",
            table("7"),
            table("40")
        ),
    );

    let out = run_disk_fs(&bin);
    assert_eq!(out.dropped, 0);
    let got: Vec<(&str, &serde_json::Value)> = out
        .facts
        .iter()
        .map(|x| (x.target.as_str(), &x.data["pct"]))
        .collect();
    let data_dir = d.to_string();
    assert_eq!(got, [("/", &40.into()), (data_dir.as_str(), &25.into())]);
    assert_eq!(out.facts[0].data["ipct"], 7);
    assert_eq!(out.facts[1].data["size"], 204_800);
}

#[test]
fn disk_fs_without_a_real_filesystem_is_unsupported() {
    let tmp = tempfile::tempdir().unwrap();
    let bin = tmp.path();
    fake_df(
        bin,
        "#!/bin/sh\necho 'Filesystem Type 1024-blocks Used Available Capacity Mounted on'\necho 'overlay overlay 100 40 60 40% /'\n",
    );
    let out = run_disk_fs(bin);
    assert_eq!(out.facts.len(), 1);
    assert_eq!(
        out.facts[0].unknown,
        Some(crate::domain::severity::UnknownReason::Unsupported)
    );
}

#[test]
fn selection_filters_groups_and_ids() {
    let m = manifest().unwrap();
    let vars = BundleVars::new();
    let no_disk = Selection {
        disabled_groups: BTreeSet::from([CheckGroup::Disk, CheckGroup::System]),
        only: None,
    };
    let b = build(&m, &no_disk, &vars).unwrap();
    assert_eq!(b.checks, ["sys.load"], "system cannot be switched off");
    assert_eq!(b.groups, [CheckGroup::System]);

    let only = Selection {
        only: Some(BTreeSet::from(["disk.fs".to_owned()])),
        ..Selection::default()
    };
    let b = build(&m, &only, &vars).unwrap();
    assert_eq!(b.checks, ["disk.fs"]);
    assert!(!b.text.contains("c_sys_load"));

    for id in ["nope", "url.http", "sys.mem"] {
        let bad = Selection {
            only: Some(BTreeSet::from([id.to_owned()])),
            ..Selection::default()
        };
        assert_eq!(
            build(&m, &bad, &vars),
            Err(BundleError::UnknownCheck(id.to_owned()))
        );
    }
}

#[test]
fn hash_ignores_variables_but_not_checks() {
    let m = manifest().unwrap();
    let mut a = BundleVars::new();
    a.set("DAMINUS_LARGE_FILE_MB", "50").unwrap();
    let mut b = BundleVars::new();
    b.set("DAMINUS_LARGE_FILE_MB", "999").unwrap();
    let all = Selection::default();
    let one = Selection {
        only: Some(BTreeSet::from(["sys.load".to_owned()])),
        ..Selection::default()
    };
    let h = |s: &Selection, v: &BundleVars| build(&m, s, v).unwrap().hash;
    assert_eq!(h(&all, &a), h(&all, &b));
    assert_ne!(h(&all, &a), h(&one, &a));
    assert_eq!(h(&all, &a).len(), 16);
}

#[test]
fn variable_names_are_checked() {
    let mut vars = BundleVars::new();
    for bad in [
        "",
        "lower",
        "1ABC",
        "A-B",
        "A B",
        "A;B",
        "DAMINUS_BUNDLE",
        "DAMINUS_",
        "DAMINUS_lower",
        "$(X)",
        "PATH",
        "IFS",
        "LC_ALL",
        "HOME",
        "CDPATH",
    ] {
        assert_eq!(
            vars.set(bad, "x"),
            Err(BundleError::BadName(bad.to_owned()))
        );
    }
    assert_eq!(
        vars.set("DAMINUS_X", "a\0b"),
        Err(BundleError::NulInValue("DAMINUS_X".into()))
    );
    assert!(vars.set("DAMINUS_OK_2", "x").is_ok());
}

#[test]
fn skip_paths_travel_as_one_line_each() {
    let scan = ScanSettings {
        skip_paths: vec!["node_modules".into(), "it's here".into(), "a b".into()],
        ..ScanSettings::default()
    };
    let vars = BundleVars::from_scan(&scan).unwrap();
    let bundle = custom(
        vec![(
            CheckGroup::Disk,
            vec![part(
                "t.skip",
                "printf '%s\\n' \"$DAMINUS_SKIP_PATHS\" | while IFS= read -r p; do emit t.skip \"$p\"; done\nemit t.floor \"$DAMINUS_LARGE_FILE_MB\"",
            )],
        )],
        &vars,
    );
    let out = run(&bundle.text);
    let got: Vec<&str> = out.facts.iter().map(|f| f.target.as_str()).collect();
    assert_eq!(got, ["node_modules", "it's here", "a b", "50"]);
}

#[test]
fn check_ids_must_make_unique_function_names() {
    let groups = BTreeMap::from([(
        CheckGroup::System,
        vec![part("a.b", "true"), part("a_b", "true")],
    )]);
    assert_eq!(
        assemble(PRELUDE, groups, &BundleVars::new()),
        Err(BundleError::BadCheckId("a_b".into()))
    );
    let groups = BTreeMap::from([(CheckGroup::System, vec![part("x;rm", "true")])]);
    assert!(assemble(PRELUDE, groups, &BundleVars::new()).is_err());
}
