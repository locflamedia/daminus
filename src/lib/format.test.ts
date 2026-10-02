import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDate,
  formatDelta,
  formatDuration,
  formatMeasure,
  formatNumber,
  formatWhen,
} from './format'

const GB = 1024 ** 3
const MB = 1024 ** 2

describe('formatMeasure', () => {
  it('scales bytes and keeps three significant digits', () => {
    expect(formatMeasure(8.43 * GB, 'bytes', 'en').text).toBe('8.43 GB')
    expect(formatMeasure(186 * MB, 'bytes', 'en').text).toBe('186 MB')
    expect(formatMeasure(1.24 * GB, 'bytes', 'en').text).toBe('1.24 GB')
    expect(formatMeasure(512, 'bytes', 'en').text).toBe('512 B')
    expect(formatMeasure(0, 'bytes', 'en').text).toBe('0 B')
  })

  it('splits value and unit so the unit can be styled apart', () => {
    expect(formatMeasure(3.2 * GB, 'bytes', 'en')).toEqual({
      value: '3.2',
      unit: 'GB',
      text: '3.2 GB',
    })
  })

  it('writes percent without a space, milliseconds and counts as plain numbers', () => {
    expect(formatMeasure(92.4, '%', 'en').text).toBe('92%')
    expect(formatMeasure(212, 'ms', 'en').text).toBe('212 ms')
    expect(formatMeasure(3, 'count', 'en').text).toBe('3')
    expect(formatMeasure(1.84, 'load', 'en').text).toBe('1.84')
    expect(formatMeasure(7, null, 'en').text).toBe('7')
  })

  it('turns long latencies into seconds', () => {
    expect(formatMeasure(2400, 'ms', 'en').text).toBe('2.4 s')
  })

  it('names days and files per language', () => {
    expect(formatMeasure(74.31, 'days', 'en').text).toBe('74 d')
    expect(formatMeasure(3.5, 'days', 'vi').text).toBe('3,5 ngày')
    expect(formatMeasure(1240, 'files', 'en').text).toBe('1,240 files')
    expect(formatMeasure(1240, 'files', 'vi').text).toBe('1.240 file')
  })

  it('uses the locale decimal mark', () => {
    expect(formatMeasure(1.82 * GB, 'bytes', 'vi').text).toBe('1,82 GB')
    expect(formatNumber(14.8, 'vi')).toBe('14,8')
  })

  it('prints an unknown unit after the number', () => {
    expect(formatMeasure(4, 'req/s', 'en').text).toBe('4 req/s')
  })
})

describe('formatDelta', () => {
  it('always signs a change', () => {
    expect(formatDelta(1.1 * GB, 'bytes', 'en').text).toBe('+1.1 GB')
    expect(formatDelta(-0.4 * GB, 'bytes', 'en').text).toBe('-410 MB')
    expect(formatDelta(3, 'count', 'en').text).toBe('+3')
    expect(formatDelta(0, 'count', 'en').text).toBe('0')
  })
})

describe('formatDuration', () => {
  it('follows the boards: 212 ms, 0.8 s, 14.8 s, 37 min, 41 d', () => {
    expect(formatDuration(212, 'en')).toBe('212 ms')
    expect(formatDuration(800, 'en')).toBe('800 ms')
    expect(formatDuration(2400, 'en')).toBe('2.4 s')
    expect(formatDuration(14_800, 'en')).toBe('14.8 s')
    expect(formatDuration(37 * 60_000, 'en')).toBe('37 min')
    expect(formatDuration(5 * 3_600_000, 'en')).toBe('5 h')
    expect(formatDuration(41 * 86_400_000, 'en')).toBe('41 d')
  })

  it('reads in Vietnamese', () => {
    expect(formatDuration(14_800, 'vi')).toBe('14,8 giây')
    expect(formatDuration(37 * 60_000, 'vi')).toBe('37 phút')
  })
})

describe('dates and clock time', () => {
  const at = new Date(2026, 8, 26, 13, 42)

  it('uses a 24-hour clock', () => {
    expect(formatClock(at, 'en')).toBe('13:42')
    expect(formatClock(new Date(2026, 8, 26, 9, 5), 'vi')).toBe('09:05')
  })

  it('writes a day per language', () => {
    expect(formatDate(at, 'en')).toBe('Sep 26')
    expect(formatDate(at, 'vi')).toBe('26/9')
  })

  it('accepts an ISO timestamp from the core', () => {
    expect(formatClock(at.toISOString(), 'en')).toBe('13:42')
  })
})

describe('formatWhen', () => {
  const now = new Date(2026, 8, 26, 14, 0, 0)
  const ago = (ms: number) => new Date(now.getTime() - ms)

  it('is relative under an hour', () => {
    expect(formatWhen(ago(20_000), now, 'en')).toBe('just now')
    expect(formatWhen(ago(2 * 60_000), now, 'en')).toBe('2 min ago')
    expect(formatWhen(ago(2 * 60_000), now, 'vi')).toBe('2 phút trước')
  })

  it('is clock time later today, with an optional "today"', () => {
    const t = new Date(2026, 8, 26, 11, 58)
    expect(formatWhen(t, now, 'en')).toBe('11:58')
    expect(formatWhen(t, now, 'en', { withToday: true })).toBe('today 11:58')
    expect(formatWhen(t, now, 'vi', { withToday: true })).toBe('hôm nay 11:58')
  })

  it('names yesterday, then counts days', () => {
    expect(formatWhen(new Date(2026, 8, 25, 18, 40), now, 'en')).toBe('yesterday 18:40')
    expect(formatWhen(new Date(2026, 8, 25, 18, 40), now, 'vi')).toBe('hôm qua 18:40')
    expect(formatWhen(new Date(2026, 8, 23, 9, 0), now, 'en')).toBe('3 d ago')
    expect(formatWhen(new Date(2026, 8, 23, 9, 0), now, 'vi')).toBe('3 ngày trước')
  })

  it('counts calendar days, not 24-hour blocks', () => {
    const lateNow = new Date(2026, 8, 26, 0, 10)
    expect(formatWhen(new Date(2026, 8, 25, 22, 0), lateNow, 'en')).toBe('yesterday 22:00')
  })
})
