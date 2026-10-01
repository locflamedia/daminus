//! Static safety and sync checks for `crates/core/checks/` (CI job `shell`).
//!
//! 1. Allowlist: a small POSIX sh tokenizer finds every command each script
//!    runs. A command must be a safe builtin, a prelude or script function, or
//!    listed in the check's manifest `needs`. Output redirection may only go
//!    to `/dev/null` or another descriptor; `sed` may only substitute, `awk`
//!    may not write, pipe or run commands, `find` may not delete or exec.
//!    The grep deny-list in `scripts/check-harness/deny-list.sh` is the quick
//!    second layer; the read-only container run is the empirical third.
//! 2. Sync: every manifest id has en and vi strings, and every scripted check
//!    has golden NDJSON for each harness distro.

#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use daminus_core::checks::{PRELUDE, SCRIPTS, manifest, ndjson};

/// Builtins a check may use. Nothing here writes, execs or loads code.
const SAFE_BUILTINS: &[&str] = &[
    ":", "[", "test", "true", "false", "echo", "printf", "read", "return", "exit", "set", "shift",
    "unset", "export", "break", "continue", "cd", "getopts", "wait", "command",
];
/// Never allowed, even as a builtin.
const BANNED: &[&str] = &[
    ".", "source", "eval", "exec", "trap", "kill", "sudo", "su", "doas",
];
/// External commands the prelude itself uses.
const PRELUDE_NEEDS: &[&str] = &[
    "tr", "sed", "awk", "date", "nice", "ionice", "timeout", "docker", "ps",
];
/// Distros the harness runs, as directory names under `fixtures/ndjson/`.
const DISTROS: &[&str] = &["ubuntu-24.04", "debian-12"];

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

// ---------------------------------------------------------------- tokenizer

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    /// A word; `dynamic` when it holds an expansion (`$x`, `$(…)`).
    Word {
        text: String,
        dynamic: bool,
    },
    /// `;` `&&` `||` `|` `&` newline.
    Sep,
    /// `;;` in a case.
    CaseEnd,
    Open,
    Close,
    /// A redirection operator, e.g. `>`, `>>`, `<`, `>&`, `2>`.
    Redir(String),
}

struct Lexer<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
    /// Command substitutions found inside words, lexed on their own.
    nested: Vec<Vec<Tok>>,
    /// Quotes inside `${…}` or `$((…))`: where such a body ends depends on
    /// quoting rules this lexer does not model, so scripts may not use them.
    quoted_expansions: u32,
}

