import { describe, expect, it } from 'vitest'
import type { Item, Report } from '@/api'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import { diffReports } from './overview-changes'

const bundle = timeline as unknown as ResultsBundle
const latest = bundle.reports['12'] as Report
const before = bundle.reports['11'] as Report

function withItem(report: Report, match: (i: Item) => boolean, edit: (i: Item) => Item): Report {
  return { ...report, items: report.items.map((i) => (match(i) ? edit(i) : i)) }
}

describe('diffReports', () => {
  it('has nothing to say without a baseline', () => {
    expect(diffReports(latest, null)).toEqual([])
  })

  it('lists a new critical result first, with the issue to word', () => {
    const rows = diffReports(latest, before)
    const first = rows[0]
    expect(first?.tone === 'crit' || first?.tone === 'warn').toBe(true)
    expect(rows.every((r, i) => i === 0 || r.id !== rows[i - 1]?.id)).toBe(true)
  })

  it('reports a result the core marks fixed', () => {
    const isTls = (i: Item) => i.key.check === 'url.tls' && i.key.target === 'https://khohang.vn'
    const fixed = withItem(latest, isTls, (i) => ({ ...i, delta: { kind: 'fixed' } }))
    expect(diffReports(fixed, before).find((r) => r.kind === 'fixed')).toMatchObject({
      tone: 'ok',
      check: 'url.tls',
      owner: 'kho-hang',
    })
  })

  it('shows a renewed certificate once, not as renewed and fixed', () => {
    const rows = diffReports(latest, before).filter((r) => r.target === 'https://booking.vn')
    expect(rows.map((r) => r.kind)).toEqual(['renewed'])
  })

  it('reports a size that grew by a tenth or more, with the bytes it grew by', () => {
    const grown = withItem(
      latest,
      (i) => i.key.check === 'docker.df',
      (i) => ({ ...i, fact: { ...i.fact!, value: 1000 } }),
    )
    const was = withItem(
      grown,
      (i) => i.key.check === 'docker.df',
      (i) => ({ ...i, fact: { ...i.fact!, value: 500 } }),
    )
    const row = diffReports(grown, was).find((r) => r.kind === 'grew')
    expect(row).toMatchObject({ owner: 'vps-sg-2', check: 'docker.df', bytes: 500 })
  })

  it('ignores a size that moved less than a tenth', () => {
    const small = withItem(
      latest,
      (i) => i.key.check === 'disk.path',
      (i) => ({ ...i, fact: { ...i.fact!, value: (i.fact!.value ?? 0) * 1.02 } }),
    )
    expect(diffReports(small, latest).some((r) => r.kind === 'grew')).toBe(false)
  })

  it('names the table that grew most inside a database', () => {
    const edit = (factor: number) => (i: Item) => ({
      ...i,
      fact: {
        ...i.fact!,
        data: {
          ...(i.fact!.data as object),
          top: [
            ['orders', 1000 * factor],
            ['users', 500],
          ],
        },
      },
    })
    const now = withItem(
      latest,
      (i) => i.key.check === 'db.size' && i.key.target === 'tiemtra',
      edit(2),
    )
    const was = withItem(
      latest,
      (i) => i.key.check === 'db.size' && i.key.target === 'tiemtra',
      edit(1),
    )
    const row = diffReports(now, was).find((r) => r.kind === 'table')
    expect(row).toMatchObject({ owner: 'tiemtra', target: 'orders', bytes: 1000 })
  })

  it('reports an image that moved to another tag and ignores a registry port', () => {
    const tag = (image: string) => (i: Item) => ({
      ...i,
      fact: { ...i.fact!, data: { ...(i.fact!.data as object), services: [{ image }] } },
    })
    const isCompose = (i: Item) => i.key.check === 'docker.compose'
    const now = withItem(latest, isCompose, tag('tiemtra-api:1.5.0'))
    const was = withItem(latest, isCompose, tag('tiemtra-api:1.4.2'))
    expect(diffReports(now, was).find((r) => r.kind === 'image')).toMatchObject({
      target: 'tiemtra-api',
      from: '1.4.2',
      to: '1.5.0',
    })
    const port = withItem(latest, isCompose, tag('registry:5000/app'))
    expect(diffReports(port, port).some((r) => r.kind === 'image')).toBe(false)
  })

  it('reports a renewed certificate with the days it now has', () => {
    const days = (n: number) => (i: Item) => ({ ...i, fact: { ...i.fact!, value: n } })
    const isTls = (i: Item) => i.key.check === 'url.tls' && i.key.target === 'https://khohang.vn'
    const row = diffReports(
      withItem(latest, isTls, days(90)),
      withItem(latest, isTls, days(5)),
    ).find((r) => r.kind === 'renewed')
    expect(row).toMatchObject({ days: 90, tone: 'ok' })
  })

  it('reports a host that stopped answering or came back', () => {
    const down = {
      ...latest,
      servers: latest.servers.map((s) =>
        s.host === 'db-main' ? { ...s, outcome: { state: 'timeout' as const } } : s,
      ),
    }
    expect(diffReports(down, latest).find((r) => r.owner === 'db-main')).toMatchObject({
      kind: 'offline',
    })
    expect(diffReports(latest, down).find((r) => r.owner === 'db-main')).toMatchObject({
      kind: 'online',
    })
  })

  it('puts new problems before the good news', () => {
    const order = diffReports(latest, before).map((r) => r.kind)
    expect(order.indexOf('renewed')).toBeGreaterThan(order.indexOf('new'))
  })
})
