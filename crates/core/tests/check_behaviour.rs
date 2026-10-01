//! Behaviour of the server and component check scripts, run with `sh -s`
//! the way a server runs them, with fake or recorded tools first on PATH:
//! the harness shims (`scripts/check-harness/bin`, reading the recorded
//! output through `HARNESS_OUT`) and per-test fakes. The read-only container
//! run (`scripts/check-harness/run.sh`) covers the same scripts on real
//! Linux userlands; these tests pin the branches a container cannot reach
//! (no daemon, another user's pm2, missing permission, a stopped docker).

#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::collections::BTreeSet;
use std::io::Write as _;
use std::os::unix::fs::PermissionsExt as _;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use daminus_core::checks::bundle::{BundleVars, Selection, build};
use daminus_core::checks::manifest;
use daminus_core::checks::ndjson::{self, HostOutput};
use daminus_core::domain::fact::CheckFact;
use daminus_core::domain::severity::UnknownReason;

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn shims() -> PathBuf {
    repo().join("scripts/check-harness/bin")
}

/// Writes an executable `name` in `dir`.
fn tool(dir: &Path, name: &str, body: &str) {
    let p = dir.join(name);
    std::fs::write(&p, format!("#!/bin/sh\n{body}")).unwrap();
    std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
}

/// Runs the bundle with only `id`, `vars` set, `path` dirs first on PATH
/// and `env` added. Fails the test if a canary reaches stdout.
fn run(id: &str, vars: &[(&str, &str)], path: &[&Path], env: &[(&str, &str)]) -> Vec<CheckFact> {
    let only = Selection {
        only: Some(BTreeSet::from([id.to_owned()])),
        ..Selection::default()
    };
    let mut v = BundleVars::new();
    for (k, val) in vars {
        v.set(k, *val).unwrap();
    }
    let bundle = build(&manifest().unwrap(), &only, &v).unwrap();
    let mut search: Vec<String> = path.iter().map(|p| p.display().to_string()).collect();
    search.push(std::env::var("PATH").unwrap_or_default());
    let mut cmd = Command::new("sh");
    cmd.arg("-s")
        .env("PATH", search.join(":"))
        .env("HARNESS_OUT", repo().join("scripts/check-harness/out"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, val) in env {
        cmd.env(k, val);
    }
    let mut child = cmd.spawn().unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(bundle.text.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.stderr.is_empty(), "stderr must stay on the server");
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(!text.contains("CANARY"), "a canary leaked:\n{text}");
    let parsed: HostOutput = ndjson::parse_for(&bundle, &out.stdout);
    assert!(parsed.ended && parsed.dropped == 0, "not clean v1:\n{text}");
    parsed.facts
}

fn by_target<'a>(facts: &'a [CheckFact], target: &str) -> &'a CheckFact {
    facts
        .iter()
        .find(|f| f.target == target)
        .unwrap_or_else(|| panic!("no fact for {target:?} in {facts:?}"))
}

/// Whether this process can read a folder whose mode is 000 (root).
fn is_root(tmp: &Path) -> bool {
    let d = tmp.join("probe-root");
    std::fs::create_dir(&d).unwrap();
    std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o000)).unwrap();
    let root = std::fs::read_dir(&d).is_ok();
    std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o755)).unwrap();
    root
}

/// A stand-in for a pm2 daemon: a process whose command line carries the
/// title pm2 gives its daemon, `PM2 vX: God Daemon (PM2_HOME)`. Runs in its
/// own process group so `sh -c "sleep 600; :"` and the `sleep` it forks die
/// together on drop: killing only the wrapping `sh` (its `Child::id`) leaves
/// `sleep` running, reparented to init but still in the *caller's* process
/// group and still holding this test binary's stdout open, which is what
/// hung `cargo test` for the rest of the 600 s once every test had already
/// reported green. Killed on drop.
struct Daemon(std::process::Child);

impl Daemon {
    fn start(home: &Path) -> Self {
        use std::os::unix::process::CommandExt as _;
        let child = Command::new("sh")
            .args(["-c", "sleep 600; :"])
            .arg(format!("PM2 v5.4.2: God Daemon ({})", home.display()))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0)
            .spawn()
            .unwrap();
        Self(child)
    }

    fn pgid(&self) -> nix::unistd::Pid {
        nix::unistd::Pid::from_raw(i32::try_from(self.0.id()).unwrap())
    }
}

impl Drop for Daemon {
    fn drop(&mut self) {
        let pgid = self.pgid();
        let _ = nix::sys::signal::killpg(pgid, nix::sys::signal::Signal::SIGKILL);
        let _ = self.0.wait();
        // Regression check for the leak above: poll until the whole group
        // (the `sh` and its `sleep`) is actually gone rather than trusting
        // that killing the group leader was enough.
        for _ in 0..50 {
            if nix::sys::signal::killpg(pgid, None).is_err() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        panic!("fake pm2 daemon (pgid {pgid}) outlived its test");
    }
}

/// A PM2_HOME whose pm2.pid (without a newline, as pm2 writes it) names
/// `pid`, with the sockets pm2 leaves there.
fn pm2_files(dir: &Path, pid: u32) {
    std::fs::create_dir_all(dir).unwrap();
    std::fs::write(dir.join("pm2.pid"), pid.to_string()).unwrap();
    std::fs::write(dir.join("rpc.sock"), "").unwrap();
    std::fs::write(dir.join("pub.sock"), "").unwrap();
}

/// A PM2_HOME with a running daemon.
fn pm2_home(dir: &Path) -> Daemon {
    let daemon = Daemon::start(dir);
    pm2_files(dir, daemon.0.id());
    daemon
}

/// A `pm2` in `bin` that logs each call's PM2_HOME to `calls` and prints the
/// recorded jlist, or for a PM2_HOME holding `other` a list with only
/// "worker" (stopped).
fn pm2_tool(bin: &Path, calls: &Path) {
    tool(
        bin,
        "pm2",
        &format!(
            "printf '%s\\n' \"$PM2_HOME\" >>'{}'\n\
             case $PM2_HOME in *other*) echo '[{{\"name\":\"worker\",\"pm_id\":9,\"pm2_env\":{{\"status\":\"stopped\",\"restart_time\":0,\"pm_uptime\":0}},\"monit\":{{\"memory\":0}}}}]'; exit 0 ;; esac\n\
             exec '{}' \"$@\"\n",
            calls.display(),
            shims().join("pm2").display()
        ),
    );
}

#[test]
fn pm2_reads_only_named_fields_and_never_wakes_a_daemon() {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path().join("home");
    let _own = pm2_home(&home.join(".pm2"));
    // Another daemon, named by an entry listed before apps of the default one.
    let other = tmp.path().join("other/.pm2");
    let _other = pm2_home(&other);
    // A PM2_HOME that exists but has no daemon: pm2 must not be run for it.
    let idle = tmp.path().join("idle/.pm2");
    std::fs::create_dir_all(&idle).unwrap();
    let closed = tmp.path().join("closed");
    let _closed = pm2_home(&closed.join(".pm2"));
    // The recorded jlist (with canaries), and a log of every call.
    let bin = tmp.path().join("bin");
    std::fs::create_dir(&bin).unwrap();
    let calls = tmp.path().join("calls");
    pm2_tool(&bin, &calls);
    let list = format!(
        "api\nworker\t{}\nqueue\ndeleted\nlost\t{}\nadmin\t{}",
        other.display(),
        idle.display(),
        closed.join(".pm2").display()
    );
    std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o000)).unwrap();
    let root = is_root(tmp.path());
    let facts = run(
        "pm2.app",
        &[("DAMINUS_PM2", &list)],
        &[&bin],
        &[("HOME", home.to_str().unwrap())],
    );
    std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o755)).unwrap();

    let api = by_target(&facts, "api");
    // A later "status" key in pm2_env (a merged env var) does not count.
    assert_eq!(api.data["status"], "online");
    assert_eq!(api.data["instances"], 2);
    assert_eq!(api.data["restarts"], 3);
    assert_eq!(api.data["mem_mb"], 212);
    assert_eq!(api.data["ids"], serde_json::json!([0, 1]));
    let worker = by_target(&facts, "worker");
    assert_eq!(worker.data["status"], "stopped");
    assert_eq!(worker.data["daemon"], true);
    // queue comes after worker's PM2_HOME and is still read from ~/.pm2.
    assert_eq!(by_target(&facts, "queue").data["status"], "errored");
    assert_eq!(
        by_target(&facts, "deleted").unknown,
        Some(UnknownReason::Missing)
    );
    let lost = by_target(&facts, "lost");
    assert_eq!(lost.data["status"], "stopped");
    assert_eq!(lost.data["daemon"], false);
    if !root {
        assert_eq!(
            by_target(&facts, "admin").unknown,
            Some(UnknownReason::NeedsPerm)
        );
    }
    // pm2 ran once per reachable daemon (not once per app), never for the
    // idle PM2_HOME.
    let log = std::fs::read_to_string(&calls).unwrap();
    let mut asked: Vec<&str> = log.lines().collect();
    let expected = [
        home.join(".pm2").display().to_string(),
        other.display().to_string(),
    ];
    if root {
        asked.retain(|l| !l.contains("closed"));
    }
    assert_eq!(asked, expected, "pm2 calls: {log}");
}

