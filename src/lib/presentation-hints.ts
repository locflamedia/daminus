// The numbers that decide how loud a measured change is DRAWN (an amber delta, a growing
// tile's ring, a memory bar turning amber). They are presentation hints, not severities: the
// core grades every result (`evaluate`), and nothing here moves a count, a card level or a
// finding. Keeping them in one place keeps every screen drawing the same change the same way.

/** A size that grew by at least this share of what it was reads as a notable growth. */
export const GROWTH_SHARE = 0.1

/** Growth under this many bytes is not worth a row in a diff (folders, tables). */
export const MIN_ROW_GROWTH_BYTES = 10 * 1024 * 1024

/** Container memory at or above this share of its limit is drawn amber. */
export const MEMORY_HINT_PCT = 90

/** The disk fill the "reaches N% in about D days" forecast counts toward. */
export const DISK_FORECAST_LIMIT_PCT = 90

/** The Overview's "Coming up" list says a disk forecast only when it is this close. */
export const COMING_UP_HORIZON_DAYS = 60

/** A review or a certificate expiry this close is listed under "Coming up". */
export const COMING_UP_SOON_DAYS = 30

/** A certificate with fewer days left than this is drawn amber. */
export const CERT_WARN_DAYS = 21

/** Forecasts further away than this are not worth saying. */
export const FORECAST_HORIZON_DAYS = 365

/**
 * The limit a container is asked to be raised to when it keeps hitting its memory limit: this
 * many times the current one, rounded up to a whole step of memory. Only the sentence "so
 * raising the limit to N fits" uses it, and only when the host's free memory holds the rise.
 */
export const LIMIT_RAISE_FACTOR = 1.5

/** The steps (bytes) a raised memory limit is rounded up to. */
export const LIMIT_RAISE_STEP_BYTES = 64 * 1024 * 1024