impl<'a> Lexer<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            chars: src.chars().peekable(),
            nested: Vec::new(),
            quoted_expansions: 0,
        }
    }

    /// Lexes until end of input or an unmatched `close` (for `$(…)`).
    fn run(&mut self, close: Option<char>) -> Vec<Tok> {
        let mut toks = Vec::new();
        let mut word = String::new();
        let mut dynamic = false;
        let mut in_word = false;
        let mut depth = 0_u32;
        let flush =
            |toks: &mut Vec<Tok>, word: &mut String, dynamic: &mut bool, in_word: &mut bool| {
                if *in_word {
                    toks.push(Tok::Word {
                        text: std::mem::take(word),
                        dynamic: *dynamic,
                    });
                }
                *dynamic = false;
                *in_word = false;
            };
        while let Some(c) = self.chars.next() {
            match c {
                ' ' | '\t' => flush(&mut toks, &mut word, &mut dynamic, &mut in_word),
                '\n' => {
                    flush(&mut toks, &mut word, &mut dynamic, &mut in_word);
                    toks.push(Tok::Sep);
                }
                '#' if !in_word => {
                    while self.chars.peek().is_some_and(|c| *c != '\n') {
                        self.chars.next();
                    }
                }
                '\\' => match self.chars.next() {
                    Some('\n') | None => {}
                    Some(e) => {
                        word.push(e);
                        in_word = true;
                    }
                },
                '\'' => {
                    in_word = true;
                    for q in self.chars.by_ref() {
                        if q == '\'' {
                            break;
                        }
                        word.push(q);
                    }
                }
                '"' => {
                    in_word = true;
                    self.double_quoted(&mut word, &mut dynamic);
                }
                '`' => {
                    in_word = true;
                    dynamic = true;
                    self.backtick();
                }
                '$' => {
                    in_word = true;
                    dynamic = true;
                    self.dollar(&mut word);
                }
                ';' => {
                    flush(&mut toks, &mut word, &mut dynamic, &mut in_word);
                    if self.chars.peek() == Some(&';') {
                        self.chars.next();
                        toks.push(Tok::CaseEnd);
                    } else {
                        toks.push(Tok::Sep);
                    }
                }
                '&' | '|' => {
                    flush(&mut toks, &mut word, &mut dynamic, &mut in_word);
                    if self.chars.peek() == Some(&c) {
                        self.chars.next();
                    }
                    toks.push(Tok::Sep);
                }
                '(' => {
                    flush(&mut toks, &mut word, &mut dynamic, &mut in_word);
                    depth += 1;
                    toks.push(Tok::Open);
                }
                ')' if close == Some(')') && depth == 0 => {
                    flush(&mut toks, &mut word, &mut dynamic, &mut in_word);
                    return toks;
                }
                ')' => {
                    flush(&mut toks, &mut word, &mut dynamic, &mut in_word);
                    depth = depth.saturating_sub(1);
                    toks.push(Tok::Close);
                }
                '<' | '>' => {
                    // A word of digits right before is the descriptor (`2>`).
                    let fd = in_word && !dynamic && word.chars().all(|d| d.is_ascii_digit());
                    let mut op = if fd {
                        std::mem::take(&mut word)
                    } else {
                        String::new()
                    };
                    if fd {
                        in_word = false;
                    } else {
                        flush(&mut toks, &mut word, &mut dynamic, &mut in_word);
                    }
                    op.push(c);
                    while let Some(n) = self.chars.peek().copied() {
                        if matches!(n, '>' | '<' | '&' | '|') {
                            op.push(n);
                            self.chars.next();
                        } else {
                            break;
                        }
                    }
                    toks.push(Tok::Redir(op));
                }
                _ => {
                    word.push(c);
                    in_word = true;
                }
            }
        }
        flush(&mut toks, &mut word, &mut dynamic, &mut in_word);
        toks
    }

    /// All top-level tokens plus every nested substitution, as separate lists,
    /// and the count of quoted `${…}` / `$((…))` bodies.
    fn all(mut self) -> (Vec<Vec<Tok>>, u32) {
        let top = self.run(None);
        let mut out = vec![top];
        out.append(&mut self.nested);
        (out, self.quoted_expansions)
    }

    /// After a backtick: lexes the old-style substitution up to the next one.
    fn backtick(&mut self) {
        let mut inner = String::new();
        for q in self.chars.by_ref() {
            if q == '`' {
                break;
            }
            inner.push(q);
        }
        let (toks, quoted) = Lexer::new(&inner).all();
        self.nested.extend(toks);
        self.quoted_expansions += quoted;
    }

    /// The body of `${…}` (after `{`, `depth` 1) or `$((…))` (after `((`,
    /// `depth` 2), up to its close. Text is skipped, but every `$(…)`,
    /// backtick, `${…}` and `$((…))` inside is lexed like one at top level.
    fn expansion_body(&mut self, open: char, close: char, mut depth: u32) {
        let mut scratch = String::new();
        while let Some(c) = self.chars.next() {
            match c {
                '\\' => {
                    self.chars.next();
                }
                '\'' | '"' => self.quoted_expansions += 1,
                '`' => self.backtick(),
                '$' => self.dollar(&mut scratch),
                c if c == open => depth += 1,
                c if c == close => {
                    depth -= 1;
                    if depth == 0 {
                        return;
                    }
                }
                _ => {}
            }
        }
    }

    fn double_quoted(&mut self, word: &mut String, dynamic: &mut bool) {
        while let Some(c) = self.chars.next() {
            match c {
                '"' => return,
                '\\' => {
                    if let Some(e) = self.chars.next() {
                        word.push(e);
                    }
                }
                '$' => {
                    *dynamic = true;
                    self.dollar(word);
                }
                '`' => {
                    *dynamic = true;
                    self.backtick();
                }
                _ => word.push(c),
            }
        }
    }

    /// After `$`: `$(( … ))`, `$( … )`, `${ … }` or a plain name.
    fn dollar(&mut self, word: &mut String) {
        word.push('$');
        match self.chars.peek().copied() {
            Some('(') => {
                self.chars.next();
                if self.chars.peek() == Some(&'(') {
                    self.chars.next();
                    self.expansion_body('(', ')', 2);
                } else {
                    let mut inner = Lexer {
                        chars: std::mem::replace(&mut self.chars, "".chars().peekable()),
                        nested: Vec::new(),
                        quoted_expansions: 0,
                    };
                    let toks = inner.run(Some(')'));
                    self.chars = inner.chars;
                    self.nested.push(toks);
                    self.nested.append(&mut inner.nested);
                    self.quoted_expansions += inner.quoted_expansions;
                }
            }
            Some('{') => {
                self.chars.next();
                self.expansion_body('{', '}', 1);
            }
            _ => {
                while let Some(c) = self.chars.peek().copied() {
                    if c.is_ascii_alphanumeric()
                        || matches!(c, '_' | '@' | '?' | '#' | '*' | '-' | '!')
                    {
                        word.push(c);
                        self.chars.next();
                    } else {
                        break;
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ parser

/// One simple command: its name and arguments as written.
#[derive(Debug)]
struct Cmd {
    name: String,
    dynamic: bool,
    args: Vec<String>,
}

struct Scan {
    cmds: Vec<Cmd>,
    functions: BTreeSet<String>,
    /// Output redirections to something other than `/dev/null` or `&N`.
    bad_redirects: Vec<String>,
    /// Quotes inside `${…}` or `$((…))` (see `Lexer::quoted_expansions`).
    quoted_expansions: u32,
}

fn is_assignment(w: &str) -> bool {
    let Some((name, _)) = w.split_once('=') else {
        return false;
    };
    !name.is_empty()
        && name.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn scan(src: &str) -> Scan {
    let mut out = Scan {
        cmds: Vec::new(),
        functions: BTreeSet::new(),
        bad_redirects: Vec::new(),
        quoted_expansions: 0,
    };
    let (lists, quoted) = Lexer::new(src).all();
    out.quoted_expansions = quoted;
    for toks in lists {
        parse(&toks, &mut out);
    }
    out
}

fn parse(toks: &[Tok], out: &mut Scan) {
    #[derive(PartialEq)]
    enum Mode {
        Start,
        Args,
        /// Inside `for …` or `case … in`, up to `do` / `in`.
        SkipTo(&'static str),
        /// A case pattern, up to `)`.
        Pattern,
    }
    let mut mode = Mode::Start;
    let mut i = 0;
    while i < toks.len() {
        let tok = &toks[i];
        i += 1;
        if let Tok::Redir(op) = tok {
            let target = match toks.get(i) {
                Some(Tok::Word { text, .. }) => {
                    i += 1;
                    text.clone()
                }
                _ => String::new(),
            };
            // `>&N` / `>&-` duplicate or close a descriptor; `>&word` is a
            // file in bash, which is `sh` on RHEL-family servers.
            let fd = |t: &str| t == "-" || (!t.is_empty() && t.chars().all(|c| c.is_ascii_digit()));
            let to_fd = if op.ends_with('&') {
                fd(&target)
            } else {
                target.strip_prefix('&').is_some_and(fd)
            };
            if op.contains('>') && !to_fd && target != "/dev/null" {
                out.bad_redirects.push(format!("{op}{target}"));
            }
            continue;
        }
        match &mode {
            Mode::SkipTo(until) => {
                if matches!(tok, Tok::Word { text, .. } if text == until) {
                    mode = if *until == "in" {
                        Mode::Pattern
                    } else {
                        Mode::Start
                    };
                }
                continue;
            }
            Mode::Pattern => {
                match tok {
                    Tok::Close => mode = Mode::Start,
                    Tok::Word { text, .. } if text == "esac" => mode = Mode::Args,
                    _ => {}
                }
                continue;
            }
            _ => {}
        }
        match tok {
            Tok::Sep | Tok::Open => mode = Mode::Start,
            Tok::Close => mode = Mode::Args,
            Tok::CaseEnd => mode = Mode::Pattern,
            Tok::Redir(_) => {}
            Tok::Word { text, dynamic } => {
                if mode == Mode::Args {
                    if let Some(cmd) = out.cmds.last_mut() {
                        cmd.args.push(text.clone());
                    }
                    continue;
                }
                match text.as_str() {
                    "if" | "then" | "else" | "elif" | "do" | "while" | "until" | "!" | "{" => {}
                    "fi" | "done" | "esac" | "}" => mode = Mode::Args,
                    "for" => mode = Mode::SkipTo("do"),
                    "case" => mode = Mode::SkipTo("in"),
                    w if is_assignment(w) => {}
                    w if !dynamic
                        && toks.get(i) == Some(&Tok::Open)
                        && toks.get(i + 1) == Some(&Tok::Close) =>
                    {
                        out.functions.insert(w.to_owned());
                        i += 2;
                        mode = Mode::Start;
                    }
                    w => {
                        out.cmds.push(Cmd {
                            name: w.to_owned(),
                            dynamic: *dynamic,
                            args: Vec::new(),
                        });
                        mode = Mode::Args;
                    }
                }
            }
        }
    }
}

// --------------------------------------------------------------- the rules

/// Every problem in one script; empty when it passes.
fn violations(
    file: &str,
    src: &str,
    needs: &[String],
    functions: &BTreeSet<String>,
) -> Vec<String> {
    let s = scan(src);
    let mut bad: Vec<String> = s
        .bad_redirects
        .iter()
        .map(|r| format!("{file}: writes with `{r}`"))
        .collect();
    if s.quoted_expansions > 0 {
        bad.push(format!("{file}: quotes inside `${{…}}` or `$((…))`"));
    }
    let known = |name: &str| {
        SAFE_BUILTINS.contains(&name)
            || functions.contains(name)
            || s.functions.contains(name)
            || needs.iter().any(|n| n == name)
    };
    let is_prelude = file == "prelude.sh";
    for cmd in &s.cmds {
        let name = cmd.name.as_str();
        if cmd.dynamic {
            // Only the prelude's run_light runs a command held in a variable.
            if !(is_prelude && name == "$_light") {
                bad.push(format!("{file}: dynamic command `{name}`"));
            }
            continue;
        }
        if BANNED.contains(&name) {
            let stderr_close = is_prelude && name == "exec" && cmd.args.is_empty();
            if !stderr_close {
                bad.push(format!("{file}: banned command `{name}`"));
            }
            continue;
        }
        if !known(name) {
            bad.push(format!(
                "{file}: `{name}` is not allowed (add it to the manifest `needs`?)"
            ));
        }
        let args = &cmd.args;
        match name {
            "run_light" => match args.first() {
                Some(inner) if needs.iter().any(|n| n == inner) => {}
                other => bad.push(format!("{file}: run_light of `{other:?}` not in needs")),
            },
            "command" if args.first().is_some_and(|a| a != "-v" && a != "-V") => {
                bad.push(format!("{file}: `command` may only look up (-v)"));
            }
            "sed" => bad.extend(
                sed_problems(args)
                    .into_iter()
                    .map(|p| format!("{file}: sed {p}")),
            ),
            "awk" => bad.extend(
                awk_problems(args)
                    .into_iter()
                    .map(|p| format!("{file}: awk {p}")),
            ),
            "find" => {
                for a in args {
                    if matches!(
                        a.as_str(),
                        "-delete"
                            | "-exec"
                            | "-execdir"
                            | "-ok"
                            | "-okdir"
                            | "-fprint"
                            | "-fprint0"
                            | "-fprintf"
                            | "-fls"
                    ) {
                        bad.push(format!("{file}: find {a}"));
                    }
                }
            }
            _ => {}
        }
    }
    bad
}

/// `sed` may only run `s/…/…/[g]` programs, never in place.
fn sed_problems(args: &[String]) -> Vec<String> {
    let mut bad = Vec::new();
    let mut expect_program = false;
    let mut had_e = false;
    for (n, a) in args.iter().enumerate() {
        if expect_program {
            expect_program = false;
            if !is_substitution(a) {
                bad.push(format!("program `{a}` is not a plain s/// substitution"));
            }
            continue;
        }
        match a.as_str() {
            "-e" => {
                expect_program = true;
                had_e = true;
            }
            "-n" | "-E" | "-r" => {}
            a if a.starts_with("-i") || a.starts_with("--in-place") => bad.push("-i".into()),
            a if a.starts_with('-') => bad.push(format!("flag {a}")),
            a if !had_e
                && n == args
                    .iter()
                    .position(|x| !x.starts_with('-'))
                    .unwrap_or(usize::MAX)
                && !is_substitution(a) =>
            {
                bad.push(format!("program `{a}` is not a plain s/// substitution"));
            }
            _ => {}
        }
    }
    bad
}

fn is_substitution(prog: &str) -> bool {
    let Some(rest) = prog.strip_prefix("s/") else {
        return false;
    };
    let mut parts = 0;
    let mut chars = rest.chars();
    let mut flags = String::new();
    while let Some(c) = chars.next() {
        if parts == 2 {
            flags.push(c);
            continue;
        }
        match c {
            '\\' => {
                chars.next();
            }
            '/' => parts += 1,
            _ => {}
        }
    }
    parts == 2 && flags.chars().all(|f| f == 'g')
}

/// The program argument of an `awk` command line: options `-v NAME=VAL` and
/// `-F SEP` are skipped (joined or separate), `--` ends them, and a program
/// file (`-f`, `--file`, `-E`, `--exec`, `-i`, `--include`) or any other
/// option is an error, since the program could not be checked.
fn awk_program(args: &[String]) -> Result<&str, String> {
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--" => {
                return it
                    .next()
                    .map(String::as_str)
                    .ok_or("without a program".into());
            }
            "-v" | "-F" => {
                if it.next().is_none() {
                    return Err(format!("{a} without a value"));
                }
            }
            a if a.starts_with("-v") || a.starts_with("-F") => {}
            a if a.starts_with('-') => return Err(format!("option {a} (program must be inline)")),
            prog => return Ok(prog),
        }
    }
    Err("without a program".into())
}

/// An `awk` program may compute and print to stdout only.
fn awk_problems(args: &[String]) -> Vec<String> {
    let prog = match awk_program(args) {
        Ok(p) => p,
        Err(e) => return vec![e],
    };
    let mut bad = Vec::new();
    let code = awk_code_only(prog);
    let calls = regex::Regex::new(r"\b(system|close|fflush)\s*\(|\b(getline|ENVIRON)\b").unwrap();
    for m in calls.find_iter(&code) {
        let word: String = m
            .as_str()
            .chars()
            .take_while(char::is_ascii_alphabetic)
            .collect();
        bad.push(format!("uses {word}"));
    }
    let bytes = code.as_bytes();
    for (i, b) in bytes.iter().enumerate() {
        let next = bytes.get(i + 1).copied();
        let prev = i.checked_sub(1).and_then(|p| bytes.get(p)).copied();
        if *b == b'>' && next != Some(b'=') {
            bad.push("uses `>` (redirect or compare; write comparisons with `<`)".into());
        }
        if *b == b'|' && next != Some(b'|') && prev != Some(b'|') {
            bad.push("uses `|` (pipe to a command)".into());
        }
    }
    bad
}

/// The awk program without string and regex literals, where `>` and `|` are
/// plain text rather than redirection or pipes.
fn awk_code_only(prog: &str) -> String {
    let mut out = String::new();
    let mut chars = prog.chars();
    let mut last = '{';
    while let Some(c) = chars.next() {
        let quote = match c {
            '"' => Some('"'),
            '/' if "(,~!{};&|=\n".contains(last) => Some('/'),
            _ => None,
        };
        if let Some(end) = quote {
            while let Some(q) = chars.next() {
                if q == '\\' {
                    chars.next();
                } else if q == end {
                    break;
                }
            }
            out.push(' ');
            last = 'x';
            continue;
        }
        out.push(c);
        if !c.is_whitespace() {
            last = c;
        }
    }
    out
}

// ---------------------------------------------------------- database rules

/// SQL functions a database query constant may call.
const SQL_FUNCTIONS: &[&str] = &[
    "count",
    "coalesce",
    "sum",
    "cast",
    "database",
    "current_database",
    "pg_database_size",
    "pg_total_relation_size",
];
/// Words that may stand right before a `(` without being a function call.
const SQL_BEFORE_PAREN: &[&str] = &[
    "select", "union", "all", "from", "where", "and", "or", "not", "in", "as", "on", "by", "is",
    "limit",
];
/// Statements and clauses that write, lock, run code or read files.
const SQL_FORBIDDEN: &[&str] = &[
    "insert", "update", "delete", "drop", "alter", "create", "grant", "revoke", "truncate",
    "replace", "lock", "call", "copy", "load", "set", "execute", "prepare", "into", "outfile",
    "dumpfile", "handler", "vacuum", "analyze", "explain", "do", "begin", "commit", "rollback",
];
/// Shell variables that hold a login (or the `.env` text it came from).
const SECRET_VARS: &[&str] = &[
    "$_pass",
    "$_cp",
    "$_user",
    "$_cu",
    "$_host",
    "$_port",
    "$_val",
    "$_env",
    "$PGPASSWORD",
    "$PGUSER",
    "$PGHOST",
];

/// The problems with one SQL constant (the text between the quotes).
fn sql_constant_problems(name: &str, sql: &str) -> Vec<String> {
    let mut bad = Vec::new();
    let head = sql.split_whitespace().next().unwrap_or_default();
    if !(head.eq_ignore_ascii_case("select") || head.eq_ignore_ascii_case("show"))
        && !sql.trim_start().starts_with("(SELECT")
    {
        bad.push(format!("{name}: does not start with SELECT or SHOW"));
    }
    if sql.contains(['\'', ';', '$', '`', '\\', '#']) || sql.contains("--") || sql.contains("/*") {
        bad.push(format!(
            "{name}: holds a quote, `;`, `$`, a comment or an escape"
        ));
    }
    let lower = sql.to_ascii_lowercase();
    let words = regex::Regex::new(r"[a-z_][a-z0-9_]*").unwrap();
    for m in words.find_iter(&lower) {
        if SQL_FORBIDDEN.contains(&m.as_str()) {
            bad.push(format!("{name}: uses `{}`", m.as_str().to_uppercase()));
        }
    }
    let calls = regex::Regex::new(r"([a-z_][a-z0-9_]*)\s*\(").unwrap();
    for c in calls.captures_iter(&lower) {
        let word = &c[1];
        if !SQL_BEFORE_PAREN.contains(&word) && !SQL_FUNCTIONS.contains(&word) {
            bad.push(format!("{name}: calls `{word}(`, not an allowed function"));
        }
    }
    bad
}

/// The tool a command line runs, with the arguments left for it: looks
/// through `run_light`, `run_for SECONDS` and `docker exec [-i] [-e NAME]…
/// CONTAINER`.
fn db_tool<'a>(cmd: &'a Cmd, bad: &mut Vec<String>, file: &str) -> Option<(&'a str, &'a [String])> {
    let (name, args): (&str, &[String]) = match cmd.name.as_str() {
        "run_light" => (args_first(&cmd.args)?, &cmd.args[1..]),
        "run_for" => (cmd.args.get(1).map(String::as_str)?, &cmd.args[2..]),
        other => (other, &cmd.args[..]),
    };
    match name {
        "mysql" | "psql" => Some((name, args)),
        "docker" => match args.first().map(String::as_str) {
            Some("inspect") => {
                let format = args
                    .iter()
                    .position(|a| a == "--format")
                    .and_then(|i| args.get(i + 1));
                match format {
                    Some(f) if !f.contains("Env") && !f.contains(".Config") => {}
                    _ => bad.push(format!(
                        "{file}: docker inspect without a field-only --format"
                    )),
                }
                None
            }
            Some("exec") => {
                let mut rest = &args[1..];
                loop {
                    match rest {
                        [flag, tail @ ..] if flag == "-i" => rest = tail,
                        [flag, var, tail @ ..] if flag == "-e" => {
                            if var.contains('=') || var.starts_with('$') {
                                bad.push(format!(
                                    "{file}: docker exec -e {var} (name the variable only)"
                                ));
                            }
                            rest = tail;
                        }
                        [flag, ..] if flag.starts_with('-') => {
                            bad.push(format!("{file}: docker exec option {flag}"));
                            return None;
                        }
                        _ => break,
                    }
                }
                match rest {
                    [container, tool, tail @ ..]
                        if container == "$container" && (tool == "mysql" || tool == "psql") =>
                    {
                        Some((tool.as_str(), tail))
                    }
                    _ => {
                        bad.push(format!(
                            "{file}: docker exec of something else than the SQL client"
                        ));
                        None
                    }
                }
            }
            other => {
                bad.push(format!("{file}: docker {other:?} (only exec and inspect)"));
                None
            }
        },
        _ => None,
    }
}

fn args_first(args: &[String]) -> Option<&str> {
    args.first().map(String::as_str)
}

/// Rules for scripts that run a database client. Returns the problems and
/// the number of client calls it saw (a test that sees none proves nothing).
///
/// - SQL lives only in `Q_NAME='SELECT …'` constants (one statement, one
///   assignment each), allowed to call a short list of functions only;
/// - a client gets its query as `-e "$Q_NAME"` / `-c "$Q_NAME"`, its login
///   only through an option file on stdin (`mysql`) or `PG*` variables passed
///   by name (`psql`, `docker exec -e NAME`), and no other option;
/// - no fact, message or `echo` mentions a login variable, and only the
///   option-file `printf` formats one.
fn db_violations(file: &str, src: &str) -> (Vec<String>, usize) {
    let mut bad = Vec::new();
    let code: Vec<&str> = src
        .lines()
        .filter(|l| !l.trim_start().starts_with('#'))
        .collect();

    // SQL constants.
    let assign = regex::Regex::new(r"^\s*(Q_[A-Z0-9_]+)=(.*)$").unwrap();
    let any_q = regex::Regex::new(r"(\$\{?)?\bQ_[A-Z0-9_]+").unwrap();
    let mut assigned = BTreeSet::new();
    for line in &code {
        if let Some(c) = assign.captures(line) {
            let (name, value) = (c[1].to_owned(), c[2].trim());
            if !assigned.insert(name.clone()) {
                bad.push(format!("{file}: {name} assigned twice"));
            }
            match value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')) {
                Some(sql) => bad.extend(sql_constant_problems(&format!("{file}: {name}"), sql)),
                None => bad.push(format!("{file}: {name} is not a single-quoted constant")),
            }
            continue;
        }
        for m in any_q.captures_iter(line) {
            if m.get(1).is_none() {
                bad.push(format!(
                    "{file}: `{}` is not a plain use of a constant",
                    &m[0]
                ));
            }
        }
    }
    if code
        .iter()
        .any(|l| l.contains("/dev/stdin") && !l.contains("--defaults-extra-file=/dev/stdin"))
    {
        bad.push(format!("{file}: /dev/stdin outside --defaults-extra-file"));
    }

    // Client calls and what mentions a login.
    let scanned = scan(src);
    let mut calls = 0;
    for cmd in &scanned.cmds {
        match cmd.name.as_str() {
            "emit" | "emit_unknown" | "perm_missing" | "echo" | "json_str" => {
                for a in &cmd.args {
                    if SECRET_VARS.iter().any(|v| a.contains(v)) {
                        bad.push(format!("{file}: `{} … {a}` would print a login", cmd.name));
                    }
                }
            }
            "printf" => {
                // The .env text may be piped into the in-script reader.
                let mentions = cmd
                    .args
                    .iter()
                    .skip(1)
                    .any(|a| SECRET_VARS.iter().any(|v| *v != "$_env" && a.contains(v)));
                if mentions && !cmd.args.first().is_some_and(|f| f.starts_with("[client]")) {
                    bad.push(format!("{file}: printf of a login outside the option file"));
                }
            }
            _ => {}
        }
        let Some((tool, args)) = db_tool(cmd, &mut bad, file) else {
            continue;
        };
        calls += 1;
        let is_q = |a: &str| a.starts_with("$Q_") && assigned.contains(&a[1..]);
        let mut it = args.iter().peekable();
        let mut first = true;
        let mut query = false;
        let mut db = false;
        while let Some(a) = it.next() {
            let ok = match (tool, a.as_str()) {
                ("mysql", "--defaults-extra-file=/dev/stdin") => first,
                ("mysql", "-N" | "-B") | ("psql", "-X" | "-w" | "-A" | "-t") => true,
                ("mysql", opt) if opt.starts_with("--connect-timeout=") => opt
                    ["--connect-timeout=".len()..]
                    .chars()
                    .all(|c| c.is_ascii_digit()),
                ("mysql", "-e") | ("psql", "-c") => {
                    query = it.next().is_some_and(|q| is_q(q));
                    query
                }
                ("psql", "-F") => it.next().is_some_and(|v| v == "$TAB"),
                ("psql", "-d") => {
                    db = it.next().is_some_and(|v| v == "$database");
                    db
                }
                ("mysql", "$database") => {
                    db = it.peek().is_none();
                    db
                }
                _ => false,
            };
            if !ok {
                bad.push(format!("{file}: {tool} argument `{a}` is not allowed"));
            }
            first = false;
        }
        if tool == "mysql"
            && args.first().map(String::as_str) != Some("--defaults-extra-file=/dev/stdin")
        {
            bad.push(format!(
                "{file}: mysql without --defaults-extra-file=/dev/stdin first"
            ));
        }
        if !query || !db {
            bad.push(format!(
                "{file}: {tool} call without a constant query and the database"
            ));
        }
    }
    (bad, calls)
}

fn prelude_functions() -> BTreeSet<String> {
    scan(PRELUDE).functions
}

// ------------------------------------------------------------------- tests

#[test]
fn every_script_runs_only_allowed_commands() {
    let m = manifest().unwrap();
    let prelude_fns = prelude_functions();
    let needs: Vec<String> = PRELUDE_NEEDS.iter().map(|s| (*s).to_owned()).collect();
    let mut bad = violations("prelude.sh", PRELUDE, &needs, &BTreeSet::new());
    for (file, src) in SCRIPTS {
        let spec = m
            .checks
            .iter()
            .find(|c| c.script.as_deref() == Some(*file))
            .expect("script in manifest");
        bad.extend(violations(file, src, &spec.needs, &prelude_fns));
    }
    assert!(bad.is_empty(), "allowlist violations:\n{}", bad.join("\n"));
}

#[test]
fn the_tokenizer_sees_the_commands_scripts_really_run() {
    let names =
        |src: &str| -> BTreeSet<String> { scan(src).cmds.into_iter().map(|c| c.name).collect() };
    let prelude = names(PRELUDE);
    for cmd in [
        "tr", "sed", "awk", "date", "nice", "ionice", "timeout", "printf", "command",
    ] {
        assert!(
            prelude.contains(cmd),
            "prelude: {cmd} not seen in {prelude:?}"
        );
    }
    let script = |f: &str| {
        SCRIPTS
            .iter()
            .find(|(n, _)| *n == f)
            .map(|(_, s)| *s)
            .unwrap()
    };
    let disk = names(script("disk_fs.sh"));
    for cmd in [
        "run_light",
        "awk",
        "emit",
        "emit_unknown",
        "json_str",
        "read",
    ] {
        assert!(disk.contains(cmd), "disk_fs: {cmd} not seen in {disk:?}");
    }
    let load = names(script("sys_load.sh"));
    for cmd in ["read", "has", "nproc", "getconf", "is_num", "emit"] {
        assert!(load.contains(cmd), "sys_load: {cmd} not seen in {load:?}");
    }
}

#[test]
fn prelude_defines_the_documented_helpers() {
    let fns = prelude_functions();
    for f in [
        "has",
        "json_str",
        "is_num",
        "emit",
        "emit_unknown",
        "perm_missing",
        "run_light",
        "d_begin",
        "d_step",
        "d_end",
    ] {
        assert!(fns.contains(f), "prelude lacks {f}");
    }
}

#[test]
fn the_allowlist_catches_writes_and_unknown_commands() {
    let fns = prelude_functions();
    let needs = vec![
        "df".to_owned(),
        "awk".to_owned(),
        "sed".to_owned(),
        "find".to_owned(),
    ];
    let cases: &[(&str, &str)] = &[
        ("rm -rf /tmp/x", "`rm` is not allowed"),
        ("echo hi > /tmp/file", "writes with `>/tmp/file`"),
        ("echo hi >>\"$HOME/x\"", "writes with `>>"),
        ("printf x 2>/tmp/err", "writes with `2>/tmp/err`"),
        ("x=$(curl -s http://x)", "`curl` is not allowed"),
        ("echo \"$(wget x)\"", "`wget` is not allowed"),
        ("echo `touch x`", "`touch` is not allowed"),
        ("run_light rm -f x", "run_light of `Some(\"rm\")`"),
        ("sed -i 's/a/b/' f", "sed -i"),
        ("sed 's/a/b/w out' f", "not a plain s/// substitution"),
        ("sed -e '1d' f", "not a plain s/// substitution"),
        ("awk '{ print > \"out\" }'", "awk uses `>`"),
        ("awk '{ print | \"sh\" }'", "awk uses `|`"),
        ("awk 'BEGIN { system(\"id\") }'", "awk uses system"),
        ("awk -v a=1 'BEGIN{system(\"id\")}'", "awk uses system"),
        ("awk -va=1 -F: '{ print > \"o\" }'", "awk uses `>`"),
        ("awk -F : -- '{ print | \"sh\" }'", "awk uses `|`"),
        ("awk -f x", "awk option -f"),
        ("awk --file=x", "awk option --file=x"),
        ("awk -v", "awk -v without a value"),
        ("echo \"${x:-$(rm y)}\"", "`rm` is not allowed"),
        ("echo ${x:-`rm y`}", "`rm` is not allowed"),
        ("n=$(( $(rm y) + 1 ))", "`rm` is not allowed"),
        ("echo ${a:-${b:-$(rm y)}}", "`rm` is not allowed"),
        ("x=\"${y:-'$(rm y)'}\"", "quotes inside"),
        ("echo x >&out", "writes with `>&out`"),
        ("echo x 2>&out", "writes with `2>&out`"),
        ("find / -name x -delete", "find -delete"),
        ("find / -exec cat {} +", "find -exec"),
        (". /etc/profile", "banned command `.`"),
        ("eval \"$x\"", "banned command `eval`"),
        ("exec cat", "banned command `exec`"),
        ("sudo df", "banned command `sudo`"),
        ("kill 1", "banned command `kill`"),
        ("$cmd arg", "dynamic command `$cmd`"),
        ("command rm x", "`command` may only look up"),
        ("if true; then tee x; fi", "`tee` is not allowed"),
        (
            "case $x in a) dd if=/dev/zero ;; esac",
            "`dd` is not allowed",
        ),
        ("for f in a b; do mv a b; done", "`mv` is not allowed"),
        ("a | b", "`a` is not allowed"),
    ];
    for (src, want) in cases {
        let got = violations("t.sh", src, &needs, &fns).join("\n");
        assert!(got.contains(want), "{src:?}: want {want:?}, got {got:?}");
    }
    let clean: &[&str] = &[
        "x=$(df -P 2>/dev/null) || exit 0",
        "has df && run_light df -P >/dev/null 2>&1",
        "echo x >&2",
        "case $x in *[!0-9]*) emit a b ;; '') exit 0 ;; esac",
        "for i in 1 2; do printf '%s' \"$i\"; done",
        "f() (\n\tread -r a </proc/loadavg\n)\nf",
        "awk '$1 == \"x\" && NF < 7 || $2 >= 3 { print $1 }'",
        "sed -e 's/\\\\/\\\\\\\\/g' -e 's/\"/\\\\\"/g'",
        "command -v df >/dev/null",
        "n=$((n + 1))",
        "n=$(( (a + 1) * $(printf 2) ))",
        "echo \"${1#-}\" ${2-} ${x:-${y}}",
        "echo x >&- 2>&1 1>&2",
        "awk -v n=1 -F '\\t' '{ print n }'",
    ];
    for src in clean {
        let got = violations("t.sh", src, &needs, &fns);
        assert!(got.is_empty(), "{src:?} flagged: {got:?}");
    }
}

#[test]
fn database_scripts_run_only_constant_select_queries() {
    let m = manifest().unwrap();
    let mut seen = 0;
    for (file, src) in SCRIPTS {
        let spec = m
            .checks
            .iter()
            .find(|c| c.script.as_deref() == Some(*file))
            .expect("script in manifest");
        let uses_client = spec.needs.iter().any(|n| n == "mysql" || n == "psql");
        let (bad, calls) = db_violations(file, src);
        if uses_client {
            assert!(
                bad.is_empty(),
                "database rule violations:\n{}",
                bad.join("\n")
            );
            seen += calls;
        } else {
            assert_eq!(
                calls, 0,
                "{file} runs a database client it does not declare"
            );
        }
    }
    // mysql and psql, each on the host and through docker exec.
    assert_eq!(seen, 4, "client calls the tokenizer saw");
}

#[test]
fn the_database_rules_catch_writes_logins_on_argv_and_variable_queries() {
    let q = "Q_A='SELECT 1'\n";
    let cases: &[(&str, &str)] = &[
        ("Q_A='DROP TABLE x'\n", "does not start with SELECT or SHOW"),
        ("Q_A='SELECT 1; DROP TABLE x'\n", "holds a quote"),
        ("Q_A='SELECT 1 INTO OUTFILE x'\n", "uses `INTO`"),
        (
            "Q_A='SELECT pg_terminate_backend(1)'\n",
            "calls `pg_terminate_backend(",
        ),
        ("Q_A='SELECT load_file(x)'\n", "calls `load_file("),
        ("Q_A='SELECT sleep (5)'\n", "calls `sleep("),
        ("Q_A='SELECT 1 -- x'\n", "holds a quote"),
        ("Q_A=\"SELECT 1\"\n", "not a single-quoted constant"),
        ("Q_A='SELECT 1'\nQ_A='SELECT 2'\n", "assigned twice"),
        ("Q_A=$x\n", "not a single-quoted constant"),
        ("read -r Q_A\n", "not a plain use"),
        ("mysql -e 'DROP TABLE x' db\n", "mysql argument `-e`"),
        (
            "mysql --defaults-extra-file=/dev/stdin -e \"$sql\" \"$database\"\n",
            "mysql argument `-e`",
        ),
        (
            "mysql -ppass -e \"$Q_A\" \"$database\"\n",
            "mysql argument `-ppass`",
        ),
        (
            "mysql --password=x --defaults-extra-file=/dev/stdin\n",
            "mysql argument `--password=x`",
        ),
        (
            "mysql -u root --defaults-extra-file=/dev/stdin\n",
            "mysql argument `-u`",
        ),
        (
            "mysql --defaults-extra-file=/tmp/c -e \"$Q_A\" \"$database\"\n",
            "mysql argument `--defaults-extra-file=/tmp/c`",
        ),
        (
            "mysql -N --defaults-extra-file=/dev/stdin -e \"$Q_A\" \"$database\"\n",
            "mysql argument `--defaults-extra-file=/dev/stdin`",
        ),
        (
            "mysql --defaults-extra-file=/dev/stdin -e \"$Q_A\"\n",
            "without a constant query and the database",
        ),
        (
            "psql -U root -d \"$database\" -c \"$Q_A\"\n",
            "psql argument `-U`",
        ),
        (
            "psql -h db -d \"$database\" -c \"$Q_A\"\n",
            "psql argument `-h`",
        ),
        ("psql -f x.sql -d \"$database\"\n", "psql argument `-f`"),
        ("psql -d \"$database\" -c \"$Q_B\"\n", "psql argument `-c`"),
        ("run_light psql -d x -c \"$Q_A\"\n", "psql argument `-d`"),
        (
            "run_for \"$_gl\" psql -U root -d \"$database\" -c \"$Q_A\"\n",
            "psql argument `-U`",
        ),
        (
            "docker exec -e PGPASSWORD=x \"$container\" psql\n",
            "docker exec -e PGPASSWORD=x",
        ),
        (
            "docker exec -u root \"$container\" mysql\n",
            "docker exec option -u",
        ),
        (
            "docker exec \"$container\" sh -c x\n",
            "docker exec of something else",
        ),
        ("docker run x\n", "docker Some(\"run\")"),
        (
            "docker inspect \"$container\"\n",
            "without a field-only --format",
        ),
        (
            "docker inspect --format '{{json .Config.Env}}' c\n",
            "without a field-only --format",
        ),
        (
            "emit db.size \"$database\" \"$_pass\"\n",
            "would print a login",
        ),
        ("echo \"$PGPASSWORD\"\n", "would print a login"),
        (
            "printf '%s' \"$_cp\"\n",
            "printf of a login outside the option file",
        ),
        ("cat /dev/stdin\n", "/dev/stdin outside"),
    ];
    for (src, want) in cases {
        let (bad, _) = db_violations("t.sh", &format!("{q}{src}"));
        let got = bad.join("\n");
        assert!(got.contains(want), "{src:?}: want {want:?}, got {got:?}");
    }
    let clean = "Q_A='SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY 1 LIMIT 5'\n\
        printf '[client]\\nuser=\"%s\"\\n' \"$_cu\" | run_light docker exec -i \"$container\" mysql --defaults-extra-file=/dev/stdin --connect-timeout=10 -N -B -e \"$Q_A\" \"$database\" 2>/dev/null\n\
        run_light psql -X -w -A -t -F \"$TAB\" -d \"$database\" -c \"$Q_A\"\n\
        run_light docker exec -e PGUSER -e PGPASSWORD \"$container\" psql -X -w -A -t -F \"$TAB\" -d \"$database\" -c \"$Q_A\"\n\
        run_light docker inspect --format '{{.State.Running}}' \"$container\"\n";
    let (bad, calls) = db_violations("t.sh", clean);
    assert!(bad.is_empty(), "clean script flagged: {bad:?}");
    assert_eq!(calls, 3);
}

#[test]
fn every_check_has_en_and_vi_strings() {
    let m = manifest().unwrap();
    for lang in ["en", "vi"] {
        let path = repo().join(format!("src/i18n/{lang}.json"));
        let json: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("locale file")).expect("locale JSON");
        for c in &m.checks {
            // vue-i18n reads `checks.sys.load.name` as nested keys.
            let mut node = &json["checks"];
            for part in c.id.split('.') {
                node = &node[part];
            }
            for key in ["name", "desc"] {
                let text = node[key].as_str().unwrap_or_default();
                assert!(
                    !text.trim().is_empty(),
                    "{lang}: checks.{}.{key} missing",
                    c.id
                );
            }
        }
    }
}

#[test]
fn every_scripted_check_has_golden_ndjson_per_distro() {
    let m = manifest().unwrap();
    let dir = repo().join("fixtures/ndjson");
    let found: BTreeSet<String> = fs::read_dir(&dir)
        .expect("fixtures/ndjson")
        .map(|e| e.unwrap())
        .filter(|e| e.file_type().unwrap().is_dir())
        .map(|e| e.file_name().into_string().unwrap())
        .collect();
    let want: BTreeSet<String> = DISTROS.iter().map(|d| (*d).to_owned()).collect();
    assert_eq!(found, want, "distro folders");
    for distro in DISTROS {
        for c in &m.checks {
            let Some(script) = &c.script else { continue };
            let stem = script.trim_end_matches(".sh");
            let path = dir.join(distro).join(format!("{stem}.ndjson"));
            let bytes = fs::read(&path).unwrap_or_else(|_| panic!("missing {}", path.display()));
            let out = ndjson::parse(&bytes);
            assert!(
                out.ended && out.dropped == 0,
                "{}: not clean v1",
                path.display()
            );
            assert!(
                out.facts.iter().any(|f| f.check == c.id),
                "{}: no {} line",
                path.display(),
                c.id
            );
            assert!(
                out.coverage.contains(&c.group),
                "{}: no step for {:?}",
                path.display(),
                c.group
            );
        }
    }
}