/// After a crash pm2.pid and the sockets stay behind and the pid may now be
/// another process: that is no daemon, and pm2 (which would start one) is
/// never called.
#[test]
fn pm2_stale_pid_of_another_process_is_no_daemon() {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path().join("home");
    // A live process that is not a pm2 daemon: this test.
    pm2_files(&home.join(".pm2"), std::process::id());
    // A pm2 daemon, but of another PM2_HOME.
    let elsewhere = pm2_home(&tmp.path().join("elsewhere/.pm2"));
    let second = tmp.path().join("second/.pm2");
    pm2_files(&second, elsewhere.0.id());
    let bin = tmp.path().join("bin");
    std::fs::create_dir(&bin).unwrap();
    let calls = tmp.path().join("calls");
    pm2_tool(&bin, &calls);
    let list = format!("api\nqueue\t{}", second.display());
    let facts = run(
        "pm2.app",
        &[("DAMINUS_PM2", &list)],
        &[&bin],
        &[("HOME", home.to_str().unwrap())],
    );
    for app in ["api", "queue"] {
        let f = by_target(&facts, app);
        assert_eq!(f.data["status"], "stopped", "{f:?}");
        assert_eq!(f.data["daemon"], false, "{f:?}");
    }
    assert!(!calls.exists(), "pm2 was called for a stale pid");
}

#[test]
fn pm2_home_that_does_not_exist_is_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let facts = run(
        "pm2.app",
        &[("DAMINUS_PM2", "api")],
        &[&shims()],
        &[("HOME", tmp.path().to_str().unwrap())],
    );
    assert_eq!(facts[0].unknown, Some(UnknownReason::Missing));
}

#[test]
fn compose_reads_named_fields_and_counts_states() {
    let facts = run(
        "docker.compose",
        &[("DAMINUS_COMPOSE", "shop\ngone")],
        &[&shims()],
        &[],
    );
    let shop = by_target(&facts, "shop");
    // The one-off `compose run` container is left out.
    assert_eq!(shop.data["containers"], 3);
    assert_eq!(shop.data["running"], 2);
    assert_eq!(shop.data["not_running"], 1);
    assert_eq!(shop.data["restarts"], 3);
    assert_eq!(shop.data["mem_pct"], 41.29);
    let db = &shop.data["services"][2];
    assert_eq!(db["name"], "shop-db-1");
    assert_eq!(db["oom"], true);
    assert_eq!(db["exit"], 137);
    assert_eq!(shop.data["services"][0]["mem"], 221_668_966);
    // A project with no container left is a result (containers 0), which
    // the manifest rates critical, not an unknown.
    let gone = by_target(&facts, "gone");
    assert_eq!(gone.unknown, None);
    assert_eq!(gone.data["containers"], 0);
    assert_eq!(gone.data["services"], serde_json::json!([]));
}

#[test]
fn docker_df_in_bytes() {
    let facts = run("docker.df", &[], &[&shims()], &[]);
    let f = &facts[0];
    assert_eq!(f.value, Some(5_922_400_000.0));
    assert_eq!(f.data["images"]["reclaimable"], 1_200_000_000_u64);
    assert_eq!(f.data["build_cache"]["count"], 18);
}

#[test]
fn docker_without_a_daemon() {
    let tmp = tempfile::tempdir().unwrap();
    tool(tmp.path(), "docker", "exit 1\n");
    let df = run("docker.df", &[], &[tmp.path()], &[]);
    let compose = run(
        "docker.compose",
        &[("DAMINUS_COMPOSE", "shop")],
        &[tmp.path()],
        &[],
    );
    // Missing, or NeedsPerm where a docker socket exists that this user may
    // not open: never a result, never a crash.
    for f in [&df[0], &compose[0]] {
        assert!(
            matches!(
                f.unknown,
                Some(UnknownReason::Missing | UnknownReason::NeedsPerm)
            ),
            "{f:?}"
        );
    }
}

/// journalctl as root or adm prints the kernel lines; as anyone else it
/// prints nothing, which must not read as "no kills".
#[test]
fn oom_counts_kills_and_needs_the_journal() {
    let tmp = tempfile::tempdir().unwrap();
    let bin = tmp.path();
    tool(
        bin,
        "journalctl",
        "[ -n \"$FAKE_EMPTY\" ] && exit 0\n\
         echo 'Out of memory: Killed process 4121 (php-fpm8.3) total-vm:812344kB'\n\
         echo 'oom-kill:constraint=CONSTRAINT_MEMCG,task=node,pid=5230'\n\
         echo 'Memory cgroup out of memory: Killed process 5230 (node) total-vm:1204112kB'\n\
         echo 'Memory cgroup out of memory: Killed process 5231 (node) total-vm:1204112kB'\n",
    );
    tool(
        bin,
        "id",
        "case $1 in -u) echo \"${FAKE_UID:-1000}\" ;; -Gn) echo \"${FAKE_GROUPS:-ops}\" ;; esac\n",
    );
    let facts = run("sys.oom", &[], &[bin], &[("FAKE_GROUPS", "ops adm")]);
    assert_eq!(facts[0].value, Some(3.0));
    assert_eq!(
        facts[0].data["procs"],
        serde_json::json!(["php-fpm8.3", "node"])
    );

    let facts = run("sys.oom", &[], &[bin], &[("FAKE_EMPTY", "1")]);
    assert_eq!(facts[0].unknown, Some(UnknownReason::NeedsPerm));

    let facts = run(
        "sys.oom",
        &[],
        &[bin],
        &[("FAKE_EMPTY", "1"), ("FAKE_UID", "0")],
    );
    assert_eq!(facts[0].value, Some(0.0));
}

#[test]
fn disk_path_sizes_folders_without_skip_paths() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    for d in ["src", "public/uploads", "node_modules/pkg", "storage/logs"] {
        std::fs::create_dir_all(app.join(d)).unwrap();
    }
    std::fs::write(app.join("public/uploads/big.bin"), vec![1_u8; 2 << 20]).unwrap();
    std::fs::write(app.join("node_modules/pkg/huge.bin"), vec![1_u8; 3 << 20]).unwrap();
    std::fs::write(app.join("src/a.php"), vec![1_u8; 64 << 10]).unwrap();
    let paths = format!("{}\n{}", app.display(), tmp.path().join("nope").display());
    let facts = run(
        "disk.path",
        &[
            ("DAMINUS_PATHS", &paths),
            ("DAMINUS_SKIP_PATHS", "node_modules\nstorage/logs"),
            ("DAMINUS_LARGE_FILE_MB", "1"),
        ],
        &[],
        &[],
    );
    let nope = by_target(&facts, tmp.path().join("nope").to_str().unwrap());
    assert_eq!(nope.unknown, Some(UnknownReason::Missing));
    let f = by_target(&facts, app.to_str().unwrap());
    if !cfg!(target_os = "linux") {
        // BSD du has no --exclude: the check says so instead of guessing.
        assert_eq!(f.unknown, Some(UnknownReason::Unsupported));
        return;
    }
    let top = f.data["top"].as_array().unwrap();
    assert_eq!(top[0][0], "public");
    assert!(top.iter().all(|t| t[0] != "node_modules"), "{top:?}");
    assert_eq!(
        f.data["files"],
        serde_json::json!([["public/uploads/big.bin", 2 << 20]])
    );
    assert!(
        f.value.unwrap() < f64::from(3 << 20),
        "node_modules not counted"
    );
    assert_eq!(f.data["partial"], false);
}

#[test]
fn big_logs_are_found_by_size_alone() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    std::fs::create_dir_all(app.join("storage/logs")).unwrap();
    let log = app.join("storage/logs/laravel.log");
    // Sparse: 600 MiB by size, nothing on disk.
    std::fs::File::create(&log)
        .unwrap()
        .set_len(600 << 20)
        .unwrap();
    let facts = run(
        "logs.big",
        &[("DAMINUS_PATHS", app.to_str().unwrap())],
        &[],
        &[],
    );
    if !cfg!(target_os = "linux") {
        // BSD find has no -printf; only the shape is checked here.
        assert!(!facts.is_empty());
        return;
    }
    let f = by_target(&facts, log.to_str().unwrap());
    assert_eq!(f.value, Some(f64::from(600_u32 << 20)));
}

/// A `date` in `dir` that gives the time the disk group began on its first
/// call and, from call `late` on, 100 s later: the group's allowance is spent.
fn clock(dir: &Path, late: u32) {
    let count = dir.join("count");
    tool(
        dir,
        "date",
        &format!(
            "n=$(cat '{c}' 2>/dev/null || echo 0)\n\
             echo $((n + 1)) >'{c}'\n\
             s=1000; [ \"$n\" -lt {late} ] || s=1100\n\
             case $1 in +%s%N) echo \"${{s}}000000000\" ;; *) echo \"$s\" ;; esac\n",
            c = count.display()
        ),
    );
}

