//! Time values that cross the IPC and file boundaries.
//!
//! Timestamps are UTC instants written as RFC 3339 strings; dates are calendar
//! days written as `YYYY-MM-DD`. The core never reads the clock: callers pass
//! `now` in.

use serde::{Deserialize, Serialize};
use time::{Date, OffsetDateTime, UtcOffset};

/// A UTC instant, serialized as RFC 3339 (`2026-09-26T06:42:00Z`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, type = "string"))]
pub struct Timestamp(#[serde(with = "time::serde::rfc3339")] OffsetDateTime);

impl Timestamp {
    /// Wraps an instant, normalised to UTC.
    pub fn new(at: OffsetDateTime) -> Self {
        Self(at.to_offset(UtcOffset::UTC))
    }

    /// Builds a timestamp from Unix seconds. Out-of-range values clamp to the epoch.
    pub fn from_unix(secs: i64) -> Self {
        Self(OffsetDateTime::from_unix_timestamp(secs).unwrap_or(OffsetDateTime::UNIX_EPOCH))
    }

    pub fn inner(self) -> OffsetDateTime {
        self.0
    }

    pub fn unix(self) -> i64 {
        self.0.unix_timestamp()
    }

    /// The UTC calendar day of this instant.
    pub fn date(self) -> Day {
        Day(self.0.date())
    }
}

/// A calendar day, serialized as `YYYY-MM-DD`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, type = "string"))]
pub struct Day(#[serde(with = "day_format")] Date);

impl Day {
    pub fn new(date: Date) -> Self {
        Self(date)
    }

    pub fn inner(self) -> Date {
        self.0
    }

    /// The Monday of this day's ISO week.
    pub fn week_start(self) -> Self {
        let back = i64::from(self.0.weekday().number_days_from_monday());
        Self(self.0 - time::Duration::days(back))
    }

    /// The day `days` later; negative values go back.
    pub fn plus_days(self, days: i64) -> Self {
        Self(self.0.saturating_add(time::Duration::days(days)))
    }
}

mod day_format {
    use time::Date;
    use time::macros::format_description;

    const FORMAT: &[time::format_description::FormatItem<'static>] =
        format_description!("[year]-[month]-[day]");

    pub fn serialize<S: serde::Serializer>(date: &Date, s: S) -> Result<S::Ok, S::Error> {
        let text = date.format(FORMAT).map_err(serde::ser::Error::custom)?;
        s.serialize_str(&text)
    }

    pub fn deserialize<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Date, D::Error> {
        let text = <String as serde::Deserialize>::deserialize(d)?;
        Date::parse(&text, FORMAT).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::{date, datetime};

    #[test]
    fn timestamp_round_trips_as_utc_rfc3339() {
        let t = Timestamp::new(datetime!(2026-09-26 13:42 +07:00));
        let json = serde_json::to_string(&t).unwrap();
        assert_eq!(json, "\"2026-09-26T06:42:00Z\"");
        assert_eq!(serde_json::from_str::<Timestamp>(&json).unwrap(), t);
    }

    #[test]
    fn week_start_is_the_monday_of_the_iso_week() {
        let monday = Day::new(date!(2026 - 10 - 05));
        for offset in 0..7 {
            assert_eq!(monday.plus_days(offset).week_start(), monday);
        }
        assert_eq!(monday.plus_days(7).week_start(), monday.plus_days(7));
        // Across a year boundary: Thursday 1 January 2026 belongs to the week of 29 December.
        assert_eq!(
            Day::new(date!(2026 - 01 - 01)).week_start(),
            Day::new(date!(2025 - 12 - 29))
        );
    }

    #[test]
    fn day_round_trips_as_iso_date() {
        let d = Day::new(date!(2026 - 10 - 26));
        let json = serde_json::to_string(&d).unwrap();
        assert_eq!(json, "\"2026-10-26\"");
        assert_eq!(serde_json::from_str::<Day>(&json).unwrap(), d);
        assert!(serde_json::from_str::<Day>("\"26/10/2026\"").is_err());
    }
}
