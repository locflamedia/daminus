// The live check of one URL row in the project sheet: wait for the typing to pause, ask once,
// drop an answer that is no longer about the text in the field. Pure and timer-driven so the
// rules can be tested without a window.
import type { UrlCheck, UrlFailure } from '@/api'

/** How long the field has to rest before the address is fetched. */
export const PROBE_DELAY_MS = 600

/** Under this many days of certificate the chip turns amber. */
export const TLS_WARN_DAYS = 21

export type ProbeState =
  | { kind: 'idle' }
  /** Typing has not rested yet; the last answer (if any) is still shown, faded. */
  | { kind: 'wait'; previous: UrlCheck | null }
  | { kind: 'busy' }
  | { kind: 'done'; check: UrlCheck }

/** Whether an address is worth fetching: `http` or `https` with a host. */
export function isProbeable(raw: string): boolean {
  const text = raw.trim()
  if (text === '' || /\s/.test(text)) return false
  try {
    const url = new URL(text)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
  } catch {
    return false
  }
}

export type TlsTone = 'ok' | 'warn' | 'crit'

/** `ok` with plenty of time, `warn` under three weeks, `crit` once it ran out. */
export function tlsTone(days: number): TlsTone {
  if (days < 0) return 'crit'
  return days < TLS_WARN_DAYS ? 'warn' : 'ok'
}

export type ProbeVerdict =
  | { kind: 'up'; status: number; ms: number | null }
  | { kind: 'status'; status: number; ms: number | null }
  | { kind: 'failed'; failure: UrlFailure }

/** What an answer says: it came back (2xx and 3xx are up), came back badly, or failed. */
export function verdictOf(check: UrlCheck): ProbeVerdict {
  if (check.status !== null) {
    const up = check.status >= 200 && check.status < 400
    return { kind: up ? 'up' : 'status', status: check.status, ms: check.ms }
  }
  return { kind: 'failed', failure: check.failure ?? 'other' }
}

export interface UrlProbe {
  /** The text of the field changed (or is set for the first time). */
  input: (url: string) => void
  /** The row is gone: no timer, no answer. */
  stop: () => void
}

/**
 * One probe per row. `check` is the command; `onState` receives every change of the state.
 * Rules: nothing is asked for an empty or invalid address; the same text is not asked twice
 * in a row; at most one request is in flight, and text typed meanwhile is asked for after it
 * settles; an answer for text that is no longer in the field is dropped.
 */
export function createUrlProbe(
  check: (url: string) => Promise<UrlCheck>,
  onState: (state: ProbeState) => void,
  delay = PROBE_DELAY_MS,
): UrlProbe {
  let wanted = ''
  /** The text the last answer (or the running request) belongs to. */
  let asked: string | null = null
  let last: UrlCheck | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let queued = false
  let stopped = false

  function clear() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function fire() {
    timer = null
    if (stopped) return
    if (inFlight) {
      queued = true
      return
    }
    const url = wanted
    asked = url
    inFlight = true
    onState({ kind: 'busy' })
    check(url)
      .catch((): UrlCheck => ({ status: null, ms: null, tls_days: null, failure: 'other' }))
      .then((answer) => {
        inFlight = false
        if (stopped) return
        if (url === wanted) {
          last = answer
          queued = false
          onState({ kind: 'done', check: answer })
        } else if (queued) {
          queued = false
          fire()
        }
      })
  }

  return {
    input(raw) {
      const url = raw.trim()
      if (url === wanted && (asked === url || timer !== null)) return
      wanted = url
      clear()
      if (!isProbeable(url)) {
        asked = null
        last = null
        queued = false
        onState({ kind: 'idle' })
        return
      }
      onState({ kind: 'wait', previous: last })
      timer = setTimeout(fire, delay)
    },
    stop() {
      stopped = true
      clear()
    },
  }
}