/// The disk group shares one allowance: once it is spent the remaining
/// folders are timed out without running du or find, so a host with many
/// project folders still reaches the container checks within its budget.
#[test]
fn disk_group_stops_walking_when_its_time_is_spent() {
    let tmp = tempfile::tempdir().unwrap();
    let mut paths = Vec::new();
    for n in 0..4 {
        let p = tmp.path().join(format!("app{n}"));
        std::fs::create_dir_all(p.join("storage/logs")).unwrap();
        paths.push(p.display().to_string());
    }
    let list = paths.join("\n");
    let bin = tmp.path().join("bin");
    std::fs::create_dir(&bin).unwrap();
    let walks = tmp.path().join("walks");
    for cmd in ["du", "find"] {
        let real = String::from_utf8(
            Command::new("sh")
                .args(["-c", &format!("command -v {cmd}")])
                .output()
                .unwrap()
                .stdout,
        )
        .unwrap();
        tool(
            &bin,
            cmd,
            &format!(
                "echo {cmd} >>'{}'\nexec '{}' \"$@\"\n",
                walks.display(),
                real.trim()
            ),
        );
    }

    // Calls: d_group, then before du and before find of app0; the rest late.
    clock(&bin, 3);
    let started = std::time::Instant::now();
    let facts = run("disk.path", &[("DAMINUS_PATHS", &list)], &[&bin], &[]);
    assert!(started.elapsed() < std::time::Duration::from_secs(20));
    let first = by_target(&facts, &paths[0]);
    assert_ne!(first.unknown, Some(UnknownReason::Timeout), "{first:?}");
    for p in &paths[1..] {
        assert_eq!(by_target(&facts, p).unknown, Some(UnknownReason::Timeout));
    }
    let log = std::fs::read_to_string(&walks).unwrap_or_default();
    assert_eq!(log.matches("du").count(), 1, "{log}");

    // logs.big shares it: with the allowance spent before the first folder,
    // no folder is walked.
    std::fs::remove_file(&walks).ok();
    std::fs::remove_file(bin.join("count")).unwrap();
    clock(&bin, 1);
    let facts = run("logs.big", &[("DAMINUS_PATHS", &list)], &[&bin], &[]);
    for p in &paths {
        let dir = format!("{p}/storage/logs");
        assert_eq!(
            by_target(&facts, &dir).unknown,
            Some(UnknownReason::Timeout)
        );
    }
    assert!(
        !walks.exists(),
        "a folder was walked after the time was spent"
    );
}

/// What `db.size` did for one database component: its facts, and what the
/// fake client was handed (argv, the option file on stdin, PG* variables).
struct DbRun {
    facts: Vec<CheckFact>,
    argv: Option<String>,
    login: String,
    env: String,
    _tmp: tempfile::TempDir,
}

const DB_ROWS: &str = "0\t3\t3650722202\n1\torders\t2576980378\n1\tsessions\t188743680\n";

/// Runs `db.size` for a component `shop` whose env file holds `env_text`,
/// with a client that exits `exit` after printing `rows`.
fn db_run(engine: &str, env_text: &str, exit: i32, rows: &str) -> DbRun {
    let tmp = tempfile::tempdir().unwrap();
    let bin = tmp.path().join("bin");
    let log = tmp.path().join("log");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::create_dir_all(&log).unwrap();
    std::fs::write(tmp.path().join("rows"), rows).unwrap();
    std::fs::write(tmp.path().join(".env"), env_text).unwrap();
    let body = format!(
        "printf '%s\\n' \"$@\" >'{log}/argv'\n\
         cat >'{log}/login'\n\
         env | grep '^PG' | sort >'{log}/env'\n\
         cat '{rows}'\n\
         exit {exit}\n",
        log = log.display(),
        rows = tmp.path().join("rows").display()
    );
    tool(
        &bin,
        if engine == "mysql" { "mysql" } else { "psql" },
        &body,
    );
    let entry = format!("{engine}\tshop\t{}\t", tmp.path().join(".env").display());
    let facts = run(
        "db.size",
        &[("DAMINUS_DB", &entry)],
        &[&bin],
        &[("HOME", tmp.path().to_str().unwrap())],
    );
    let read = |n: &str| std::fs::read_to_string(log.join(n)).ok();
    DbRun {
        facts,
        argv: read("argv"),
        login: read("login").unwrap_or_default(),
        env: read("env").unwrap_or_default(),
        _tmp: tmp,
    }
}

fn mysql_login(user: &str, password: &str, extra: &str) -> String {
    format!("[client]\nuser=\"{user}\"\npassword=\"{password}\"\n{extra}")
}

/// The credentials are read from the file as text, in every notation the
/// reader knows, and reach the client only as an option file on stdin.
#[test]
fn db_reads_dotenv_text_and_hands_the_login_over_stdin_only() {
    let cases: &[(&str, &str)] = &[
        // export, CRLF, double quotes, a trailing comment, host and port.
        (
            "# DB_PASSWORD=old\r\nexport DB_USERNAME=\"app user\"\r\nDB_PASSWORD=\"CANARY p#ss w0rd\" # note\r\nDB_HOST=db.internal\r\nDB_PORT=3307\r\n",
            "[client]\nuser=\"app user\"\npassword=\"CANARY p#ss w0rd\"\nhost=db.internal\nport=3307\n",
        ),
        // Single quotes keep everything, and the option file escapes the rest.
        (
            "DB_USERNAME='app'\nDB_PASSWORD='CANARY\"b\\c$d `x` ;#'\n",
            "[client]\nuser=\"app\"\npassword=\"CANARY\\\"b\\\\c$d `x` ;#\"\n",
        ),
        // A bare `$` inside double quotes is a dollar sign.
        (
            "DB_USERNAME=app\nDB_PASSWORD=\"CANARY$x\"\n",
            "[client]\nuser=\"app\"\npassword=\"CANARY$x\"\n",
        ),
        // A bare value runs to a space and `#`; indented lines and tabs count.
        (
            "  DB_USERNAME=app\n\tDB_PASSWORD=CANARY#abc   # comment\n",
            "[client]\nuser=\"app\"\npassword=\"CANARY#abc\"\n",
        ),
        // The last assignment wins; an empty password is a password.
        (
            "DB_USERNAME=a\nDB_PASSWORD=CANARY_old\nDB_PASSWORD=CANARY_new\n",
            "[client]\nuser=\"a\"\npassword=\"CANARY_new\"\n",
        ),
        (
            "DB_USER=root\nDB_PASSWORD=\n",
            "[client]\nuser=\"root\"\npassword=\"\"\n",
        ),
        // No newline at the end of the file.
        (
            "DB_USERNAME=app\nDB_PASSWORD=CANARY_x",
            "[client]\nuser=\"app\"\npassword=\"CANARY_x\"\n",
        ),
        // The compose image's own names, and root as the fallback.
        (
            "MYSQL_USER=billing\nMYSQL_PASSWORD=CANARY_b\nMYSQL_HOST=10.0.0.4\n",
            "[client]\nuser=\"billing\"\npassword=\"CANARY_b\"\nhost=10.0.0.4\n",
        ),
        (
            "MYSQL_ROOT_PASSWORD=CANARY_r\n",
            "[client]\nuser=\"root\"\npassword=\"CANARY_r\"\n",
        ),
        // DB_* beat DATABASE_URL, which beats MYSQL_*.
        (
            "MYSQL_USER=m\nDATABASE_URL=mysql://u:CANARY_u@10.1.2.3:3307/shop\nDB_USERNAME=d\nDB_PASSWORD=CANARY_d\n",
            "[client]\nuser=\"d\"\npassword=\"CANARY_d\"\n",
        ),
        (
            "MYSQL_USER=m\nMYSQL_PASSWORD=CANARY_m\nDATABASE_URL=mysql://u:CANARY_u@10.1.2.3:3307/shop\n",
            "[client]\nuser=\"u\"\npassword=\"CANARY_u\"\nhost=10.1.2.3\nport=3307\n",
        ),
        (
            "DATABASE_URL=mariadb://u@db/shop\n",
            "[client]\nuser=\"u\"\npassword=\"\"\nhost=db\n",
        ),
    ];
    for (env, login) in cases {
        let r = db_run("mysql", env, 0, DB_ROWS);
        let f = by_target(&r.facts, "shop");
        assert_eq!(f.unknown, None, "{env:?}: {f:?}");
        assert_eq!(f.value, Some(3_650_722_202.0), "{env:?}");
        assert_eq!(r.login, *login, "{env:?}");
        // The query and the database are the only non-flag arguments.
        let argv = r.argv.unwrap();
        let args: Vec<&str> = argv.lines().collect();
        assert_eq!(
            args[..4],
            [
                "--defaults-extra-file=/dev/stdin",
                "--connect-timeout=10",
                "-N",
                "-B"
            ]
        );
        assert_eq!(args[4], "-e");
        assert!(args[5].starts_with("(SELECT 0, COUNT(*)"), "{args:?}");
        assert_eq!(args[6..], ["shop"]);
        assert!(!argv.contains("CANARY"), "a secret on argv: {argv}");
    }
}

