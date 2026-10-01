//! Parser for NDJSON v1, what a bundle prints (see `docs/decisions/0002`).
//!
//! Each line is size-limited and scrubbed of control characters before it is
//! parsed. A line that is not valid v1 is dropped and counted, never fatal.
//! Facts are accepted only between `begin` and `end`; a run that never printed
//! `end` is Partial, whatever the exit code.
//!
//! Server output is untrusted. A parser made with [`Parser::for_bundle`] also
//! drops a `begin` whose hash is not the bundle that was sent (so the whole
//! run counts as Partial), facts for checks the bundle did not run (local
//! checks included) and `step` lines for groups it did not run.

use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;
use serde_json::Value;

use crate::domain::fact::CheckFact;
use crate::domain::ingest::{LineBuffer, MAX_HOST_FACTS, cap_arrays, clean_line};
use crate::domain::manifest::CheckGroup;
use crate::domain::snapshot::HostOutcome;

use super::bundle::Bundle;

/// The NDJSON contract version this parser reads.
pub const NDJSON_VERSION: u32 = 1;

/// Longest accepted check id.
const MAX_CHECK_ID: usize = 64;

/// One accepted line.
#[derive(Clone, Debug, PartialEq)]
pub enum Line {
    Begin { bundle: String },
    Step { group: CheckGroup, ms: u64 },
    Fact(CheckFact),
    End,
}

/// Everything accepted from one host's output.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct HostOutput {
    /// Bundle hash from the `begin` line.
    pub bundle: Option<String>,
    pub facts: Vec<CheckFact>,
    /// Groups whose `step` line arrived: what this run verified.
    pub coverage: BTreeSet<CheckGroup>,
    /// Time each group took on the server.
    pub step_ms: BTreeMap<CheckGroup, u64>,
    /// The `end` line arrived.
    pub ended: bool,
    /// Lines rejected: too long, not JSON, not v1, out of order or over a limit.
    pub dropped: u32,
    /// Output passed [`MAX_HOST_BYTES`] and the rest was ignored.
    pub truncated: bool,
}

impl HostOutput {
    /// `Reached` when the run printed `end`, otherwise `Partial`. Transport
    /// failures (unreachable, auth, timeout) are decided by the caller.
    pub fn outcome(&self) -> HostOutcome {
        if self.ended {
            HostOutcome::Reached
        } else {
            HostOutcome::Partial
        }
    }
}

#[derive(Deserialize)]
struct BeginLine {
    v: u32,
    #[serde(default)]
    bundle: String,
}

#[derive(Deserialize)]
struct StepLine {
    group: CheckGroup,
    #[serde(default)]
    ms: u64,
}

/// What the bundle that was sent can print.
#[derive(Clone, Debug)]
struct Expected {
    hash: String,
    checks: BTreeSet<String>,
    groups: BTreeSet<CheckGroup>,
}

/// Incremental parser: feed raw chunks as they arrive, read lines back.
#[derive(Debug, Default)]
pub struct Parser {
    out: HostOutput,
    /// Set by [`Parser::for_bundle`]; `None` accepts any well-formed line.
    expected: Option<Expected>,
    begun: bool,
    buf: LineBuffer,
}

impl Parser {
    /// A parser that only checks the v1 shape (fixtures, dev tools).
    pub fn new() -> Self {
        Self::default()
    }

    /// A parser for the output of `bundle`: only its hash, its checks and its
    /// groups are accepted. Use this for real scans.
    pub fn for_bundle(bundle: &Bundle) -> Self {
        Self {
            expected: Some(Expected {
                hash: bundle.hash.clone(),
                checks: bundle.checks.iter().cloned().collect(),
                groups: bundle.groups.iter().copied().collect(),
            }),
            ..Self::default()
        }
    }

    /// Takes the next chunk of output and returns the lines it completed.
    pub fn feed(&mut self, chunk: &[u8]) -> Vec<Line> {
        let got = self.buf.push(chunk);
        self.out.truncated = self.buf.truncated();
        self.out.dropped += got.overlong;
        got.lines.iter().filter_map(|raw| self.line(raw)).collect()
    }

    /// Ends the stream: a last line without a newline is still parsed.
    pub fn finish(mut self) -> HostOutput {
        let rest = self.buf.finish();
        self.out.dropped += rest.overlong;
        for raw in &rest.lines {
            let _ = self.line(raw);
        }
        self.out
    }

    /// Parses one complete line and records it.
    fn line(&mut self, raw: &[u8]) -> Option<Line> {
        let parsed = self.accept(raw);
        if parsed.is_none() {
            self.out.dropped += 1;
        }
        parsed
    }

    fn accept(&mut self, raw: &[u8]) -> Option<Line> {
        if self.out.ended {
            return None;
        }
        let text = clean_line(raw);
        let value: Value = serde_json::from_str(&text).ok()?;
        let kind = match value.as_object()?.get("_") {
            None => None,
            Some(Value::String(kind)) => Some(kind.clone()),
            Some(_) => return None,
        };
        match kind {
            Some(kind) => self.meta(&kind, value),
            None => self.fact(value),
        }
    }

    fn meta(&mut self, kind: &str, value: Value) -> Option<Line> {
        match kind {
            "begin" if !self.begun => {
                let begin: BeginLine = serde_json::from_value(value).ok()?;
                let stale = self
                    .expected
                    .as_ref()
                    .is_some_and(|e| e.hash != begin.bundle);
                if begin.v != NDJSON_VERSION || stale {
                    return None;
                }
                self.begun = true;
                self.out.bundle = Some(begin.bundle.clone());
                Some(Line::Begin {
                    bundle: begin.bundle,
                })
            }
            "step" if self.begun => {
                let step: StepLine = serde_json::from_value(value).ok()?;
                if self
                    .expected
                    .as_ref()
                    .is_some_and(|e| !e.groups.contains(&step.group))
                {
                    return None;
                }
                self.out.coverage.insert(step.group);
                self.out.step_ms.insert(step.group, step.ms);
                Some(Line::Step {
                    group: step.group,
                    ms: step.ms,
                })
            }
            "end" if self.begun => {
                self.out.ended = true;
                Some(Line::End)
            }
            _ => None,
        }
    }

    fn fact(&mut self, value: Value) -> Option<Line> {
        if !self.begun || self.out.facts.len() >= MAX_HOST_FACTS {
            return None;
        }
        let mut fact: CheckFact = serde_json::from_value(value).ok()?;
        let id_ok = !fact.check.is_empty()
            && fact.check.len() <= MAX_CHECK_ID
            && fact
                .check
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_');
        let sent = self
            .expected
            .as_ref()
            .is_none_or(|e| e.checks.contains(&fact.check));
        if !id_ok || !sent || fact.value.is_some_and(|v| !v.is_finite()) {
            return None;
        }
        cap_arrays(&mut fact.data);
        self.out.facts.push(fact.clone());
        Some(Line::Fact(fact))
    }
}

/// Parses a whole output at once, checking the v1 shape only.
pub fn parse(bytes: &[u8]) -> HostOutput {
    let mut parser = Parser::new();
    parser.feed(bytes);
    parser.finish()
}

/// Parses a whole output of `bundle` at once (see [`Parser::for_bundle`]).
pub fn parse_for(bundle: &Bundle, bytes: &[u8]) -> HostOutput {
    let mut parser = Parser::for_bundle(bundle);
    parser.feed(bytes);
    parser.finish()
}

#[cfg(test)]
mod tests;
