//! Reads the validity period of an X.509 certificate.
//!
//! `url.tls` has to report `notAfter` for certificates that no verifier
//! accepts (expired, self-signed, wrong name), so it cannot rely on a
//! verified chain. This reads only the two `Time` values of the
//! `TBSCertificate`; every length is checked against the bytes that remain, so
//! a malformed or hostile certificate gives `None`, never a panic.
//!
//! ```text
//! Certificate  ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signature }
//! tbsCertificate ::= SEQUENCE { [0] version OPTIONAL, serialNumber,
//!                     signature, issuer, validity, … }
//! validity     ::= SEQUENCE { notBefore Time, notAfter Time }
//! Time         ::= UTCTime (YYMMDDHHMMSSZ) | GeneralizedTime (YYYYMMDDHHMMSSZ)
//! ```

use time::{Date, Month, PrimitiveDateTime, Time};

const SEQUENCE: u8 = 0x30;
const VERSION: u8 = 0xa0;
const UTC_TIME: u8 = 0x17;
const GENERALIZED_TIME: u8 = 0x18;

/// When a certificate is valid, in seconds since the Unix epoch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Validity {
    pub not_before: i64,
    pub not_after: i64,
}

/// One DER element: its tag, its content and what follows it.
fn element(bytes: &[u8]) -> Option<(u8, &[u8], &[u8])> {
    let (&tag, rest) = bytes.split_first()?;
    let (&first, rest) = rest.split_first()?;
    let (len, rest) = if first < 0x80 {
        (usize::from(first), rest)
    } else {
        // Long form: up to four length bytes (DER needs the shortest form, but
        // a reader only has to stay inside the data).
        let n = usize::from(first & 0x7f);
        if n == 0 || n > 4 || rest.len() < n {
            return None;
        }
        let (len_bytes, rest) = rest.split_at(n);
        let len = len_bytes
            .iter()
            .fold(0_usize, |acc, b| (acc << 8) | usize::from(*b));
        (len, rest)
    };
    if rest.len() < len {
        return None;
    }
    let (content, after) = rest.split_at(len);
    Some((tag, content, after))
}

/// The validity period of a DER certificate.
pub fn validity(der: &[u8]) -> Option<Validity> {
    let (tag, cert, _) = element(der)?;
    if tag != SEQUENCE {
        return None;
    }
    let (tag, tbs, _) = element(cert)?;
    if tag != SEQUENCE {
        return None;
    }
    // [0] version (absent in v1), serialNumber, signature, issuer.
    let (first, _, mut rest) = element(tbs)?;
    if first == VERSION {
        rest = element(rest)?.2;
    }
    for _ in 0..2 {
        rest = element(rest)?.2;
    }
    let (tag, validity, _) = element(rest)?;
    if tag != SEQUENCE {
        return None;
    }
    let (not_before, after) = time(validity)?;
    let (not_after, _) = time(after)?;
    Some(Validity {
        not_before,
        not_after,
    })
}

fn time(bytes: &[u8]) -> Option<(i64, &[u8])> {
    let (tag, content, after) = element(bytes)?;
    let text = std::str::from_utf8(content).ok()?;
    let digits = text.strip_suffix('Z')?;
    if !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let (year, rest) = match tag {
        // RFC 5280: two-digit years 50–99 are 19xx, 00–49 are 20xx.
        UTC_TIME if digits.len() == 12 => {
            let yy: i32 = digits.get(..2)?.parse().ok()?;
            (
                if yy >= 50 { 1900 + yy } else { 2000 + yy },
                digits.get(2..)?,
            )
        }
        GENERALIZED_TIME if digits.len() == 14 => {
            (digits.get(..4)?.parse().ok()?, digits.get(4..)?)
        }
        _ => return None,
    };
    let field = |from: usize| -> Option<u8> { rest.get(from..from + 2)?.parse().ok() };
    let date = Date::from_calendar_date(year, Month::try_from(field(0)?).ok()?, field(2)?).ok()?;
    let time = Time::from_hms(field(4)?, field(6)?, field(8)?).ok()?;
    Some((
        PrimitiveDateTime::new(date, time)
            .assume_utc()
            .unix_timestamp(),
        after,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// DER of a tiny certificate-shaped structure: only the parts `validity`
    /// walks (version, serial, signature, issuer, validity).
    fn shaped(version: bool, not_before: &[u8], not_after: &[u8]) -> Vec<u8> {
        fn tlv(tag: u8, content: &[u8]) -> Vec<u8> {
            let mut out = vec![tag];
            if content.len() < 0x80 {
                out.push(content.len() as u8);
            } else {
                out.extend([0x82, (content.len() >> 8) as u8, content.len() as u8]);
            }
            out.extend(content);
            out
        }
        let mut tbs = Vec::new();
        if version {
            tbs.extend(tlv(VERSION, &tlv(0x02, &[2])));
        }
        tbs.extend(tlv(0x02, &[1])); // serialNumber
        tbs.extend(tlv(SEQUENCE, &[])); // signature
        tbs.extend(tlv(SEQUENCE, &[0; 200])); // issuer (long form length)
        let mut validity = tlv(UTC_TIME, not_before);
        validity.extend(match not_after.len() {
            15 => tlv(GENERALIZED_TIME, not_after),
            _ => tlv(UTC_TIME, not_after),
        });
        tbs.extend(tlv(SEQUENCE, &validity));
        tbs.extend(tlv(SEQUENCE, &[])); // subject
        tlv(SEQUENCE, &tlv(SEQUENCE, &tbs))
    }

    #[test]
    fn reads_both_time_forms_with_and_without_a_version() {
        for version in [true, false] {
            let der = shaped(version, b"260101000000Z", b"270101123045Z");
            assert_eq!(
                validity(&der),
                Some(Validity {
                    not_before: 1_767_225_600,
                    not_after: 1_798_806_645,
                }),
                "version {version}"
            );
        }
        // GeneralizedTime past 2049, and the two-digit-year pivot.
        let der = shaped(true, b"490101000000Z", b"20520101000000Z");
        let v = validity(&der).unwrap();
        assert_eq!(v.not_before, 2_493_072_000);
        assert_eq!(v.not_after, 2_587_680_000);
        let der = shaped(true, b"500101000000Z", b"260101000000Z");
        assert_eq!(validity(&der).unwrap().not_before, -631_152_000);
    }

    #[test]
    fn refuses_what_is_not_a_certificate_without_panicking() {
        let good = shaped(true, b"260101000000Z", b"270101000000Z");
        // Every truncation and every single-byte corruption is answered, never a panic.
        for cut in 0..good.len() {
            let _ = validity(&good[..cut]);
        }
        for i in 0..good.len() {
            for byte in [0x00, 0x7f, 0x80, 0x84, 0xff] {
                let mut bad = good.clone();
                bad[i] = byte;
                let _ = validity(&bad);
            }
        }
        for bad in [
            &b""[..],
            b"\x30",
            b"\x30\x80",
            b"\x30\x84\xff\xff\xff\xff",
            b"\x02\x01\x01",
            b"not a certificate",
        ] {
            assert_eq!(validity(bad), None, "{bad:?}");
        }
        // A time that is not a date (month 13, no Z, letters).
        for (a, b) in [
            (&b"261301000000Z"[..], &b"270101000000Z"[..]),
            (b"260101000000", b"270101000000Z"),
            (b"26010100000aZ", b"270101000000Z"),
            (b"260101000000Z", b"2701010000Z"),
        ] {
            assert_eq!(validity(&shaped(true, a, b)), None, "{a:?} {b:?}");
        }
    }
}
