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
    let list = format!(
        "mysql\tbilling\t{}\tshop-db-1\nmysql\tother\t{}\tmissing-1\nmysql\tmine\t{}\t\n",
        mysql_env.display(),
        mysql_env.display(),
        mysql_env.display()
    );
    // The container is the one the docker shim knows.
    let facts = run("db.size", &[("DAMINUS_DB", &list)], &[&shims()], &[]);
    let billing = by_target(&facts, "billing");
    assert_eq!(billing.value, Some(3_650_722_202.0), "{billing:?}");
    // A container the host does not have: docker exec fails.
    assert_eq!(
        by_target(&facts, "other").unknown,
        Some(UnknownReason::NeedsPerm)
    );
    // The same login through a client on the host.
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
