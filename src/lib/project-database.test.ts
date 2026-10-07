import { describe, expect, it } from 'vitest'
import type { Item } from '@/api'
import {
  biggestStep,
  dbProblem,
  growingTable,
  listEnvCommand,
  parseDb,
  sudoRuleLine,
  tableRows,
  tryLoginCommand,
} from './project-database'

const item = (fact: Item['fact'], severity: Item['severity'] = { level: 'info' }): Item =>
  ({ key: { host: 'h', check: 'db.size', target: 'shop' }, severity, fact }) as Item

describe('database reading', () => {
  it('reads engine, size, tables and the largest tables', () => {
    const v = parseDb(
      item({
        check: 'db.size',
        target: 'shop',
        value: 2000,
        data: {
          engine: 'mysql',
          tables: 7,
          top: [
            ['orders', 1500],
            ['users', 300],
          ],
        },
      }),
    )
    expect(v).toMatchObject({ engine: 'mysql', size: 2000, tables: 7 })
    expect(v?.top).toEqual([
      { name: 'orders', bytes: 1500 },
      { name: 'users', bytes: 300 },
    ])
  })

  it('has no view when the check could not answer', () => {
    expect(parseDb(item({ check: 'db.size', target: 'shop', unknown: 'needs_perm' }))).toBeNull()
  })

  it('scales table bars to the largest and compares with the previous scan', () => {
    const rows = tableRows(
      [
        { name: 'orders', bytes: 800 },
        { name: 'users', bytes: 200 },
        { name: 'new', bytes: 10 },
      ],
      new Map([
        ['orders', 500],
        ['users', 210],
      ]),
    )
    expect(rows.map((r) => r.share)).toEqual([1, 0.25, 0.0125])
    expect(rows.map((r) => r.delta)).toEqual([300, -10, null])
    expect(growingTable(rows)).toBe('orders')
  })

  it('names no growing table when nothing grew', () => {
    const rows = tableRows([{ name: 'a', bytes: 5 }], new Map([['a', 5]]))
    expect(growingTable(rows)).toBeNull()
  })

  it('finds the biggest step between scans', () => {
    const points = [1, 2, 9, 10].map((value, i) => ({ seq: i + 1, at: '', value }))
    expect(biggestStep(points)).toEqual({ seq: 3, bytes: 7 })
    expect(biggestStep([{ seq: 1, at: '', value: 3 }])).toBeNull()
  })
})

describe('unreadable database states', () => {
  const unknown = (reason: 'needs_perm' | 'timeout' | 'unsupported' | 'missing' | 'unreachable') =>
    dbProblem(item(undefined, { level: 'unknown', reason }))

  it('maps each unknown reason to its state', () => {
    expect(unknown('needs_perm')).toBe('permission')
    expect(unknown('unsupported')).toBe('unsupported')
    expect(unknown('missing')).toBe('missing')
    expect(unknown('timeout')).toBe('refused')
    expect(unknown('unreachable')).toBe('refused')
  })

  it('has no problem for a result that answered', () => {
    expect(dbProblem(item(undefined))).toBeNull()
  })
})

describe('database commands', () => {
  it('builds read-only commands for plain names', () => {
    expect(listEnvCommand('db-main', '/srv/booking/.env')).toBe(
      'ssh db-main "ls -l /srv/booking/.env"',
    )
    expect(sudoRuleLine('/srv/booking/.env')).toContain('/usr/bin/cat /srv/booking/.env')
    expect(tryLoginCommand('db-main', 'postgres')).toContain('psql')
    expect(tryLoginCommand('db-main', 'mysql')).toContain('mysql')
  })

  it('refuses a path that could carry shell syntax', () => {
    expect(listEnvCommand('db', '/srv/$(id)/.env')).toBeNull()
    expect(sudoRuleLine('/srv/a b/.env')).toBeNull()
    expect(tryLoginCommand('db; reboot', 'mysql')).toBeNull()
  })
})
