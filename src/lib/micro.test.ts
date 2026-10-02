import { describe, expect, it } from 'vitest'
import { badgeText, deltaPill, isStale, matchParts, middleEllipsis, sslTone } from './micro'

describe('middleEllipsis', () => {
  it('returns a path that fits as it is', () => {
    expect(middleEllipsis('/var/www/app', 28)).toBe('/var/www/app')
  })

  it('keeps the root and the leaf, as on the board', () => {
    expect(middleEllipsis('/var/www/kho-hang/storage/logs', 28)).toBe('/var/www/…/storage/logs')
  })

  it('shrinks root and leaf one segment at a time', () => {
    const path = '/srv/projects/kho-hang/releases/2026/shared/storage/logs'
    expect(middleEllipsis(path, 30)).toBe('/srv/projects/…/storage/logs')
    expect(middleEllipsis(path, 19)).toBe('/srv/…/storage/logs')
    expect(middleEllipsis(path, 15)).toBe('/srv/…/logs')
    expect(middleEllipsis(path, 9)).toBe('/…/logs')
  })

  it('shortens the leaf from the front as a last resort', () => {
    const text = middleEllipsis('/a/b/c/d/laravel-2026-09-26-very-long-name.log', 14)
    expect(text.length).toBeLessThanOrEqual(14)
    expect(text.startsWith('…/')).toBe(true)
    expect(text.endsWith('.log')).toBe(true)
  })

  it('works on a relative path', () => {
    expect(middleEllipsis('storage/app/public/uploads/2026/09', 21)).toBe('storage/app/…/2026/09')
  })
})

describe('deltaPill', () => {
  it('shows direction by arrow and meaning by tone: up is bad for size', () => {
    expect(deltaPill(1.1, 'up')).toEqual({ direction: 'up', tone: 'warn' })
    expect(deltaPill(-0.6, 'up')).toEqual({ direction: 'down', tone: 'ok' })
  })

  it('treats up as good when more is better (free space)', () => {
    expect(deltaPill(2, 'down')).toEqual({ direction: 'up', tone: 'ok' })
    expect(deltaPill(-2, 'down')).toEqual({ direction: 'down', tone: 'warn' })
  })

  it('can name the bad direction critical', () => {
    expect(deltaPill(5, 'up', 'crit')).toEqual({ direction: 'up', tone: 'crit' })
  })

  it('is flat and neutral at zero', () => {
    expect(deltaPill(0)).toEqual({ direction: 'flat', tone: 'neutral' })
    expect(deltaPill(Number.NaN)).toEqual({ direction: 'flat', tone: 'neutral' })
  })
})

describe('sslTone', () => {
  it.each([
    [41, 'ok'],
    [14, 'ok'],
    [13, 'warn'],
    [3, 'warn'],
    [2, 'crit'],
    [-4, 'crit'],
  ] as const)('%i days is %s', (days, tone) => {
    expect(sslTone(days)).toBe(tone)
  })
})

describe('isStale', () => {
  const now = Date.parse('2026-09-26T12:00:00Z')
  it('turns after 24 hours', () => {
    expect(isStale('2026-09-26T11:58:00Z', now)).toBe(false)
    expect(isStale('2026-09-25T12:00:01Z', now)).toBe(false)
    expect(isStale('2026-09-25T11:59:59Z', now)).toBe(true)
    expect(isStale('2026-09-23T12:00:00Z', now)).toBe(true)
  })

  it('does not call an unreadable time stale', () => {
    expect(isStale('not a date', now)).toBe(false)
  })
})

describe('badgeText', () => {
  it('hides at zero and caps at 99+', () => {
    expect(badgeText(0)).toBeNull()
    expect(badgeText(-1)).toBeNull()
    expect(badgeText(1)).toBe('1')
    expect(badgeText(42)).toBe('42')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
    expect(badgeText(4000)).toBe('99+')
  })
})

describe('matchParts', () => {
  it('splits around the first match, case aside', () => {
    expect(matchParts('kho-hang', 'KHO')).toEqual([
      { text: 'kho', match: true },
      { text: '-hang', match: false },
    ])
    expect(matchParts('Scan kho-hang', 'kho')).toEqual([
      { text: 'Scan ', match: false },
      { text: 'kho', match: true },
      { text: '-hang', match: false },
    ])
  })

  it('returns the whole text when there is nothing to match', () => {
    expect(matchParts('kho-hang', '')).toEqual([{ text: 'kho-hang', match: false }])
    expect(matchParts('kho-hang', 'zzz')).toEqual([{ text: 'kho-hang', match: false }])
  })

  it('keeps markup characters as text', () => {
    expect(matchParts('<b>x</b>', '<b>')[0]).toEqual({ text: '<b>', match: true })
  })
})
