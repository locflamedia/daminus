//! Limits and cleaning for everything a server sends back. A compromised
//! server may send huge, binary or terminal-escaped output; it is bounded and
//! scrubbed here before it is parsed, stored or shown.

use serde_json::Value;

/// Longest NDJSON line accepted; longer lines are dropped and counted.
pub const MAX_LINE_BYTES: usize = 64 * 1024;
/// Most output read from one host per scan.
pub const MAX_HOST_BYTES: usize = 8 * 1024 * 1024;
/// Most facts kept from one host per scan.
pub const MAX_HOST_FACTS: usize = 2_000;
/// Longest array kept anywhere inside a fact's `data`.
pub const MAX_DATA_ARRAY: usize = 20;

/// Decodes a line as UTF-8 (invalid bytes become U+FFFD) and removes ANSI
/// escape sequences, C0/C1 control characters (tab and newline included, as
/// a line holds neither) and bidirectional overrides.
pub fn clean_line(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            skip_escape(&mut chars);
            continue;
        }
        if !is_banned(c) {
            out.push(c);
        }
    }
    out
}

/// Skips the rest of an escape sequence after ESC: CSI (`ESC [ … final`), OSC
/// (`ESC ] … BEL` or `ESC \`) or a single following character.
fn skip_escape(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) {
    match chars.next() {
        Some('[') => {
            for c in chars.by_ref() {
                if ('\u{40}'..='\u{7e}').contains(&c) {
                    break;
                }
            }
        }
        Some(']') => {
            while let Some(c) = chars.next() {
                if c == '\u{7}' {
                    break;
                }
                if c == '\u{1b}' {
                    if chars.peek() == Some(&'\\') {
                        chars.next();
                    }
                    break;
                }
            }
        }
        _ => {}
    }
}

fn is_banned(c: char) -> bool {
    let cp = c as u32;
    cp < 0x20
        || cp == 0x7f
        || (0x80..=0x9f).contains(&cp)
        || matches!(c, '\u{200e}' | '\u{200f}' | '\u{061c}')
        || ('\u{202a}'..='\u{202e}').contains(&c)
        || ('\u{2066}'..='\u{2069}').contains(&c)
}

/// Cuts every array inside `value` to [`MAX_DATA_ARRAY`] items, recursively.
pub fn cap_arrays(value: &mut Value) {
    match value {
        Value::Array(items) => {
            items.truncate(MAX_DATA_ARRAY);
            items.iter_mut().for_each(cap_arrays);
        }
        Value::Object(map) => map.values_mut().for_each(cap_arrays),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn clean_line_table() {
        let cases: &[(&[u8], &str)] = &[
            (b"{\"check\":\"sys.load\"}", "{\"check\":\"sys.load\"}"),
            (b"red \x1b[31mtext\x1b[0m end", "red text end"),
            (b"title \x1b]0;pwned\x07 after", "title  after"),
            (b"osc \x1b]8;;http://x\x1b\\link", "osc link"),
            (b"nul\x00 bell\x07 del\x7f tab\t", "nul bell del tab"),
            (b"bad \xff\xfe utf8", "bad \u{fffd}\u{fffd} utf8"),
            ("c1 \u{85}\u{9b}x".as_bytes(), "c1 x"),
            (
                "bidi \u{202e}evil\u{202c} \u{2066}x\u{2069}\u{200f}".as_bytes(),
                "bidi evil x",
            ),
            ("tiếng việt ✓".as_bytes(), "tiếng việt ✓"),
        ];
        for (input, want) in cases {
            assert_eq!(clean_line(input), *want, "{input:?}");
        }
    }

    #[test]
    fn arrays_capped_recursively() {
        let big: Vec<u32> = (0..50).collect();
        let mut v = json!({"top": big, "nested": {"list": [big.clone()]}, "n": 3});
        cap_arrays(&mut v);
        assert_eq!(v["top"].as_array().map(Vec::len), Some(MAX_DATA_ARRAY));
        assert_eq!(
            v["nested"]["list"][0].as_array().map(Vec::len),
            Some(MAX_DATA_ARRAY)
        );
        assert_eq!(v["n"], 3);
    }
}
