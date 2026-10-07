import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UrlCheck } from '@/api'
import {
  PROBE_DELAY_MS,
  type ProbeState,
  createUrlProbe,
  isProbeable,
  tlsTone,
  verdictOf,
} from './sheet-url-probe'

const OK: UrlCheck = { status: 200, ms: 120, tls_days: 61, failure: null }

function setup(answer: (url: string) => Promise<UrlCheck>) {
  const states: ProbeState[] = []
  const check = vi.fn(answer)
  const probe = createUrlProbe(check, (s) => states.push(s))
  return { probe, check, states, last: () => states.at(-1) }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('isProbeable', () => {
  it.each([
    ['https://tiemtra.vn', true],
    ['  http://localhost:3000/x ', true],
    ['', false],
    ['ftp://tiemtra.vn', false],
    ['tiemtra.vn', false],
    ['https://', false],
    ['https://a b.vn', false],
  ])('%j -> %s', (url, expected) => expect(isProbeable(url)).toBe(expected))
})

describe('tlsTone and verdictOf', () => {
  it('turns amber under 21 days and red once expired', () => {
    expect(tlsTone(61)).toBe('ok')
    expect(tlsTone(21)).toBe('ok')
    expect(tlsTone(20)).toBe('warn')
    expect(tlsTone(0)).toBe('warn')
    expect(tlsTone(-3)).toBe('crit')
  })

  it('reads 2xx and 3xx as up, other codes as a bad answer, no code as a failure', () => {
    expect(verdictOf({ ...OK, status: 301 }).kind).toBe('up')
    expect(verdictOf({ ...OK, status: 503 })).toMatchObject({ kind: 'status', status: 503 })
    expect(verdictOf({ status: null, ms: null, tls_days: null, failure: 'dns' })).toEqual({
      kind: 'failed',
      failure: 'dns',
    })
  })
})

describe('createUrlProbe', () => {
  it('waits for 600 ms of rest, then asks once', async () => {
    const { probe, check, last } = setup(() => Promise.resolve(OK))
    probe.input('https://a.vn')
    probe.input('https://a.vn/x')
    await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS - 1)
    expect(check).not.toHaveBeenCalled()
    expect(last()).toEqual({ kind: 'wait', previous: null })
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledOnce()
    expect(check).toHaveBeenCalledWith('https://a.vn/x')
    expect(last()).toEqual({ kind: 'done', check: OK })
  })

  it('asks for nothing when the text is empty or not a web address', async () => {
    const { probe, check, last } = setup(() => Promise.resolve(OK))
    probe.input('')
    probe.input('ftp://x.vn')
    await vi.advanceTimersByTimeAsync(2000)
    expect(check).not.toHaveBeenCalled()
    expect(last()).toEqual({ kind: 'idle' })
  })

  it('does not ask again for the same text', async () => {
    const { probe, check } = setup(() => Promise.resolve(OK))
    probe.input('https://a.vn')
    await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS)
    probe.input('https://a.vn')
    probe.input(' https://a.vn ')
    await vi.advanceTimersByTimeAsync(2000)
    expect(check).toHaveBeenCalledOnce()
  })

  it('keeps the last answer, faded, while the next text rests', async () => {
    const { probe, last } = setup(() => Promise.resolve(OK))
    probe.input('https://a.vn')
    await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS)
    probe.input('https://b.vn')
    expect(last()).toEqual({ kind: 'wait', previous: OK })
  })

  it('has one request in flight and drops an answer for text that was replaced', async () => {
    const pending: Array<(c: UrlCheck) => void> = []
    const { probe, check, last } = setup(() => new Promise<UrlCheck>((r) => pending.push(r)))
    probe.input('https://a.vn')
    await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS)
    probe.input('https://b.vn')
    await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS)
    // The second text is due but the first request has not come back.
    expect(check).toHaveBeenCalledTimes(1)
    pending[0]?.({ ...OK, status: 500 })
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(2)
    expect(check).toHaveBeenLastCalledWith('https://b.vn')
    pending[1]?.(OK)
    await vi.advanceTimersByTimeAsync(0)
    expect(last()).toEqual({ kind: 'done', check: OK })
  })

  it('does not fire the queued text before its own rest is over', async () => {
    const pending: Array<(c: UrlCheck) => void> = []
    const { probe, check } = setup(() => new Promise<UrlCheck>((r) => pending.push(r)))
    probe.input('https://a.vn')
    await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS)
    probe.input('https://b.vn')
    pending[0]?.(OK)
    await vi.advanceTimersByTimeAsync(100)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('shows a failed call as a failure, and says nothing after stop', async () => {
    const { probe, last } = setup(() => Promise.reject(new Error('ipc')))
    probe.input('https://a.vn')
    await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS)
    expect(last()).toMatchObject({ kind: 'done', check: { failure: 'other' } })
    const quiet = setup(() => Promise.resolve(OK))
    quiet.probe.input('https://a.vn')
    quiet.probe.stop()
    await vi.advanceTimersByTimeAsync(2000)
    expect(quiet.check).not.toHaveBeenCalled()
  })
})
