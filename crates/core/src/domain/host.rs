//! Host identity. Every place that names a host goes through [`HostAlias`], so
//! a value that could turn into an `ssh` option (`-oProxyCommand=…`) or a
//! token (`%h`) can never be built.

use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Longest alias accepted; real `~/.ssh/config` aliases are far shorter.
pub const MAX_ALIAS_LEN: usize = 253;

/// A `Host` alias from `~/.ssh/config`: `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, type = "string"))]
pub struct HostAlias(String);

/// Why a string is not a valid [`HostAlias`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum HostAliasError {
    #[error("host alias is empty")]
    Empty,
    #[error("host alias is too long")]
    TooLong,
    #[error("host alias must start with a letter or digit")]
    BadStart,
    #[error("host alias may only contain letters, digits, '.', '_' and '-'")]
    BadChar,
}

impl HostAlias {
    pub fn parse(s: &str) -> Result<Self, HostAliasError> {
        let mut chars = s.chars();
        let first = chars.next().ok_or(HostAliasError::Empty)?;
        if s.len() > MAX_ALIAS_LEN {
            return Err(HostAliasError::TooLong);
        }
        if !first.is_ascii_alphanumeric() {
            return Err(HostAliasError::BadStart);
        }
        if !chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) {
            return Err(HostAliasError::BadChar);
        }
        Ok(Self(s.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for HostAlias {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Serialize for HostAlias {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for HostAlias {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(d)?;
        HostAlias::parse(&raw).map_err(|e| serde::de::Error::custom(format!("{e}: {raw:?}")))
    }
}

/// Where a fact was measured: a server alias, or `@local` for probes run from
/// this Mac. `@` is not allowed in an alias, so the two can never collide.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, type = "string"))]
pub enum HostRef {
    Local,
    Alias(HostAlias),
}

impl HostRef {
    pub const LOCAL: &'static str = "@local";

    pub fn parse(s: &str) -> Result<Self, HostAliasError> {
        if s == Self::LOCAL {
            Ok(HostRef::Local)
        } else {
            HostAlias::parse(s).map(HostRef::Alias)
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            HostRef::Local => Self::LOCAL,
            HostRef::Alias(a) => a.as_str(),
        }
    }

    pub fn alias(&self) -> Option<&HostAlias> {
        match self {
            HostRef::Local => None,
            HostRef::Alias(a) => Some(a),
        }
    }
}

impl From<HostAlias> for HostRef {
    fn from(a: HostAlias) -> Self {
        HostRef::Alias(a)
    }
}

impl fmt::Display for HostRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl Serialize for HostRef {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for HostRef {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(d)?;
        HostRef::parse(&raw).map_err(|e| serde::de::Error::custom(format!("{e}: {raw:?}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_aliases() {
        for ok in [
            "vps-a",
            "vps-sg-2",
            "db_main",
            "web.example.com",
            "10.0.0.5",
            "A",
        ] {
            assert!(HostAlias::parse(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn rejects_option_injection_tokens_and_spaces() {
        let cases = [
            ("", HostAliasError::Empty),
            ("-oProxyCommand=touch /tmp/x", HostAliasError::BadStart),
            ("-v", HostAliasError::BadStart),
            ("%h", HostAliasError::BadStart),
            ("vps%h", HostAliasError::BadChar),
            ("vps a", HostAliasError::BadChar),
            (" vps", HostAliasError::BadStart),
            ("vps\n", HostAliasError::BadChar),
            ("vps;rm", HostAliasError::BadChar),
            ("user@vps", HostAliasError::BadChar),
            ("@local", HostAliasError::BadStart),
            (".hidden", HostAliasError::BadStart),
            ("vps-ä", HostAliasError::BadChar),
        ];
        for (input, want) in cases {
            assert_eq!(HostAlias::parse(input), Err(want), "{input:?}");
        }
        assert_eq!(
            HostAlias::parse(&"a".repeat(254)),
            Err(HostAliasError::TooLong)
        );
    }

    #[test]
    fn deserializing_validates() {
        assert!(serde_json::from_str::<HostAlias>("\"-oProxyCommand=x\"").is_err());
        let a: HostAlias = serde_json::from_str("\"vps-a\"").unwrap();
        assert_eq!(a.as_str(), "vps-a");
    }

    #[test]
    fn host_ref_keeps_local_apart_from_aliases() {
        assert_eq!(HostRef::parse("@local").unwrap(), HostRef::Local);
        let r: HostRef = serde_json::from_str("\"vps-a\"").unwrap();
        assert_eq!(r.alias().map(HostAlias::as_str), Some("vps-a"));
        assert_eq!(
            serde_json::to_string(&HostRef::Local).unwrap(),
            "\"@local\""
        );
        assert!(HostRef::parse("@other").is_err());
    }
}
