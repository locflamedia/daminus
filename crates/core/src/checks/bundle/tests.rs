use std::io::Write as _;
use std::process::{Command, Stdio};

use serde_json::Value;

use super::*;
use crate::checks::manifest;
use crate::checks::ndjson::{self, HostOutput};
use crate::domain::fact::CheckFact;
use crate::domain::host::HostAlias;
use crate::domain::project::ProjectsFile;

/// Data keys and top-level `value`s that read live host state (disk use,
/// load average, memory, PSI) and so can drift by a small amount between two
/// subprocess runs a few milliseconds apart, even on the same host. Pinning
/// them before comparison keeps the check on the *shape* of the output — check ids,
/// targets, `unit`, data keys, and stable fields such as filesystem `size`
/// and `fs` or core count — without flaking on live values.
const VOLATILE_DATA_KEYS: &[&str] = &[
    "used",
    "avail",
    "available",
    "pct",
    "ipct",
    "load1",
    "load15",
    "cpu",
    "io",
    "memory",
];

fn stabilize(facts: &[CheckFact]) -> Vec<CheckFact> {
    facts
        .iter()
        .cloned()
        .map(|mut f| {
            if f.value.is_some() {
                f.value = Some(0.0);
            }
            if let Value::Object(map) = &mut f.data {
                for key in VOLATILE_DATA_KEYS {
                    if map.contains_key(*key) {
                        map.insert((*key).to_owned(), Value::from(0));
                    }
                }
            }
            f
        })
        .collect()
}

/// Runs `text` the way a server does (`sh -s`, bundle on stdin) and parses
/// stdout. Where `dash` (Debian and Ubuntu's `sh`) is installed too, the
/// bundle must give facts of the same shape under it (see [`stabilize`]).
fn run(text: &str) -> HostOutput {
    let out = run_with("sh", text);
    if std::path::Path::new("/bin/dash").exists() {
        let dash = run_with("/bin/dash", text);
        assert_eq!(
            (stabilize(&dash.facts), dash.ended, dash.dropped),
            (stabilize(&out.facts), out.ended, out.dropped),
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
    assert!(bundle.text.ends_with("else main </dev/null; fi; exit 0\n"));
    let scripted: Vec<&str> = m
        .checks
        .iter()
        .filter(|c| c.script.is_some())
        .map(|c| c.id.as_str())
        .collect();
    let mut got: Vec<&str> = bundle.checks.iter().map(String::as_str).collect();
    got.sort_unstable();
    let mut want = scripted.clone();
    want.sort_unstable();
    assert_eq!(got, want, "every scripted check of the enabled groups");
    let out = run(&bundle.text);
    assert_eq!(out.dropped, 0);
    assert!(out.ended);
    assert_eq!(out.bundle.as_deref(), Some(bundle.hash.as_str()));
    assert_eq!(out.coverage, bundle.groups.iter().copied().collect());
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
        disabled_groups: BTreeSet::from([
            CheckGroup::Disk,
            CheckGroup::Containers,
            CheckGroup::System,
        ]),
        only: None,
    };
    let b = build(&m, &no_disk, &vars).unwrap();
    assert_eq!(
        b.checks,
        ["sys.load", "sys.mem", "sys.swap", "sys.psi", "sys.oom"],
        "system cannot be switched off"
    );
    assert_eq!(b.groups, [CheckGroup::System]);

    let only = Selection {
        only: Some(BTreeSet::from(["disk.fs".to_owned()])),
        ..Selection::default()
    };
    let b = build(&m, &only, &vars).unwrap();
    assert_eq!(b.checks, ["disk.fs"]);
    assert!(!b.text.contains("c_sys_load"));

    for id in ["nope", "url.http", "db.size"] {
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

/// Runs a hang-up bundle whose only check sleeps, in its own process group
/// (like an SSH session), with stdin held open. Returns the child and group.
#[cfg(unix)]
fn spawn_hangup(shell: &str, sleep_s: u32) -> (std::process::Child, i32) {
    use std::os::unix::process::CommandExt as _;
    let mut groups = BTreeMap::new();
    groups.insert(
        CheckGroup::System,
        vec![part(
            "t.sleep",
            &format!("sleep {sleep_s}\nemit t.sleep \"\""),
        )],
    );
    let mut vars = BundleVars::new();
    vars.set(HANGUP_VAR, "1").unwrap();
    let bundle = assemble(PRELUDE, groups, &vars).unwrap();
    let mut child = Command::new(shell)
        .arg("-s")
        .process_group(0)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let stdin = child.stdin.as_mut().unwrap();
    stdin.write_all(bundle.text.as_bytes()).unwrap();
    stdin.flush().unwrap();
    let pgid = i32::try_from(child.id()).unwrap();
    (child, pgid)
}

/// Whether anything in `pgid` could still run. A zombie cannot: it is a
/// process that has already exited and is merely waiting for its parent to
/// collect its exit status. The bundle's own wrapper (the watcher, `main`'s
/// dispatch) reaps everything it directly owns, but a check's own external
/// command is arbitrary and may die from the same broadcast signal as the
/// shell running it, too fast for that shell to collect it before dying in
/// turn; the orphan then falls to the target's init to reap, which every
/// normal server does promptly but a bare container run as PID 1 (this test,
/// under `docker run` with no init) never does. Since a plain `kill(pid, 0)`
/// succeeds for a zombie too, checking the group's exit this way on Linux
/// (`/proc`) keeps the test about the property that matters — nothing left
/// running — instead of the host's unrelated init behavior.
#[cfg(target_os = "linux")]
fn group_alive(pgid: i32) -> bool {
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return false;
    };
    entries.flatten().any(|entry| {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|s| s.parse::<i32>().ok())
        else {
            return false;
        };
        let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
            return false;
        };
        let Some((_, rest)) = stat.rsplit_once(") ") else {
            return false;
        };
        let mut fields = rest.split(' ');
        let state = fields.next();
        let this_pgid = fields.nth(1); // ppid, then pgrp
        state != Some("Z") && this_pgid == Some(pgid.to_string().as_str())
    })
}