/// Values in the file are data: nothing in them is run, and a notation the
/// reader cannot take as written is reported, not guessed.
#[test]
fn db_never_runs_the_env_file_and_refuses_notation_it_cannot_read() {
    let tmp = tempfile::tempdir().unwrap();
    let marker = tmp.path().join("pwned");
    let evil = format!(
        "DB_USERNAME=app\nDB_PASSWORD=$(touch {m})CANARY`touch {m}`\nDB_HOST=x\ntouch {m}\n. {m}\n",
        m = marker.display()
    );
    let evil = evil.replace("DB_HOST=x\n", "");
    let r = db_run("mysql", &evil, 0, DB_ROWS);
    assert_eq!(by_target(&r.facts, "shop").unknown, None);
    assert_eq!(
        r.login,
        mysql_login(
            "app",
            &format!("$(touch {m})CANARY`touch {m}`", m = marker.display()),
            ""
        )
    );
    assert!(!marker.exists(), "the env file was executed");

    let refused: &[&str] = &[
        // A backslash inside double quotes (an escape the reader does not decode).
        "DB_USERNAME=a\nDB_PASSWORD=\"CANARY\\\"x\"\n",
        // `${NAME}` inside double quotes is expanded by most dotenv readers.
        "DB_USERNAME=a\nDB_PASSWORD=\"CANARY${X}\"\n",
        // An unclosed quote.
        "DB_USERNAME=a\nDB_PASSWORD=\"CANARY\n",
        "DB_USERNAME=a\nDB_PASSWORD='CANARY\n",
        // No login at all, or a user without a source.
        "APP_KEY=base64:CANARY\n",
        "DB_PASSWORD=CANARY_only\n",
        "",
        // Not plain host or port.
        "DB_USERNAME=a\nDB_HOST=a;b\n",
        "DB_USERNAME=a\nDB_HOST=-oProxyCommand=x\n",
        "DB_USERNAME=a\nDB_PORT=33x\n",
        // URLs that are not the simple form.
        "DATABASE_URL=mysql://u:p%40ss@db/shop\n",
        "DATABASE_URL=mysql://u:p@db/shop?ssl=1\n",
        "DATABASE_URL=mysql://u:p@[::1]/shop\n",
        "DATABASE_URL=mysql://u:p@db/a/b\n",
        "DATABASE_URL=mysql://db/shop\n",
        "DATABASE_URL=sqlite:///x.db\n",
        "DATABASE_URL=postgresql://u:p@db/shop\n",
        "DATABASE_URL=redis://u:p@db/0\n",
    ];
    for env in refused {
        let r = db_run("mysql", env, 0, DB_ROWS);
        assert_eq!(
            by_target(&r.facts, "shop").unknown,
            Some(UnknownReason::Unsupported),
            "{env:?}"
        );
        assert!(r.argv.is_none(), "{env:?}: the client was run");
    }
}

#[test]
fn db_postgres_login_travels_in_the_environment_by_name() {
    let r = db_run(
        "postgres",
        "APP=x\nDATABASE_URL=postgresql://shop:CANARY_pg@10.0.0.9:5433/shop\n",
        0,
        "0\t2\t8379415\n1\tevents\t622592\n1\ttiny\t0\n",
    );
    let f = by_target(&r.facts, "shop");
    assert_eq!(f.value, Some(8_379_415.0));
    assert_eq!(f.data["engine"], "postgres");
    assert_eq!(f.data["tables"], 2);
    assert_eq!(
        f.data["top"],
        serde_json::json!([["events", 622_592], ["tiny", 0]])
    );
    assert_eq!(f.data["other"], 7_756_823);
    assert_eq!(
        r.env,
        "PGCONNECT_TIMEOUT=10\nPGHOST=10.0.0.9\nPGPASSWORD=CANARY_pg\nPGPORT=5433\nPGUSER=shop\n"
    );
    let argv = r.argv.unwrap();
    assert!(
        !argv.contains("CANARY") && !argv.contains("10.0.0.9"),
        "{argv}"
    );
    assert_eq!(
        argv.lines().take(7).collect::<Vec<_>>(),
        ["-X", "-w", "-A", "-t", "-F", "\t", "-d"]
    );
    // POSTGRES_* names; a password-less login.
    let r = db_run(
        "postgres",
        "POSTGRES_USER=app\nPOSTGRES_PASSWORD=CANARY_p\n",
        0,
        DB_ROWS,
    );
    assert_eq!(
        r.env,
        "PGCONNECT_TIMEOUT=10\nPGPASSWORD=CANARY_p\nPGUSER=app\n"
    );
    // The image's default user when only a password is set.
    let r = db_run("postgres", "POSTGRES_PASSWORD=CANARY_d\n", 0, DB_ROWS);
    assert_eq!(
        r.env,
        "PGCONNECT_TIMEOUT=10\nPGPASSWORD=CANARY_d\nPGUSER=postgres\n"
    );
    // A user without a password is not a login the reader guesses at.
    let r = db_run("postgres", "POSTGRES_DB=shop\n", 0, DB_ROWS);
    assert_eq!(
        by_target(&r.facts, "shop").unknown,
        Some(UnknownReason::Unsupported)
    );
    // A MySQL URL is not a Postgres login.
    let r = db_run("postgres", "DATABASE_URL=mysql://u:p@db/shop\n", 0, DB_ROWS);
    assert_eq!(
        by_target(&r.facts, "shop").unknown,
        Some(UnknownReason::Unsupported)
    );
}

#[test]
fn db_outcome_follows_the_exit_code_and_the_shape_of_the_rows() {
    let env = "DB_USERNAME=a\nDB_PASSWORD=CANARY_x\n";
    // A refused login, an unreachable server and a missing database all
    // exit non-zero: the reason is not read from any message.
    let r = db_run(
        "mysql",
        env,
        1,
        "ERROR 1045 (28000): Access denied for user 'a' CANARY_x\n",
    );
    assert_eq!(
        by_target(&r.facts, "shop").unknown,
        Some(UnknownReason::NeedsPerm)
    );
    let r = db_run("mysql", env, 124, "");
    assert_eq!(
        by_target(&r.facts, "shop").unknown,
        Some(UnknownReason::Timeout)
    );
    let r = db_run("mysql", env, 127, "");
    assert_eq!(
        by_target(&r.facts, "shop").unknown,
        Some(UnknownReason::Missing)
    );
    // Exit 0 with nothing usable.
    for rows in ["", "garbage\n", "1\torders\t5\n"] {
        let r = db_run("mysql", env, 0, rows);
        assert_eq!(
            by_target(&r.facts, "shop").unknown,
            Some(UnknownReason::Unsupported),
            "{rows:?}"
        );
    }
    // No tables: a size of 0. Noise lines and a seventh table are ignored;
    // a decimal sum from the server is rounded.
    let r = db_run("mysql", env, 0, "0\t0\t0\n");
    let f = by_target(&r.facts, "shop");
    assert_eq!(f.value, Some(0.0));
    assert_eq!(f.data["top"], serde_json::json!([]));
    let rows = "0\t7\t1000.0\nnote\n1\ta\t500\n1\tb\t200\n1\tc\t100\n1\td\t50\n1\te\t25\n1\tf\t10\n1\tg b\t5\n";
    let r = db_run("mysql", env, 0, rows);
    let f = by_target(&r.facts, "shop");
    assert_eq!(f.value, Some(1000.0));
    assert_eq!(f.data["tables"], 7);
    assert_eq!(f.data["top"].as_array().unwrap().len(), 5);
    assert_eq!(f.data["other"], 125);
}

#[test]
fn db_env_file_that_is_absent_or_closed() {
    let tmp = tempfile::tempdir().unwrap();
    let bin = tmp.path().join("bin");
    std::fs::create_dir(&bin).unwrap();
    tool(&bin, "mysql", "cat >/dev/null\nexit 0\n");
    let closed = tmp.path().join("closed");
    std::fs::create_dir(&closed).unwrap();
    std::fs::write(closed.join(".env"), "DB_USERNAME=a\n").unwrap();
    let unreadable = tmp.path().join("unreadable.env");
    std::fs::write(&unreadable, "DB_USERNAME=a\n").unwrap();
    std::fs::set_permissions(&unreadable, std::fs::Permissions::from_mode(0o000)).unwrap();
    std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o000)).unwrap();
    let root = is_root(tmp.path());
    let list = format!(
        "mysql\tgone\t{}\t\nmysql\tnoread\t{}\t\nmysql\tclosed\t{}\t\nmysql\t-oops\t/x\t\nmysql\tshop\t/x\t-c\nmysql\tshop2\t/x\tbad name",
        tmp.path().join("nope.env").display(),
        unreadable.display(),
        closed.join(".env").display(),
    );
    let facts = run("db.size", &[("DAMINUS_DB", &list)], &[&bin], &[]);
    std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::set_permissions(&unreadable, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert_eq!(
        by_target(&facts, "gone").unknown,
        Some(UnknownReason::Missing)
    );
    if !root {
        for t in ["noread", "closed"] {
            assert_eq!(
                by_target(&facts, t).unknown,
                Some(UnknownReason::NeedsPerm),
                "{t}"
            );
        }
    }
    // Names that could be read as options are refused before anything runs.
    for t in ["-oops", "shop", "shop2"] {
        assert_eq!(
            by_target(&facts, t).unknown,
            Some(UnknownReason::Unsupported),
            "{t}"
        );
    }
    // Without any database component the check says nothing.
    assert!(run("db.size", &[("DAMINUS_DB", "")], &[&bin], &[]).is_empty());
}

