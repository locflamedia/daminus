import { describe, expect, it } from 'vitest'
import type { Item } from '@/api'
import { counts, diskItem, mainIssue, report, server } from '@/testing/report-fixture'
import { sceneFromReport } from './scene-from-report'

const hostsOf = (n: number) => Array.from({ length: n }, (_, i) => server(`h${i + 1}`))

describe('sceneFromReport', () => {
  it('is empty without a report and keeps the aliases', () => {
    const scene = sceneFromReport(null, ['a', 'b'])
    expect(scene).toEqual({
      hosts: ['a', 'b'],
      issues: { crit: 0, warn: 0, disk: 0 },
      dunes: [],
      stars: [],
    })
  })

  it.each([0, 1, 5, 7])('gives one dune and one star for each of %i hosts', (n) => {
    const scene = sceneFromReport(report({ servers: hostsOf(n) }), [])
    expect(scene.dunes).toHaveLength(n)
    expect(scene.stars).toHaveLength(n)
    expect(scene.stars.every((s) => s.label === '' && s.level === 'ok')).toBe(true)
  })

  it('counts the report issues and the disk ones among them', () => {
    const warnDisk: Item = {
      ...diskItem('h1', 87),
      severity: { level: 'warn' },
    }
    const expected: Item = {
      ...diskItem('h2', 95),
      severity: { level: 'crit' },
      disposition: { kind: 'expected', rule: 'r' },
    }
    const scene = sceneFromReport(
      report({
        servers: hostsOf(2),
        items: [warnDisk, expected],
        counts: counts({ crit: 2, warn: 3 }),
      }),
      [],
    )
    expect(scene.issues).toEqual({ crit: 2, warn: 3, disk: 1 })
  })

  it('takes the fullest filesystem and labels a disk issue', () => {
    const scene = sceneFromReport(
      report({
        servers: [
          server('h1', {
            level: 'warn',
            counts: counts({ warn: 1 }),
            main_issue: {
              ...mainIssue('disk.fs'),
              key: { host: 'h1', check: 'disk.fs', target: '/' },
            },
          }),
        ],
        items: [diskItem('h1', 60, '/data'), diskItem('h1', 86.6, '/')],
      }),
      [],
    )
    expect(scene.dunes).toEqual([{ name: 'h1', pct: 87, level: 'warn' }])
    expect(scene.stars).toEqual([{ name: 'h1', label: 'disk 87%', level: 'warn' }])
  })

  it('labels other findings by count and worst level', () => {
    const scene = sceneFromReport(
      report({
        servers: [
          server('a', { level: 'crit', counts: counts({ crit: 2, warn: 1 }) }),
          server('b', { level: 'warn', counts: counts({ warn: 1 }) }),
          server('c', { level: 'warn', counts: counts({ warn: 3 }) }),
        ],
      }),
      [],
    )
    expect(scene.stars.map((s) => [s.label, s.level])).toEqual([
      ['2 critical', 'crit'],
      ['1 warning', 'warn'],
      ['3 warnings', 'warn'],
    ])
    expect(scene.dunes.map((d) => d.pct)).toEqual([null, null, null])
  })

  it('marks a host that did not answer as offline without a reading', () => {
    const scene = sceneFromReport(
      report({
        servers: [
          server('down', {
            level: 'crit',
            outcome: { state: 'unreachable', cause: 'connect_timeout' },
            counts: counts({ crit: 1 }),
          }),
        ],
        items: [diskItem('down', 91)],
      }),
      [],
    )
    expect(scene.dunes).toEqual([{ name: 'down', pct: null, level: 'offline' }])
    expect(scene.stars).toEqual([{ name: 'down', label: '', level: 'offline' }])
  })

  it('does not change the report it reads', () => {
    const r = report({ servers: hostsOf(2) })
    const copy = structuredClone(r)
    sceneFromReport(r, ['x'])
    expect(r).toEqual(copy)
  })
})
