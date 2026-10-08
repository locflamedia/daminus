//! Pulls the `summary` text out of a JSON answer while it is still streaming,
//! so the screen can show it appearing gradually. The model streams one JSON
//! object; this reads the pieces as they come and yields the newly decoded
//! characters of the top-level `"summary"` string, ignoring every other key.

/// Where the parser is inside the model's text.
#[derive(Debug)]
enum Mode {
    /// Between tokens (or before the object: a ```json fence is skipped).
    Outside,
    /// In a string that is not wanted. `key` collects it when it is a top-level key.
    Skip { key: Option<String>, escaped: bool },
    /// In the `summary` string value.
    Summary(Escape),
    /// The summary string has ended.
    Done,
}

/// How far into an escape sequence the summary string is.
#[derive(Debug)]
enum Escape {
    None,
    Backslash,
    /// The hex digits of `\uXXXX` read so far.
    Unicode(String),
}

/// Incremental reader of the `summary` string. Feed it the text pieces in order.
#[derive(Debug)]
pub struct SummaryExtractor {
    mode: Mode,
    depth: u32,
    /// A top-level key was read and its value has not started.
    pending_key: Option<String>,
    /// The next string at depth 1 is a key.
    expect_key: bool,
    /// A `\uD800..\uDBFF` waiting for its low half.
    high_surrogate: Option<u32>,
}

impl Default for SummaryExtractor {
    fn default() -> Self {
        Self::new()
    }
}

impl SummaryExtractor {
    pub fn new() -> Self {
        Self {
            mode: Mode::Outside,
            depth: 0,
            pending_key: None,
            expect_key: false,
            high_surrogate: None,
        }
    }

    /// Whether the summary string has ended (nothing more will come out).
    pub fn is_done(&self) -> bool {
        matches!(self.mode, Mode::Done)
    }

    /// Reads the next piece of the model's text. Returns the characters of the
    /// summary that this piece completed, or `None` when it added none.
    pub fn push(&mut self, piece: &str) -> Option<String> {
        let mut out = String::new();
        for c in piece.chars() {
            if self.is_done() {
                break;
            }
            self.step(c, &mut out);
        }
        (!out.is_empty()).then_some(out)
    }

    fn step(&mut self, c: char, out: &mut String) {
        match &mut self.mode {
            Mode::Done => {}
            Mode::Summary(_) => self.step_summary(c, out),
            Mode::Skip { key, escaped } => {
                if *escaped {
                    *escaped = false;
                    if let Some(k) = key {
                        k.push(c);
                    }
                } else if c == '\\' {
                    *escaped = true;
                } else if c == '"' {
                    self.pending_key = key.take();
                    self.mode = Mode::Outside;
                } else if let Some(k) = key {
                    k.push(c);
                }
            }
            Mode::Outside => self.step_outside(c),
        }
    }

    fn step_outside(&mut self, c: char) {
        if self.depth == 0 && c != '{' {
            return; // a fence or a preface before the object
        }
        if self.depth == 1 && self.pending_key.is_some() {
            if c.is_whitespace() || c == ':' {
                return;
            }
            let is_summary = self.pending_key.take().is_some_and(|k| k == "summary");
            if is_summary && c == '"' {
                self.mode = Mode::Summary(Escape::None);
                return;
            }
        }
        match c {
            '{' | '[' => {
                self.depth += 1;
                self.expect_key = self.depth == 1 && c == '{';
            }
            '}' | ']' => self.depth = self.depth.saturating_sub(1),
            ',' if self.depth == 1 => self.expect_key = true,
            '"' => {
                let is_key = self.depth == 1 && self.expect_key;
                self.expect_key = false;
                self.mode = Mode::Skip {
                    key: is_key.then(String::new),
                    escaped: false,
                };
            }
            _ => {}
        }
    }

    fn step_summary(&mut self, c: char, out: &mut String) {
        let Mode::Summary(esc) = &mut self.mode else {
            return;
        };
        match esc {
            Escape::None => match c {
                '\\' => *esc = Escape::Backslash,
                '"' => {
                    self.flush_surrogate(out);
                    self.mode = Mode::Done;
                }
                _ => {
                    self.flush_surrogate(out);
                    out.push(c);
                }
            },
            Escape::Backslash => {
                if c == 'u' {
                    *esc = Escape::Unicode(String::new());
                } else {
                    *esc = Escape::None;
                    self.flush_surrogate(out);
                    out.push(match c {
                        'n' => '\n',
                        't' => '\t',
                        'r' => '\r',
                        'b' => '\u{8}',
                        'f' => '\u{c}',
                        other => other,
                    });
                }
            }
            Escape::Unicode(digits) => {
                digits.push(c);
                if digits.chars().count() < 4 {
                    return;
                }
                let code = u32::from_str_radix(digits, 16).ok();
                *esc = Escape::None;
                self.unicode_unit(code, out);
            }
        }
    }