/// Through the container: `docker exec` names the variables without values,
/// the login goes in on stdin, and the harness' recorded rows come back.
#[test]
fn db_in_a_container_goes_through_docker_exec() {
    let tmp = tempfile::tempdir().unwrap();
    let mysql_env = tmp.path().join("mysql.env");
    std::fs::write(
        &mysql_env,
        "MYSQL_USER=billing\r\nMYSQL_PASSWORD=CANARY_dotenv_billing_pw_2b6d\r\n",
    )
    .unwrap();
    let host_env = tmp.path().join("host.env");
    std::fs::write(
        &host_env,
        "DB_USERNAME=shop\nDB_PASSWORD=CANARY_dotenv_db_password_5e8f\n",
    )
    .unwrap();
    let list = format!(
        "mysql\tbilling\t{}\tshop-db-1\nmysql\tother\t{}\tmissing-1\nmysql\tmine\t{}\t\n",
        mysql_env.display(),
        mysql_env.display(),
        host_env.display()
    );
    // The container is the one the docker shim knows.
    let facts = run("db.size", &[("DAMINUS_DB", &list)], &[&shims()], &[]);
    let billing = by_target(&facts, "billing");
    // The shim's server in the container holds other sizes than the host's.
    assert_eq!(billing.value, Some(900_000_000.0), "{billing:?}");
    assert_eq!(billing.data["tables"], 5);
    // A container the host does not have: docker exec fails.
    assert_eq!(
        by_target(&facts, "other").unknown,
        Some(UnknownReason::NeedsPerm)
    );
    // The same login through a client on the host reaches the host's server.
    assert_eq!(by_target(&facts, "mine").value, Some(3_650_722_202.0));
}

/// The database group shares one allowance like the disk group: once it is
/// spent, the remaining databases are timed out without running a client.
#[test]
fn db_group_stops_when_its_time_is_spent() {
    let tmp = tempfile::tempdir().unwrap();
    let bin = tmp.path().join("bin");
    std::fs::create_dir(&bin).unwrap();
    let calls = tmp.path().join("calls");
    std::fs::write(tmp.path().join("rows"), DB_ROWS).unwrap();
    tool(
        &bin,
        "mysql",
        &format!(
            "cat >/dev/null\necho x >>'{}'\ncat '{}'\n",
            calls.display(),
            tmp.path().join("rows").display()
        ),
    );
    let env = tmp.path().join(".env");
    std::fs::write(&env, "DB_USERNAME=a\nDB_PASSWORD=CANARY_x\n").unwrap();
    let list = ["a", "b", "c"]
        .iter()
        .map(|d| format!("mysql\t{d}\t{}\t", env.display()))
        .collect::<Vec<_>>()
        .join("\n");
    // Calls of date: d_group, then the allowance check before each database;
    // from the third call on it is 100 s later.
    clock(&bin, 2);
    let facts = run("db.size", &[("DAMINUS_DB", &list)], &[&bin], &[]);
    assert_eq!(by_target(&facts, "a").unknown, None, "{facts:?}");
    for t in ["b", "c"] {
        assert_eq!(by_target(&facts, t).unknown, Some(UnknownReason::Timeout));
    }
    assert_eq!(std::fs::read_to_string(&calls).unwrap().lines().count(), 1);
}

/// The group allowance bounds every docker call, not only the start of each
/// database: once it is spent after the daemon check, no container is asked
/// anything, and the daemon is asked once for all of them.
#[test]
fn db_group_allowance_bounds_the_docker_calls() {
    let tmp = tempfile::tempdir().unwrap();
    let bin = tmp.path().join("bin");
    std::fs::create_dir(&bin).unwrap();
    let calls = tmp.path().join("calls");
    tool(
        &bin,
        "docker",
        &format!("echo \"$1\" >>'{}'\nexit 0\n", calls.display()),
    );
    let env = tmp.path().join(".env");
    std::fs::write(&env, "MYSQL_USER=a\nMYSQL_PASSWORD=CANARY_x\n").unwrap();
    let list = ["a", "b", "c"]
        .iter()
        .map(|d| format!("mysql\t{d}\t{}\tc-{d}", env.display()))
        .collect::<Vec<_>>()
        .join("\n");
    // Calls of date: d_group, the allowance check before the daemon question,
    // and from the third call on it is 100 s later.
    clock(&bin, 2);
    let facts = run("db.size", &[("DAMINUS_DB", &list)], &[&bin], &[]);
    for t in ["a", "b", "c"] {
        assert_eq!(
            by_target(&facts, t).unknown,
            Some(UnknownReason::Timeout),
            "{t}: {facts:?}"
        );
    }
    assert_eq!(
        std::fs::read_to_string(&calls).unwrap(),
        "version\n",
        "only the daemon question was asked, and once"
    );
}

// ------------------------------------------------------------------ security

/// Whether find supports what the security checks need (GNU find). Elsewhere
/// they say `unsupported` rather than call an unread folder clean.
fn gnu_find() -> bool {
    cfg!(target_os = "linux")
}

/// `size:mtime:sha12`.
fn is_fingerprint(fp: &str) -> bool {
    let parts: Vec<&str> = fp.split(':').collect();
    parts.len() == 3
        && parts[0].bytes().all(|b| b.is_ascii_digit())
        && !parts[0].is_empty()
        && parts[1].bytes().all(|b| b.is_ascii_digit())
        && !parts[1].is_empty()
        && parts[2].len() == 12
        && parts[2].bytes().all(|b| b.is_ascii_hexdigit())
}

/// The first 12 hex digits of the SHA-256 of `bytes`, from the system tool.
fn sha12_of(bytes: &[u8]) -> String {
    let mut child = Command::new("sha256sum")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(bytes).unwrap();
    let out = child.wait_with_output().unwrap();
    String::from_utf8(out.stdout).unwrap()[..12].to_owned()
}

fn touch_age(path: &Path, days: u64) {
    let f = std::fs::OpenOptions::new().write(true).open(path).unwrap();
    f.set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(days * 86_400))
        .unwrap();
}

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn executable(path: &Path, text: &str) {
    write(path, text);
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
}

#[test]
fn preload_names_the_libraries_and_empty_means_clean() {
    let tmp = tempfile::tempdir().unwrap();
    let file = tmp.path().join("ld.so.preload");
    let var = |f: &Path| [("DAMINUS_PRELOAD_FILE", f.to_str().unwrap().to_owned())];
    let facts = |f: &Path| {
        let v = var(f);
        run("sec.preload", &[(v[0].0, &v[0].1)], &[], &[])
    };

    // No file, an empty file, white space only.
    for text in [None, Some(""), Some(" \n\t\n  \n")] {
        if let Some(t) = text {
            write(&file, t);
        }
        let f = &facts(&file)[0];
        assert_eq!(
            (f.target.as_str(), f.value),
            ("", Some(0.0)),
            "{text:?}: {f:?}"
        );
        assert_eq!(f.fp, None);
    }

    // Libraries separated by white space, colons and lines; the first five are named.
    write(
        &file,
        "/lib/a.so:/lib/b.so  /lib/c.so\n\n/lib/d.so\n/lib/e.so /lib/f.so CANARY_x\n",
    );
    let all = facts(&file);
    let f = &all[0];
    assert_eq!(f.target, file.to_str().unwrap());
    assert_eq!(
        f.value, None,
        "a finding has no value, so it cannot read as zero"
    );
    assert_eq!(f.data["entries"], 7);
    assert_eq!(
        f.data["libs"],
        serde_json::json!([
            "/lib/a.so",
            "/lib/b.so",
            "/lib/c.so",
            "/lib/d.so",
            "/lib/e.so"
        ])
    );
    if gnu_find() {
        assert_eq!(
            f.data["size"].as_u64().unwrap(),
            std::fs::metadata(&file).unwrap().len()
        );
    }
    assert!(is_fingerprint(f.fp.as_deref().unwrap()), "{f:?}");
    // The fingerprint follows the content.
    write(&file, "/lib/other.so\n");
    assert_ne!(facts(&file)[0].fp, f.fp);

    // A file that is there but closed.
    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o000)).unwrap();
    let closed = facts(&file);
    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
    if !is_root(tmp.path()) {
        assert_eq!(closed[0].unknown, Some(UnknownReason::NeedsPerm));
    }
}

