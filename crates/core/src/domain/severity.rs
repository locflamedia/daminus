//! Severity of one evaluated check result.

use serde::{Deserialize, Serialize};

/// Why a check could not produce a real answer.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum UnknownReason {
    /// The SSH user lacks a permission (docker group, another user's crontab…).
    NeedsPerm,
    /// The check or the host ran out of time.
    Timeout,
    /// The host could not be reached (network, auth, host key).
    Unreachable,
    /// The thing to check is not there (no pm2, no docker, no .env).
    Missing,
    /// The server does not support the check (e.g. busybox).
    Unsupported,
}

/// A graded level produced by a severity rule. `Unknown` is never a rule output.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Level {
    Ok,
    Info,
    Warn,
    Crit,
}

/// Severity of a check result, as shown to the user.
///
/// Serialized as `{"level":"warn"}` or `{"level":"unknown","reason":"needs_perm"}`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "level", content = "reason", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Severity {
    Ok,
    Info,
    Warn,
    Crit,
    Unknown(UnknownReason),
}

impl Severity {
    /// Rank used by [`Severity::worst`]: ok < info < unknown < warn < crit.
    fn rank(self) -> u8 {
        match self {
            Severity::Ok => 0,
            Severity::Info => 1,
            Severity::Unknown(_) => 2,
            Severity::Warn => 3,
            Severity::Crit => 4,
        }
    }

    /// The most severe of the given values; `Ok` for an empty input.
    pub fn worst<I: IntoIterator<Item = Severity>>(items: I) -> Severity {
        items.into_iter().fold(
            Severity::Ok,
            |acc, s| if s.rank() > acc.rank() { s } else { acc },
        )
    }

    /// Warn or crit: something the user should look at.
    pub fn is_issue(self) -> bool {
        matches!(self, Severity::Warn | Severity::Crit)
    }

    /// The graded level, or `None` for unknown.
    pub fn level(self) -> Option<Level> {
        match self {
            Severity::Ok => Some(Level::Ok),
            Severity::Info => Some(Level::Info),
            Severity::Warn => Some(Level::Warn),
            Severity::Crit => Some(Level::Crit),
            Severity::Unknown(_) => None,
        }
    }
}

impl From<Level> for Severity {
    fn from(level: Level) -> Self {
        match level {
            Level::Ok => Severity::Ok,
            Level::Info => Severity::Info,
            Level::Warn => Severity::Warn,
            Level::Crit => Severity::Crit,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worst_orders_unknown_between_info_and_warn() {
        use Severity::*;
        let unknown = Unknown(UnknownReason::Timeout);
        let cases: &[(&[Severity], Severity)] = &[
            (&[], Ok),
            (&[Ok, Info], Info),
            (&[Info, unknown], unknown),
            (&[unknown, Warn], Warn),
            (&[Crit, Warn, unknown, Ok], Crit),
        ];
        for (input, want) in cases {
            assert_eq!(Severity::worst(input.iter().copied()), *want, "{input:?}");
        }
    }

    #[test]
    fn serializes_as_level_and_reason() {
        let s = serde_json::to_string(&Severity::Unknown(UnknownReason::NeedsPerm)).unwrap();
        assert_eq!(s, r#"{"level":"unknown","reason":"needs_perm"}"#);
        assert_eq!(
            serde_json::to_string(&Severity::Warn).unwrap(),
            r#"{"level":"warn"}"#
        );
        let back: Severity = serde_json::from_str(r#"{"level":"crit"}"#).unwrap();
        assert_eq!(back, Severity::Crit);
    }
}
