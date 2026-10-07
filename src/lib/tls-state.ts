// The certificate of a URL as a chip and a detail line. The core grades `url.tls` (days left,
// with expired / untrusted / mismatch each forcing critical) and keeps the days even when the
// certificate is expired or refused, so this only reads the fact: nothing is re-graded here.
import type { Item } from '@/api'
import type { IconName } from '@/ui/icon-paths'

export type TlsFlag = 'expired' | 'untrusted' | 'mismatch'
export type TlsTone = 'ok' | 'warn' | 'crit' | 'idle'

/** Why no certificate was read; `url.tls` names it in `data.error`. */
export type TlsReason = 'dns' | 'no_route' | 'refused' | 'timeout' | 'tls' | 'other'

export interface TlsState {
  tone: TlsTone
  icon: IconName
  /** Days left; negative once expired; `null` when no certificate was read. */
  days: number | null
  flags: TlsFlag[]
  /** Set when nothing was read. */
  reason: TlsReason | null
  /** `notAfter` as unix seconds, when the certificate was read. */
  notAfter: number | null
}

const REASONS: readonly TlsReason[] = ['dns', 'no_route', 'refused', 'timeout', 'tls']

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function reasonOf(error: unknown): TlsReason {
  return REASONS.find((r) => r === error) ?? 'other'
}

/** The state of one `url.tls` item. `undefined` (no such result yet) reads as not checked. */
export function tlsState(item: Item | undefined): TlsState {
  const fact = item?.fact
  const data = record(fact?.data)
  const days = typeof fact?.value === 'number' && Number.isFinite(fact.value) ? fact.value : null
  if (!item || days === null || fact?.unknown) {
    return {
      tone: 'idle',
      icon: 'circle',
      days: null,
      flags: [],
      reason: item ? reasonOf(data.error ?? fact?.unknown) : 'other',
      notAfter: null,
    }
  }
  const flags: TlsFlag[] = []
  if (data.expired === true || days < 0) flags.push('expired')
  if (data.untrusted === true) flags.push('untrusted')
  if (data.mismatch === true) flags.push('mismatch')
  const level = item.severity.level
  const tone: TlsTone =
    flags.length > 0 || level === 'crit' ? 'crit' : level === 'warn' ? 'warn' : 'ok'
  const first = flags[0]
  const icon: IconName =
    first === 'expired'
      ? 'close'
      : first === 'untrusted'
        ? 'shield'
        : first === 'mismatch'
          ? 'warn'
          : tone === 'warn'
            ? 'clock'
            : tone === 'crit'
              ? 'close'
              : 'check'
  return {
    tone,
    icon,
    days,
    flags,
    reason: null,
    notAfter: typeof data.not_after === 'number' ? data.not_after : null,
  }
}

/** Whole days shown on the chip, rounded toward zero so −4.6 reads −4 and 11.9 reads 11. */
export function wholeDays(days: number): number {
  return Math.trunc(days)
}

/**
 * The words of the chip, in the order the board gives them: the days first when they say
 * something (certificate fine, near its end, or expired), then each flag. A certificate that
 * is only untrusted or only for another name leads with the flag, with no number.
 */
export function chipParts(state: TlsState): { days: number | null; flags: TlsFlag[] } {
  if (state.days === null) return { days: null, flags: [] }
  const showDays = state.flags.length === 0 || state.flags.includes('expired')
  return {
    days: showDays ? wholeDays(state.days) : null,
    flags: state.flags.filter((f) => f !== 'expired'),
  }
}