#[test]
fn tmp_exec_lists_executables_newest_first_and_caps_them() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b, empty) = (
        tmp.path().join("a"),
        tmp.path().join("b"),
        tmp.path().join("empty"),
    );
    std::fs::create_dir(&empty).unwrap();
    let dirs = format!(
        "{}\n{}\n{}\n{}",
        a.display(),
        tmp.path().join("missing").display(),
        b.display(),
        empty.display()
    );
    let var = |d: &str| run("sec.tmp_exec", &[("DAMINUS_TMP_DIRS", d)], &[], &[]);

    if !gnu_find() {
        assert_eq!(var(&dirs)[0].unknown, Some(UnknownReason::Unsupported));
        return;
    }
    // Only an empty folder: looked, found none.
    let f = &var(empty.to_str().unwrap())[0];
    assert_eq!((f.target.as_str(), f.value), ("", Some(0.0)));

    executable(&a.join("dropper"), "#!/bin/sh\n# CANARY_dropper_body\n");
    executable(&a.join("deep/er/still/more/too/deep"), "x");
    executable(&a.join("1/2/3/limit"), "x");
    write(&a.join("notes.txt"), "not executable");
    executable(&b.join(".hidden"), "x");
    touch_age(&a.join("dropper"), 3);
    touch_age(&a.join("1/2/3/limit"), 1);
    let facts = var(&dirs);
    let targets: Vec<&str> = facts.iter().map(|f| f.target.as_str()).collect();
    // Depth 4 below the folder is searched, depth 5 is not; newest first.
    assert_eq!(
        targets,
        [
            b.join(".hidden").to_str().unwrap(),
            a.join("1/2/3/limit").to_str().unwrap(),
            a.join("dropper").to_str().unwrap(),
        ],
        "{facts:?}"
    );
    let dropper = by_target(&facts, a.join("dropper").to_str().unwrap());
    assert_eq!(dropper.value, None);
    assert_eq!(dropper.data["total"], 3);
    assert_eq!(dropper.data["size"], 32);
    let fp = dropper.fp.as_deref().unwrap();
    assert!(is_fingerprint(fp), "{fp}");
    assert_eq!(
        fp.rsplit(':').next().unwrap(),
        sha12_of(b"#!/bin/sh\n# CANARY_dropper_body\n")
    );
    let mtime = std::fs::metadata(a.join("dropper"))
        .unwrap()
        .modified()
        .unwrap();
    assert_eq!(
        dropper.data["mtime"].as_u64().unwrap(),
        mtime
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    );

    // A pile: the 50 newest are listed, the count says how many there are.
    for n in 0..60 {
        executable(&empty.join(format!("f{n:02}")), "x");
        touch_age(&empty.join(format!("f{n:02}")), 60 - n);
    }
    let facts = var(empty.to_str().unwrap());
    assert_eq!(facts.len(), 50);
    assert!(facts.iter().all(|f| f.data["total"] == 60));
    assert!(facts[0].target.ends_with("f59") && facts[49].target.ends_with("f10"));

    // A folder the user cannot enter.
    let closed = tmp.path().join("closed");
    std::fs::create_dir(&closed).unwrap();
    std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o000)).unwrap();
    let facts = var(closed.to_str().unwrap());
    std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o755)).unwrap();
    if !is_root(tmp.path()) {
        assert_eq!(facts[0].unknown, Some(UnknownReason::NeedsPerm));
        assert_eq!(facts[0].target, closed.to_str().unwrap());
    }
}

#[test]
fn upload_php_finds_php_in_uploads_and_public_storage_only() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let clean = tmp.path().join("clean");
    let code = "<?php echo 1; // CANARY_webshell\n";
    for f in [
        "public/uploads/a.php",
        "public/uploads/B.PHP",
        "public/uploads/2026/05/c.phtml",
        "public/uploads/e.php5",
        "storage/app/public/x/shell.php",
        "wp-content/uploads/index.php",
    ] {
        write(&app.join(f), code);
    }
    // Not PHP, not in an uploads folder, or skipped.
    for f in [
        "public/uploads/photo.jpg",
        "public/uploads/readme.php.txt",
        "src/Controller.php",
        "storage/app/private/secret.php",
        "vendor/pkg/uploads/lib.php",
        "node_modules/x/uploads/y.php",
    ] {
        write(&app.join(f), code);
    }
    write(&clean.join("public/uploads/pic.png"), "png");
    let paths = format!(
        "{}\n{}\n{}",
        app.display(),
        clean.display(),
        tmp.path().join("nope").display()
    );
    let var = |paths: &str, skip: &str| {
        run(
            "sec.upload_php",
            &[("DAMINUS_PATHS", paths), ("DAMINUS_SKIP_PATHS", skip)],
            &[],
            &[],
        )
    };
    if !gnu_find() {
        assert_eq!(var(&paths, "")[0].unknown, Some(UnknownReason::Unsupported));
        return;
    }
    let facts = var(&paths, "vendor\nnode_modules");
    let mut targets: Vec<String> = facts
        .iter()
        .filter(|f| f.value.is_none() && f.unknown.is_none())
        .map(|f| {
            f.target
                .strip_prefix(app.to_str().unwrap())
                .unwrap()
                .to_owned()
        })
        .collect();
    targets.sort();
    assert_eq!(
        targets,
        [
            "/public/uploads/2026/05/c.phtml",
            "/public/uploads/B.PHP",
            "/public/uploads/a.php",
            "/public/uploads/e.php5",
            "/storage/app/public/x/shell.php",
            "/wp-content/uploads/index.php",
        ]
    );
    let shell = by_target(&facts, app.join("public/uploads/a.php").to_str().unwrap());
    assert_eq!(shell.data["total"], 6);
    let fp = shell.fp.as_deref().unwrap();
    assert!(is_fingerprint(fp), "{fp}");
    assert_eq!(fp.rsplit(':').next().unwrap(), sha12_of(code.as_bytes()));
    assert!(fp.starts_with(&format!("{}:", code.len())));
    // A folder with none says so, and one that is not there is missing.
    let ok = by_target(&facts, clean.to_str().unwrap());
    assert_eq!(ok.value, Some(0.0));
    assert_eq!(
        by_target(&facts, tmp.path().join("nope").to_str().unwrap()).unknown,
        Some(UnknownReason::Missing)
    );
    // Without the skip paths the vendor and node_modules uploads count too.
    let all = var(app.to_str().unwrap(), "");
    assert_eq!(all.len(), 8);

    // A pile of 60: the 50 newest.
    for n in 0..60 {
        write(&clean.join(format!("public/uploads/s{n:02}.php")), code);
        touch_age(&clean.join(format!("public/uploads/s{n:02}.php")), 60 - n);
    }
    let facts = var(clean.to_str().unwrap(), "");
    assert_eq!(facts.len(), 50);
    assert!(facts.iter().all(|f| f.data["total"] == 60));
    assert!(facts[0].target.ends_with("s59.php"));
}

#[test]
fn upload_php_empty_files_and_closed_folders() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    write(&app.join("uploads/empty.php"), "");
    let closed = tmp.path().join("closed");
    std::fs::create_dir(&closed).unwrap();
    std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o000)).unwrap();
    let paths = format!("{}\n{}", app.display(), closed.display());
    let facts = run("sec.upload_php", &[("DAMINUS_PATHS", &paths)], &[], &[]);
    std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o755)).unwrap();
    if !gnu_find() {
        return;
    }
    // A zero-byte file is a finding, not "looked, found none".
    let f = by_target(&facts, app.join("uploads/empty.php").to_str().unwrap());
    assert_eq!(f.value, None);
    assert_eq!(f.data["size"], 0);
    if !is_root(tmp.path()) {
        assert_eq!(
            by_target(&facts, closed.to_str().unwrap()).unknown,
            Some(UnknownReason::NeedsPerm)
        );
    }
}