#[cfg(all(unix, not(target_os = "linux")))]
fn group_alive(pgid: i32) -> bool {
    nix::sys::signal::killpg(nix::unistd::Pid::from_raw(pgid), None).is_ok()
}

/// Polls until every process in `pgid` is gone, reaping `child` (the test's
/// own direct child, the top of the bundle) along the way: a zombie still
/// belongs to its process group until its parent collects it, so leaving
/// `child` unreaped would make the group look alive forever regardless of
/// how well the bundle itself cleans up.
#[cfg(unix)]
fn wait_gone(child: &mut std::process::Child, pgid: i32, limit: std::time::Duration) -> bool {
    let t0 = std::time::Instant::now();
    while t0.elapsed() < limit {
        let _ = child.try_wait();
        if !group_alive(pgid) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    false
}

#[cfg(unix)]
#[test]
fn hangup_bundle_stops_its_group_when_stdin_closes() {
    let shells: Vec<&str> = ["sh", "/bin/dash", "/bin/bash"]
        .into_iter()
        .filter(|s| *s == "sh" || std::path::Path::new(s).exists())
        .collect();
    for shell in shells {
        let (mut child, pgid) = spawn_hangup(shell, 30);
        std::thread::sleep(std::time::Duration::from_millis(400));
        assert!(group_alive(pgid), "{shell}: bundle still running");
        // The client goes away: stdin reaches end of file.
        drop(child.stdin.take());
        let gone = wait_gone(&mut child, pgid, std::time::Duration::from_secs(15));
        let _ = nix::sys::signal::killpg(
            nix::unistd::Pid::from_raw(pgid),
            nix::sys::signal::Signal::SIGKILL,
        );
        let _ = child.wait();
        assert!(gone, "{shell}: the sleeping check must be stopped");
    }
}

#[cfg(unix)]
#[test]
fn hangup_bundle_exits_by_itself_with_stdin_open() {
    let (mut child, pgid) = spawn_hangup("sh", 0);
    let t0 = std::time::Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().unwrap() {
            break Some(s);
        }
        if t0.elapsed() > std::time::Duration::from_secs(5) {
            break None;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    };
    let _ = nix::sys::signal::killpg(
        nix::unistd::Pid::from_raw(pgid),
        nix::sys::signal::Signal::SIGKILL,
    );
    let status = status.expect("the shell must not wait for more input");
    assert!(status.success());
    let mut stdout = Vec::new();
    std::io::Read::read_to_end(child.stdout.as_mut().unwrap(), &mut stdout).unwrap();
    let out = ndjson::parse(&stdout);
    assert!(out.ended);
    assert!(!group_alive(pgid) || wait_gone(&mut child, pgid, std::time::Duration::from_secs(2)));
}

#[test]
fn components_of_the_host_travel_as_lists() {
    let projects: ProjectsFile = serde_json::from_value(serde_json::json!({
        "version": 1,
        "projects": [
            {"id": "a", "name": "A", "components": [
                {"role": "fe", "host": "vps-a", "kind": "path", "path": "/srv/shop/"},
                {"role": "be", "host": "vps-a", "kind": "compose", "project": "shop"},
                {"role": "worker", "host": "vps-a", "kind": "pm2", "app": "queue"},
                {"role": "worker", "host": "vps-a", "kind": "pm2", "app": "admin",
                 "pm2_home": "/home/www/.pm2/"},
                {"role": "db", "host": "vps-a", "kind": "db", "engine": "mysql",
                 "database": "shop", "env_file": "/srv/shop/.env"},
                {"role": "fe", "host": "vps-b", "kind": "path", "path": "/srv/other"}
            ]},
            {"id": "b", "name": "B", "components": [
                {"role": "fe", "host": "vps-a", "kind": "path", "path": "/srv/shop"},
                {"role": "fe", "host": "vps-a", "kind": "path", "path": "/"}
            ]}
        ]
    }))
    .unwrap();
    let host = HostAlias::parse("vps-a").unwrap();
    let mut vars = BundleVars::new();
    vars.add_components(&projects, &host).unwrap();
    assert_eq!(vars.0[PATHS_VAR], "/srv/shop\n/");
    assert_eq!(vars.0[COMPOSE_VAR], "shop");
    assert_eq!(vars.0[PM2_VAR], "queue\nadmin\t/home/www/.pm2");

    // A host without components still gets the variables, empty.
    let mut none = BundleVars::new();
    none.add_components(&projects, &HostAlias::parse("vps-c").unwrap())
        .unwrap();
    assert_eq!(none.0[PATHS_VAR], "");

    // Components change the text, never the hash.
    let m = manifest().unwrap();
    let with = build(&m, &Selection::default(), &vars).unwrap();
    let without = build(&m, &Selection::default(), &BundleVars::new()).unwrap();
    assert_eq!(with.hash, without.hash);
    assert!(
        with.text
            .contains("DAMINUS_PM2='queue\nadmin\t/home/www/.pm2'")
    );
}

/// bash 3.2 (macOS `sh`) used to abort `main` depending on where the bundle's
/// bytes fell in its input buffer. Shifting the bundle by a padding variable
/// must never lose the run, in every shell here.
#[cfg(unix)]
#[test]
fn hangup_bundle_finishes_at_any_bundle_size() {
    let shells: Vec<&str> = ["sh", "/bin/dash", "/bin/bash"]
        .into_iter()
        .filter(|s| *s == "sh" || std::path::Path::new(s).exists())
        .collect();
    let m = manifest().unwrap();
    let only = Selection {
        only: Some(BTreeSet::from(["sys.load".to_owned()])),
        ..Selection::default()
    };
    for shell in shells {
        for pad in (0..4200).step_by(233) {
            let mut vars = BundleVars::new();
            vars.set(HANGUP_VAR, "1").unwrap();
            vars.set("DAMINUS_PAD", "x".repeat(pad)).unwrap();
            let bundle = build(&m, &only, &vars).unwrap();
            let mut child = Command::new(shell)
                .arg("-s")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            // stdin stays open, as over SSH, until the bundle has exited.
            let mut stdin = child.stdin.take().unwrap();
            stdin.write_all(bundle.text.as_bytes()).unwrap();
            stdin.flush().unwrap();
            let mut stdout = child.stdout.take().unwrap();
            let mut buf = Vec::new();
            std::io::Read::read_to_end(&mut stdout, &mut buf).unwrap();
            drop(stdin);
            let _ = child.wait();
            let out = ndjson::parse(&buf);
            assert!(out.ended, "{shell}, pad {pad}: the run was lost");
        }
    }
}
