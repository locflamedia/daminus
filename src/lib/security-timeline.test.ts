import { describe, expect, it } from 'vitest'
import { secItem } from '@/testing/security-items'
import { SECURITY_CHECKS } from './security-rows'
import { eventOf, lineGradient, timeline } from './security-timeline'

const clean = SECURITY_CHECKS.map((check) => secItem({ check }))
const at = '2026-09-22T06:41:00Z'

describe('timeline', () => {
  it('says all clean when every check answered with nothing found', () => {
    expect(eventOf({ seq: 9, at, items: clean })).toMatchObject({
      tone: 'ok',
      text: { key: 'allClean' },
    })
  })

  it('does not call a scan clean when no check of the project ran', () => {
    expect(eventOf({ seq: 9, at, items: [] }).text.key).toBe('notRun')
  })

  it('names the file that appeared first in a scan', () => {
    const php = secItem({
      check: 'sec.upload_php',
      target: '/srv/a/uploads/img_4471.php',
      level: { level: 'crit' },
      value: 1,
      delta: { kind: 'new' },
    })
    const e = eventOf({ seq: 10, at, items: [php, ...clean.slice(1)] })
    expect(e).toMatchObject({
      tone: 'crit',
      text: { key: 'uploadPhp', params: { file: 'img_4471.php' } },
      more: 0,
    })
  })

  it('leads with the most telling new finding and counts the others', () => {
    const php = secItem({
      check: 'sec.upload_php',
      target: '/a/uploads/x.php',
      level: { level: 'crit' },
      value: 1,
      delta: { kind: 'new' },
    })
    const exposed = secItem({
      check: 'url.exposed',
      target: 'https://a.test',
      level: { level: 'crit' },
      value: 1,
      delta: { kind: 'new' },
    })
    const e = eventOf({ seq: 12, at, items: [exposed, php] })
    expect(e.text.key).toBe('uploadPhp')
    expect(e.more).toBe(1)
  })

  it('says the findings are still open when nothing new came', () => {
    const php = secItem({
      check: 'sec.upload_php',
      target: '/a/uploads/x.php',
      level: { level: 'crit' },
      value: 1,
      delta: { kind: 'still', scans_open: 2 },
    })
    expect(eventOf({ seq: 11, at, items: [php] })).toMatchObject({
      text: { key: 'stillOpen', params: { n: 1 } },
    })
  })

  it('does not count an expected finding as open', () => {
    const exp = secItem({
      check: 'sec.upload_php',
      target: '/a/uploads/x.php',
      level: { level: 'crit' },
      value: 1,
      disposition: { kind: 'expected', rule: 'r' },
    })
    expect(eventOf({ seq: 11, at, items: [exp, ...clean.slice(0, 2)] }).tone).toBe('ok')
  })

  it('keeps the last four scans, oldest first', () => {
    const scans = [3, 1, 2, 5, 4, 6].map((seq) => ({ seq, at, items: clean }))
    expect(timeline(scans).map((e) => e.seq)).toEqual([3, 4, 5, 6])
  })

  it('draws the line through the tones of the events', () => {
    const colors = { ok: 'green', warn: 'amber', crit: 'pink', info: 'blue' }
    const events = timeline([1, 2].map((seq) => ({ seq, at, items: clean })))
    expect(lineGradient(events, colors)).toBe('linear-gradient(green 0%, green 100%)')
    expect(lineGradient([], colors)).toBe('transparent')
  })
})