#[test]
fn recent_change_counts_code_files_changed_in_three_days() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let other = tmp.path().join("other");
    for f in [
        "src/a.php",
        "src/b.js",
        "public/index.html",
        ".htaccess",
        "app/c.vue",
        "generated/g.php",
    ] {
        write(&app.join(f), "code");
    }
    // Old, not code, or in a folder the check leaves out.
    for f in [
        "src/old.php",
        "notes.txt",
        "logo.png",
        "vendor/v.php",
        "node_modules/n.js",
        "storage/logs/s.php",
        ".git/hooks/h.sh",
        "src/vendor/deep.php",
    ] {
        write(&app.join(f), "code");
    }
    touch_age(&app.join("src/old.php"), 10);
    touch_age(&app.join("src/a.php"), 2);
    touch_age(&app.join("src/b.js"), 1);
    write(&other.join("x.py"), "code");
    touch_age(&other.join("x.py"), 40);
    let paths = format!(
        "{}\n{}\n{}",
        app.display(),
        other.display(),
        tmp.path().join("nope").display()
    );
    let var = |paths: &str, skip: &str| {
        run(
            "sec.recent_change",
            &[("DAMINUS_PATHS", paths), ("DAMINUS_SKIP_PATHS", skip)],
            &[],
            &[],
        )
    };
    if !gnu_find() {
        assert_eq!(var(&paths, "")[0].unknown, Some(UnknownReason::Unsupported));
        return;
    }
    let facts = var(&paths, "generated");
    let f = by_target(&facts, app.to_str().unwrap());
    assert_eq!(
        (f.value, f.unit.as_deref()),
        (Some(5.0), Some("files")),
        "{f:?}"
    );
    let files: Vec<&str> = f.data["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e[0].as_str().unwrap())
        .collect();
    // Newest first, relative to the folder: the touched ones are the oldest.
    assert_eq!(files.len(), 5);
    assert_eq!(files[3], "src/b.js");
    assert_eq!(files[4], "src/a.php");
    let mut counted: Vec<&str> = files.clone();
    counted.sort_unstable();
    assert_eq!(
        counted,
        [
            ".htaccess",
            "app/c.vue",
            "public/index.html",
            "src/a.php",
            "src/b.js"
        ]
    );
    assert!(f.data["newest"].as_u64().unwrap() > 1_700_000_000);
    // The fingerprint is the hash of the sorted names.
    let want = sha12_of(format!("{}\n", counted.join("\n")).as_bytes());
    assert_eq!(f.fp.as_deref(), Some(want.as_str()), "{f:?}");
    // Editing a file again does not change it; a new file does.
    touch_age(&app.join("src/a.php"), 0);
    assert_eq!(
        by_target(&var(&paths, "generated"), app.to_str().unwrap()).fp,
        f.fp
    );
    write(&app.join("src/new.php"), "code");
    assert_ne!(
        by_target(&var(&paths, "generated"), app.to_str().unwrap()).fp,
        f.fp
    );
    // Nothing recent: a count of 0, no fingerprint.
    let quiet = by_target(&facts, other.to_str().unwrap());
    assert_eq!(quiet.value, Some(0.0));
    assert_eq!(quiet.data["files"], serde_json::json!([]));
    assert_eq!(quiet.fp, None);
    assert_eq!(
        by_target(&facts, tmp.path().join("nope").to_str().unwrap()).unknown,
        Some(UnknownReason::Missing)
    );
}

/// A line of /proc/net/tcp: `local` is `ADDR:PORT` in the kernel's hex, `st`
/// the socket state (`0A` listening).
fn tcp_line(n: u32, local: &str, st: &str, inode: u32) -> String {
    format!(
        "{n:4}: {local} 00000000:0000 {st} 00000000:00000000 00:00000000 00000000  1000        0 {inode} 1 0000000000000000 100 0 0 10 0\n"
    )
}

const TCP_HEADER: &str = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n";
const ANY4: &str = "00000000";
const ANY6: &str = "00000000000000000000000000000000";

#[test]
fn ports_reports_database_ports_open_to_every_address() {
    let tmp = tempfile::tempdir().unwrap();
    let proc = tmp.path().join("proc");
    let vars = |p: &Path| [("DAMINUS_PROC", p.to_str().unwrap().to_owned())];
    let facts = |p: &Path| {
        let v = vars(p);
        run("sec.ports", &[(v[0].0, &v[0].1)], &[], &[])
    };
    // No /proc/net/tcp (not Linux): the check cannot look.
    assert_eq!(facts(&proc)[0].unknown, Some(UnknownReason::Unsupported));

    // Listening: Redis (6379) on 0.0.0.0 and on ::, MySQL on loopback only,
    // MongoDB on :: , a web port, Postgres connected but not listening, and
    // Docker on ::1.
    let mut tcp = String::from(TCP_HEADER);
    tcp += &tcp_line(0, &format!("{ANY4}:18EB"), "0A", 111);
    tcp += &tcp_line(1, "0100007F:0CEA", "0A", 112);
    tcp += &tcp_line(2, &format!("{ANY4}:0050"), "0A", 113);
    tcp += &tcp_line(3, &format!("{ANY4}:1538"), "01", 114);
    write(&proc.join("net/tcp"), &tcp);
    let mut tcp6 = String::from(TCP_HEADER);
    tcp6 += &tcp_line(0, &format!("{ANY6}:18EB"), "0A", 211);
    tcp6 += &tcp_line(1, &format!("{ANY6}:6989"), "0A", 212);
    tcp6 += &tcp_line(2, "00000000000000000000000001000000:0947", "0A", 213);
    write(&proc.join("net/tcp6"), &tcp6);
    // The Redis socket (111) is held by process 7, whose command line and
    // environment hold canaries that must never be read into a fact.
    write(&proc.join("7/comm"), "redis-server\n");
    write(
        &proc.join("7/cmdline"),
        "redis-server\0--requirepass\0CANARY_redis_pw\0",
    );
    write(&proc.join("7/environ"), "CANARY_ENV=1\0");
    std::fs::create_dir_all(proc.join("7/fd")).unwrap();
    std::os::unix::fs::symlink("socket:[111]", proc.join("7/fd/3")).unwrap();
    std::os::unix::fs::symlink("/dev/null", proc.join("7/fd/0")).unwrap();
    // Another process holds an unrelated socket.
    write(&proc.join("8/comm"), "nginx\n");
    std::fs::create_dir_all(proc.join("8/fd")).unwrap();
    std::os::unix::fs::symlink("socket:[113]", proc.join("8/fd/9")).unwrap();

    let all = facts(&proc);
    if !gnu_find() {
        // Without GNU find the ports are still found; the holders are not.
        assert_eq!(by_target(&all, "6379").data["proc"], "");
        return;
    }
    let targets: Vec<&str> = all.iter().map(|f| f.target.as_str()).collect();
    assert_eq!(targets, ["6379", "27017"], "{all:?}");
    let redis = by_target(&all, "6379");
    assert_eq!(
        redis.data,
        serde_json::json!({"port": 6379, "proc": "redis-server"})
    );
    assert_eq!(redis.fp.as_deref(), Some("6379/redis-server"));
    assert_eq!(redis.value, None);
    // Nobody's process is visible for MongoDB: the port still counts.
    let mongo = by_target(&all, "27017");
    assert_eq!(mongo.data, serde_json::json!({"port": 27017, "proc": ""}));
    assert_eq!(mongo.fp.as_deref(), Some("27017/"));

    // Everything bound to loopback or not listening: looked, found none.
    write(
        &proc.join("net/tcp"),
        &(TCP_HEADER.to_owned() + &tcp_line(0, "0100007F:0CEA", "0A", 1)),
    );
    std::fs::remove_file(proc.join("net/tcp6")).unwrap();
    let none = &facts(&proc)[0];
    assert_eq!((none.target.as_str(), none.value), ("", Some(0.0)));
}

/// A fake /proc entry: `stat`, `comm`, an `exe` link (none when `exe` is
/// None, like another user's process or a kernel thread) and a command line
/// with a canary that must never reach the output.
fn process(proc: &Path, pid: u32, comm: &str, state: &str, flags: u64, exe: Option<&str>) {
    let dir = proc.join(pid.to_string());
    write(&dir.join("comm"), &format!("{comm}\n"));
    write(
        &dir.join("stat"),
        &format!(
            "{pid} ({comm}) {state} 1 {pid} {pid} 0 -1 {flags} 120 0 0 0 1 1 0 0 20 0 1 0 5 1000 50 18446744073709551615 1 1 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0\n"
        ),
    );
    write(
        &dir.join("cmdline"),
        &format!("{comm}\0--password\0CANARY_cmdline_{pid}\0"),
    );
    write(&dir.join("environ"), &format!("CANARY_environ_{pid}=1\0"));
    if let Some(exe) = exe {
        std::os::unix::fs::symlink(exe, dir.join("exe")).unwrap();
    }
}

const KTHREAD: u64 = 0x0020_0000;
const USER: u64 = 0x0040_0100;

fn miner_run(proc: &Path) -> Vec<CheckFact> {
    run(
        "sec.miner",
        &[("DAMINUS_PROC", proc.to_str().unwrap())],
        &[],
        &[],
    )
}

