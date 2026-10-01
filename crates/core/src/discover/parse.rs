//! Reads the output of a setup script (login or discover): the `begin` and
//! `end` lines of NDJSON v1 around `rec` records. Like the check parser it is
//! incremental and treats the server as untrusted: lines are size-limited and
//! scrubbed (`LineBuffer`, `clean_line`), a `begin` carrying another bundle
//! hash drops the whole run, records are accepted only between `begin` and
//! `end`, checked one by one ([`SetupRecord::sanitize`]) and capped per kind.

use std::collections::BTreeMap;

use serde_json::Value;

use super::record::SetupRecord;
use crate::checks::bundle::Bundle;
use crate::checks::ndjson::NDJSON_VERSION;
use crate::domain::ingest::{LineBuffer, MAX_HOST_FACTS, clean_line};

/// Everything accepted from one run.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RecordOutput {
    /// Bundle hash from the `begin` line.
    pub bundle: Option<String>,
    pub records: Vec<SetupRecord>,
    /// The `end` line arrived.
    pub ended: bool,
    /// Lines rejected: too long, not JSON, not v1, unknown kind, out of
    /// order, failing the checks or over a cap.
    pub dropped: u32,
    /// Output passed the size limit and the rest was ignored.
    pub truncated: bool,
}

/// What a line was.
enum Line {
    Begin,
    Meta,
    End,
    SetupRecord(SetupRecord),
    Dropped,
}

/// Incremental parser: feed raw chunks, read the records they completed.
#[derive(Debug)]
pub struct RecordParser {
    out: RecordOutput,
    /// The hash of the bundle that was sent; a `begin` with another is dropped.
    /// `None` accepts any (fixtures, the dev CLI).
    expected: Option<String>,
    begun: bool,
    buf: LineBuffer,
    kept: BTreeMap<&'static str, usize>,
}

impl RecordParser {
    /// A parser for the output of `bundle`.
    pub fn for_bundle(bundle: &Bundle) -> Self {
        Self::with(Some(bundle.hash.clone()))
    }

    /// A parser that takes any bundle hash (recorded fixtures, dev tools).
    pub fn any() -> Self {
        Self::with(None)
    }

    fn with(expected: Option<String>) -> Self {
        Self {
            out: RecordOutput::default(),
            expected,
            begun: false,
            buf: LineBuffer::default(),
            kept: BTreeMap::new(),
        }
    }

    /// Whether the `begin` line arrived.
    pub fn begun(&self) -> bool {
        self.begun
    }

    /// Takes the next chunk and returns the records it completed.
    pub fn feed(&mut self, chunk: &[u8]) -> Vec<SetupRecord> {
        let got = self.buf.push(chunk);
        self.out.truncated = self.buf.truncated();
        self.out.dropped += got.overlong;
        got.lines.iter().filter_map(|raw| self.line(raw)).collect()
    }

    /// Ends the stream: a last line without a newline is still read.
    pub fn finish(mut self) -> RecordOutput {
        let rest = self.buf.finish();
        self.out.dropped += rest.overlong;
        for raw in &rest.lines {
            let _ = self.line(raw);
        }
        self.out
    }

    fn line(&mut self, raw: &[u8]) -> Option<SetupRecord> {
        match self.accept(raw) {
            Line::SetupRecord(r) => Some(r),
            Line::Dropped => {
                self.out.dropped += 1;
                None
            }
            Line::Begin | Line::Meta | Line::End => None,
        }
    }

    fn accept(&mut self, raw: &[u8]) -> Line {
        if self.out.ended {
            return Line::Dropped;
        }
        let text = clean_line(raw);
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            return Line::Dropped;
        };
        let Some(object) = value.as_object() else {
            return Line::Dropped;
        };
        match object.get("_") {
            Some(Value::String(kind)) => self.meta(kind, object),
            Some(_) => Line::Dropped,
            None => self.record(value),
        }
    }

    fn meta(&mut self, kind: &str, object: &serde_json::Map<String, Value>) -> Line {
        match kind {
            "begin" if !self.begun => {
                let version = object.get("v").and_then(Value::as_u64);
                let bundle = object.get("bundle").and_then(Value::as_str).unwrap_or("");
                let stale = self.expected.as_deref().is_some_and(|h| h != bundle);
                if version != Some(u64::from(NDJSON_VERSION)) || stale {
                    return Line::Dropped;
                }
                self.begun = true;
                self.out.bundle = Some(bundle.to_owned());
                Line::Begin
            }
            "step" if self.begun => Line::Meta,
            "end" if self.begun => {
                self.out.ended = true;
                Line::End
            }
            _ => Line::Dropped,
        }
    }

    fn record(&mut self, value: Value) -> Line {
        if !self.begun || self.out.records.len() >= MAX_HOST_FACTS {
            return Line::Dropped;
        }
        let Ok(record) = serde_json::from_value::<SetupRecord>(value) else {
            return Line::Dropped;
        };
        let Some(record) = record.sanitize() else {
            return Line::Dropped;
        };
        let count = self.kept.entry(record.kind()).or_insert(0);
        if *count >= record.cap() {
            return Line::Dropped;
        }
        *count += 1;
        self.out.records.push(record.clone());
        Line::SetupRecord(record)
    }
}

#[cfg(test)]
mod tests;