    /// A lone high surrogate that never got its partner becomes U+FFFD.
    fn flush_surrogate(&mut self, out: &mut String) {
        if self.high_surrogate.take().is_some() {
            out.push('\u{fffd}');
        }
    }

    fn unicode_unit(&mut self, code: Option<u32>, out: &mut String) {
        let Some(code) = code else {
            self.flush_surrogate(out);
            out.push('\u{fffd}');
            return;
        };
        match (self.high_surrogate.take(), code) {
            (Some(high), 0xDC00..=0xDFFF) => {
                let c = 0x10000 + ((high - 0xD800) << 10) + (code - 0xDC00);
                out.push(char::from_u32(c).unwrap_or('\u{fffd}'));
            }
            (previous, 0xD800..=0xDBFF) => {
                if previous.is_some() {
                    out.push('\u{fffd}');
                }
                self.high_surrogate = Some(code);
            }
            (previous, _) => {
                if previous.is_some() {
                    out.push('\u{fffd}');
                }
                out.push(char::from_u32(code).unwrap_or('\u{fffd}'));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(pieces: &[&str]) -> String {
        let mut x = SummaryExtractor::new();
        pieces.iter().filter_map(|p| x.push(p)).collect()
    }

    fn split_everywhere(text: &str) -> Vec<String> {
        let mut outs = vec![run(&[text])];
        for (i, _) in text.char_indices().skip(1) {
            let (a, b) = text.split_at(i);
            outs.push(run(&[a, b]));
        }
        // One character at a time.
        let singles: Vec<String> = text.chars().map(String::from).collect();
        let refs: Vec<&str> = singles.iter().map(String::as_str).collect();
        outs.push(run(&refs));
        outs
    }

    #[test]
    fn table() {
        let cases: &[(&str, &str)] = &[
            (r#"{"summary":"hello"}"#, "hello"),
            (r#"{ "summary" : "hello world" , "x": 1}"#, "hello world"),
            (r#"{"a":1,"summary":"late"}"#, "late"),
            (
                r#"{"summary":"line\nbreak \"quoted\" back\\slash \/ \t"}"#,
                "line\nbreak \"quoted\" back\\slash / \t",
            ),
            (r#"{"summary":"café ✓"}"#, "caf\u{e9} \u{2713}"),
            (r#"{"summary":"smile 😀 end"}"#, "smile \u{1f600} end"),
            (r#"{"summary":"lone \ud83d x"}"#, "lone \u{fffd} x"),
            (r#"{"summary":"bad \uZZZZ"}"#, "bad \u{fffd}"),
            ("{\"summary\":\"ünï 日本\"}", "ünï 日本"),
            ("```json\n{\"summary\":\"fenced\"}\n```", "fenced"),
            (
                "Sure! Here you go:\n```json\n{\"summary\":\"chatty\"}",
                "chatty",
            ),
            (r#"{"other":"summary","summary":"real"}"#, "real"),
            (r#"{"notes":{"summary":"nested"},"summary":"top"}"#, "top"),
            (
                r#"{"items":["a","summary"],"summary":"after list"}"#,
                "after list",
            ),
            (
                r#"{"x":"a \"summary\": \"fake\"","summary":"real"}"#,
                "real",
            ),
            (r#"{"summary":"stops","summary":"second"}"#, "stops"),
            (r#"{"summary":"cut off"#, "cut off"),
            (r#"{"other":"x"}"#, ""),
            (r#"{"summary":null,"a":"b"}"#, ""),
            (r#"{"summary":""}"#, ""),
        ];
        for (input, want) in cases {
            for (i, got) in split_everywhere(input).iter().enumerate() {
                assert_eq!(got, want, "input {input:?} variant {i}");
            }
        }
    }

    #[test]
    fn yields_only_new_text_and_stops() {
        let mut x = SummaryExtractor::new();
        assert_eq!(x.push("{\"sum"), None);
        assert_eq!(x.push("mary\": \"ab"), Some("ab".into()));
        assert_eq!(x.push("c\\u00"), Some("c".into()));
        assert_eq!(x.push("e9\"}"), Some("\u{e9}".into()));
        assert!(x.is_done());
        assert_eq!(x.push(", \"summary\": \"again\""), None);
    }
}