#[test]
fn miner_finds_known_names_and_executables_deleted_from_temp_folders() {
    let tmp = tempfile::tempdir().unwrap();
    let proc = tmp.path().join("proc");
    std::fs::create_dir_all(proc.join("self")).unwrap();
    if !gnu_find() {
        assert_eq!(
            miner_run(&proc)[0].unknown,
            Some(UnknownReason::Unsupported)
        );
        return;
    }
    process(
        &proc,
        1,
        "systemd",
        "S",
        USER,
        Some("/usr/lib/systemd/systemd"),
    );
    process(&proc, 2, "kthreadd", "S", KTHREAD | USER, None);
    process(&proc, 3, "ksoftirqd/0", "S", KTHREAD | USER, None);
    process(&proc, 10, "nginx", "S", USER, Some("/usr/sbin/nginx"));
    // An upgrade leaves the old binary deleted: not a miner.
    process(
        &proc,
        11,
        "nginx",
        "S",
        USER,
        Some("/usr/sbin/nginx (deleted)"),
    );
    process(
        &proc,
        12,
        "dockerd",
        "S",
        USER,
        Some("/opt/app/server (deleted)"),
    );
    // A known name, in any case, twice; a name with a space and a parenthesis.
    process(
        &proc,
        20,
        "XMRig",
        "S",
        USER,
        Some("/home/web/.cache/xmrig"),
    );
    process(
        &proc,
        21,
        "XMRig",
        "S",
        USER,
        Some("/home/web/.cache/xmrig"),
    );
    process(&proc, 22, "weird) name", "S", USER, Some("/usr/bin/weird"));
    // Running from a file that was deleted, in a temp folder or from memory.
    process(
        &proc,
        30,
        "kworker2",
        "S",
        USER,
        Some("/dev/shm/.k (deleted)"),
    );
    process(
        &proc,
        31,
        "agent",
        "S",
        USER,
        Some("/tmp/a b/agent (deleted)"),
    );
    process(
        &proc,
        32,
        "fileless",
        "S",
        USER,
        Some("/memfd:payload (deleted)"),
    );
    // A zombie has no executable and nothing to inspect.
    process(&proc, 40, "defunct", "Z", USER, None);
    // An executable path that tries to pass for the record of process 10.
    process(
        &proc,
        50,
        "forger",
        "S",
        USER,
        Some("/opt/x\nE\t/proc/10\t/dev/shm/z (deleted)"),
    );
    let facts = miner_run(&proc);
    let mut targets: Vec<&str> = facts.iter().map(|f| f.target.as_str()).collect();
    targets.sort_unstable();
    assert_eq!(
        targets,
        ["XMRig", "agent", "fileless", "kworker2"],
        "{facts:?}"
    );

    let xmrig = by_target(&facts, "XMRig");
    assert_eq!(xmrig.value, None);
    assert_eq!(xmrig.data["count"], 2);
    assert_eq!(xmrig.data["why"], "name");
    assert_eq!(xmrig.data["deleted"], false);
    assert_eq!(xmrig.data["exe"], "/home/web/.cache/xmrig");
    assert_eq!(xmrig.fp.as_deref(), Some("XMRig|/home/web/.cache/xmrig"));
    // Every process with a link was seen; the zombie and kernel threads are not counted.
    assert_eq!(
        (xmrig.data["seen"].as_u64(), xmrig.data["total"].as_u64()),
        (Some(11), Some(11))
    );
    let shm = by_target(&facts, "kworker2");
    assert_eq!(shm.data["why"], "deleted");
    assert_eq!(shm.data["deleted"], true);
    assert_eq!(shm.fp.as_deref(), Some("kworker2|/dev/shm/.k (deleted)"));
    assert_eq!(
        by_target(&facts, "agent").data["exe"],
        "/tmp/a b/agent (deleted)"
    );
    assert_eq!(by_target(&facts, "fileless").data["why"], "deleted");
}

#[test]
fn miner_not_seeing_every_process_is_never_ok() {
    let tmp = tempfile::tempdir().unwrap();
    let proc = tmp.path().join("proc");
    std::fs::create_dir_all(proc.join("self")).unwrap();
    if !gnu_find() {
        return;
    }
    // All seen, nothing found: ok, with the coverage.
    process(
        &proc,
        1,
        "systemd",
        "S",
        USER,
        Some("/usr/lib/systemd/systemd"),
    );
    process(&proc, 2, "kthreadd", "S", KTHREAD | USER, None);
    process(&proc, 10, "sshd", "S", USER, Some("/usr/sbin/sshd"));
    let f = &miner_run(&proc)[0];
    assert_eq!(
        (f.target.as_str(), f.value, f.unknown),
        ("", Some(0.0), None),
        "{f:?}"
    );
    assert_eq!(f.data, serde_json::json!({"seen": 2, "total": 2}));

    // Another user's processes: their executable cannot be read.
    for pid in 100..110 {
        process(&proc, pid, "postgres", "S", USER, None);
    }
    let f = &miner_run(&proc)[0];
    assert_eq!(f.unknown, Some(UnknownReason::NeedsPerm), "{f:?}");
    assert_eq!(f.value, None);
    assert_eq!(f.data, serde_json::json!({"seen": 2, "total": 12}));

    // A finding stands even when only some processes were seen, and carries the coverage.
    process(&proc, 200, "kinsing", "S", USER, None);
    let facts = miner_run(&proc);
    assert_eq!(facts.len(), 1);
    assert_eq!(facts[0].target, "kinsing");
    assert_eq!(facts[0].unknown, None);
    assert_eq!(facts[0].data["total"], 13);
    assert_eq!(facts[0].data["exe"], "");
    assert_eq!(facts[0].fp.as_deref(), Some("kinsing|"));
}

/// The real /proc of the machine running the tests: only the ids of the
/// processes, never a command line or an environment, ends up in the output.
#[test]
fn miner_on_the_real_proc_prints_no_command_line() {
    if !gnu_find() || !Path::new("/proc/self/stat").exists() {
        return;
    }
    // `run` fails the test if a CANARY value reaches stdout; this test's own
    // process carries one on its command line and in its environment.
    let mut child = Command::new("sleep")
        .arg("30")
        .env("CANARY_ENV_TOKEN", "CANARY_real_environ")
        .spawn()
        .unwrap();
    let facts = run("sec.miner", &[], &[], &[]);
    child.kill().unwrap();
    let _ = child.wait();
    let f = &facts[0];
    let seen = f.data["seen"].as_u64().unwrap();
    let total = f.data["total"].as_u64().unwrap();
    assert!(0 < seen && seen <= total, "{f:?}");
    assert!(
        f.unknown.is_none() || f.unknown == Some(UnknownReason::NeedsPerm),
        "{f:?}"
    );
}

/// File names are attacker-controlled text: quotes, backslashes, tabs and
/// newlines must neither break the JSON nor forge another finding.
#[test]
fn upload_php_survives_hostile_file_names() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let names = [
        "a\"b.php",
        "c\\d.php",
        "e\tf.php",
        "g\nfake.php",
        "h\n999\t1790000000\t/etc/passwd.php",
        "tiếng việt.php",
    ];
    for n in names {
        write(&app.join("uploads").join(n), "<?php");
    }
    let facts = run(
        "sec.upload_php",
        &[("DAMINUS_PATHS", app.to_str().unwrap())],
        &[],
        &[],
    );
    if !gnu_find() {
        return;
    }
    // The parse inside `run` already proved every line is valid NDJSON.
    let targets: Vec<&str> = facts.iter().map(|f| f.target.as_str()).collect();
    let up = app.join("uploads");
    let up = up.to_str().unwrap();
    for n in [
        "a\"b.php",
        "c\\d.php",
        "e\tf.php",
        "tiếng việt.php",
        // A newline in a name is shown as `?`: still one finding, not two.
        "g?fake.php",
        "h?999\t1790000000\t/etc/passwd.php",
    ] {
        let want = format!("{up}/{n}");
        assert!(
            targets.contains(&want.as_str()),
            "{n:?} missing from {targets:?}"
        );
    }
    assert_eq!(facts.len(), 6, "{targets:?}");
    // A name with a newline cannot make up a finding for a file that is not there.
    assert!(!targets.contains(&"/etc/passwd.php"), "{targets:?}");
    assert!(
        facts
            .iter()
            .all(|f| f.target.starts_with(app.to_str().unwrap()))
    );
}

/// The security group shares one allowance like the disk group: once it is
/// spent, the remaining project folders are timed out without a walk.
#[test]
fn security_group_stops_walking_when_its_time_is_spent() {
    if !gnu_find() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let mut paths = Vec::new();
    for n in 0..3 {
        let p = tmp.path().join(format!("app{n}"));
        std::fs::create_dir_all(p.join("uploads")).unwrap();
        paths.push(p.display().to_string());
    }
    let list = paths.join("\n");
    let bin = tmp.path().join("bin");
    std::fs::create_dir(&bin).unwrap();
    let walks = tmp.path().join("walks");
    let real = String::from_utf8(
        Command::new("sh")
            .args(["-c", "command -v find"])
            .output()
            .unwrap()
            .stdout,
    )
    .unwrap();
    tool(
        &bin,
        "find",
        &format!(
            "case \"$*\" in *uploads*) echo walk >>'{}' ;; esac\nexec '{}' \"$@\"\n",
            walks.display(),
            real.trim()
        ),
    );
    // Calls of date: d_group, the allowance before the first folder and
    // after its walk; from the fourth on it is 100 s later.
    clock(&bin, 3);
    let facts = run("sec.upload_php", &[("DAMINUS_PATHS", &list)], &[&bin], &[]);
    assert_eq!(by_target(&facts, &paths[0]).value, Some(0.0), "{facts:?}");
    for p in &paths[1..] {
        assert_eq!(by_target(&facts, p).unknown, Some(UnknownReason::Timeout));
    }
    let log = std::fs::read_to_string(&walks).unwrap_or_default();
    assert_eq!(log.matches("walk").count(), 1, "{log}");

    // A walk that used up the allowance is a timeout, not "found none".
    std::fs::remove_file(&walks).unwrap();
    std::fs::remove_file(bin.join("count")).unwrap();
    clock(&bin, 2);
    let facts = run("sec.upload_php", &[("DAMINUS_PATHS", &list)], &[&bin], &[]);
    for p in &paths {
        assert_eq!(by_target(&facts, p).unknown, Some(UnknownReason::Timeout));
    }
}
