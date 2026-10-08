// The "Mark as expected" popover's choices and what Rust is asked to save. The rules the board
// states live here once: Never is not offered for a critical result or an accepted risk, a
// critical result is always bound to its evidence. Rust checks the same things again.
import type { CheckKey, Covers, ExpectedDraft, ExpectedReason, Item } from '@/api'

export type Review = '30' | '90' | 'never'

export interface ExpectedForm {
  reason: ExpectedReason
  covers: Covers
  review: Review
  note: string
}

export type MarkLevel = 'warn' | 'crit'

export const REASONS: readonly ExpectedReason[] = ['intended', 'accepted_risk', 'false_positive']
export const REVIEWS: readonly Review[] = ['30', '90', 'never']
export const MAX_NOTE = 200

/** The one check whose finding cannot be marked: a file that anyone can download is not "fine". */
const NEVER_MARKED = new Set(['url.exposed'])

export function startForm(): ExpectedForm {
  return { reason: 'intended', covers: 'as_it_is', review: '30', note: '' }
}

/** The level a result can be marked at, or `null` when it cannot be marked at all. */
export function markLevel(item: Item): MarkLevel | null {
  if (item.disposition.kind === 'expected') return null
  if (NEVER_MARKED.has(item.key.check)) return null
  const level = item.severity.level
  return level === 'warn' || level === 'crit' ? level : null
}

/** A critical result and an accepted risk both need a day to come back. */
export function needsDate(level: MarkLevel, reason: ExpectedReason): boolean {
  return level === 'crit' || reason === 'accepted_risk'
}

/** A critical result is always bound to its evidence. */
export function coversLocked(level: MarkLevel): boolean {
  return level === 'crit'
}

/** `form` with the board's rules applied after any change. */
export function settle(form: ExpectedForm, level: MarkLevel): ExpectedForm {
  return {
    ...form,
    covers: coversLocked(level) ? 'as_it_is' : form.covers,
    review: needsDate(level, form.reason) && form.review === 'never' ? '30' : form.review,
    note: form.note.slice(0, MAX_NOTE),
  }
}

export function reviewDays(review: Review): number | null {
  return review === 'never' ? null : Number(review)
}

/** The day the rule comes back, as Rust will set it (UTC date plus the period); `null` for Never. */
export function reviewDay(now: Date, review: Review): Date | null {
  const days = reviewDays(review)
  if (days === null) return null
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
}

export function toDraft(key: CheckKey, form: ExpectedForm, level: MarkLevel): ExpectedDraft {
  const ready = settle(form, level)
  return {
    host: key.host,
    check: key.check,
    target: key.target,
    reason: ready.reason,
    covers: ready.covers,
    review_days: reviewDays(ready.review),
    note: ready.note.trim(),
  }
}
