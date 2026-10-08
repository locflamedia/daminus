// The rarer states of the project tabs on top of the timeline (`?mock=tab-<case>`): Docker that
// needs permission, databases that cannot be read in each of their ways, a stopped pm2 app, a
// large log, a MySQL database with tables, results not re-checked, a host that did not answer.
import type { Item, Report } from '@/api'
import type { UnknownReason } from '@/api/bindings/UnknownReason'
import type { ResultsBundle } from './results-bundle'

type Data = ResultsBundle & { latest: number }

export const TAB_CASES = [
  'docker-perm',
  'db-refused',
  'db-unsupported',
  'db-missing',
  'pm2-stopped',
  'logs',
  'mysql',
  'stale',
  'unreachable',
  'neighbours',
] as const
export type TabCase = (typeof TAB_CASES)[number]

export function isTabCase(value: string): value is TabCase {
  return (TAB_CASES as readonly string[]).includes(value)
}

function unknown(item: Item, reason: UnknownReason) {
  item.severity = { level: 'unknown', reason }
  item.fact = { check: item.key.check, target: item.key.target, unknown: reason }
}

function find(items: Item[], check: string, host: string, target?: string) {
  return items.find(
    (i) =>
      i.key.check === check &&
      i.key.host === host &&
      (target === undefined || i.key.target === target),
  )
}

const EDITS: Record<TabCase, (report: Report) => Report> = {
  'docker-perm': (r) =>
    patch(r, (items) => {
      const c = find(items, 'docker.compose', 'vps-sg-2', 'tiemtra')
      if (c) unknown(c, 'needs_perm')
    }),
  'db-refused': (r) =>
    patch(r, (items) => {
      const d = find(items, 'db.size', 'vps-sg-2', 'tiemtra')
      if (d) unknown(d, 'timeout')
    }),
  'db-unsupported': (r) =>
    patch(r, (items) => {
      const d = find(items, 'db.size', 'vps-sg-2', 'tiemtra')
      if (d) unknown(d, 'unsupported')
    }),
  'db-missing': (r) =>
    patch(r, (items) => {
      const d = find(items, 'db.size', 'vps-sg-2', 'tiemtra')
      if (d) unknown(d, 'missing')
    }),
  'pm2-stopped': (r) =>
    patch(r, (items) => {
      const p = find(items, 'pm2.app', 'vps-sg-1', 'tiemtra-cron')
      if (!p?.fact) return
      p.severity = { level: 'crit' }
      p.fact = {
        ...p.fact,
        data: { status: 'stopped', daemon: true, restarts: 3, mem_mb: 0, instances: 1 },
      }
    }),
  logs: (r) =>
    patch(r, (items) => {
      const base = find(items, 'disk.path', 'vps-sg-1', '/srv/tiemtra-web')
      if (!base) return
      const target = '/srv/tiemtra-web/storage/logs/laravel-2026-09-25.log'
      items.push({
        ...base,
        key: { host: 'vps-sg-1', check: 'logs.big', target },
        group: 'disk',
        severity: { level: 'warn' },
        delta: { kind: 'new' },
        fact: {
          check: 'logs.big',
          target,
          value: 671_088_640,
          unit: 'bytes',
          data: { mtime: 1_790_300_000 },
        },
      })
      items.push({
        ...base,
        key: { host: 'vps-sg-1', check: 'docker.df', target: '' },
        severity: { level: 'info' },
        fact: {
          check: 'docker.df',
          target: '',
          value: 12_000_000_000,
          unit: 'bytes',
          data: {
            images: { count: 9, active: 5, size: 7_000_000_000, reclaimable: 3_400_000_000 },
            build_cache: { count: 41, active: 0, size: 5_000_000_000, reclaimable: 5_000_000_000 },
          },
        },
      })
    }),
  mysql: (r) =>
    patch(r, (items) => {
      const d = find(items, 'db.size', 'db-main', 'booking')
      if (!d?.fact) return
      d.fact = {
        ...d.fact,
        data: {
          engine: 'mysql',
          tables: 57,
          other: 300_000_000,
          top: [
            ['orders', 900_000_000],
            ['order_items', 520_000_000],
            ['events', 410_000_000],
            ['users', 96_000_000],
            ['sessions', 41_000_000],
          ],
        },
      }
    }),
  neighbours: (r) =>
    patch(r, (items) => {
      const mem = find(items, 'sys.mem', 'vps-sg-2')
      if (mem?.fact)
        mem.fact = { ...mem.fact, data: { total: 8_375_186_227, available: 2_040_109_466 } }
      const base = find(items, 'docker.compose', 'vps-sg-2', 'tiemtra')
      if (!base?.fact) return
      const svc = (name: string, cpu: number, mem: number) => ({
        name: `booking-${name}-1`,
        svc: name,
        state: 'running',
        restarts: 0,
        mem,
        limit: 0,
        cpu,
        oom: false,
        exit: 0,
        started: '2026-09-20T09:12:03.412Z',
        image: `booking-${name}:2.3.1`,
      })
      items.push({
        ...base,
        key: { host: 'vps-sg-2', check: 'docker.compose', target: 'booking' },
        owner: { kind: 'project', id: 'booking' },
        severity: { level: 'ok' },
        fact: {
          ...base.fact,
          target: 'booking',
          data: {
            containers: 3,
            running: 3,
            not_running: 0,
            restarts: 0,
            services: [
              svc('app', 4.6, 671_088_640),
              svc('queue', 0.4, 163_577_856),
              svc('scheduler', 0.1, 96_468_992),
            ],
          },
        },
      })
    }),
  stale: (r) =>
    patch(r, (items) => {
      for (const i of items) {
        if (i.owner.kind === 'project' && i.owner.id === 'tiemtra' && i.key.host === 'vps-sg-2') {
          i.disposition = { kind: 'stale', since_seq: 7 }
          i.checked_seq = 7
        }
      }
    }),
  unreachable: (r) => ({
    ...patch(r, (items) =>
      items.filter(
        (i) =>
          !(i.owner.kind === 'project' && i.owner.id === 'tiemtra' && i.key.host === 'vps-sg-2'),
      ),
    ),
    projects: r.projects.map((p) =>
      p.id === 'tiemtra' ? { ...p, unreachable_hosts: ['vps-sg-2'] } : p,
    ),
  }),
}

function patch(report: Report, edit: (items: Item[]) => Item[] | void): Report {
  const items = report.items.map((i) => structuredClone(i))
  return { ...report, items: edit(items) ?? items }
}

export function withTabCase<T extends Data>(data: T, name: TabCase): T {
  const key = String(data.latest)
  const base = data.reports[key]
  if (!base) return data
  return { ...data, reports: { ...data.reports, [key]: EDITS[name](base) } }
}
