// The Security tab of kho-hang as the board draws it, and its other states, on top of the
// timeline (`?mock=security`, with `&sec=<scenario>`): a PHP file in uploads and a served .env
// that appeared over the last scans, every check on, and then one scenario at a time (partial
// miner check, a miner found, a served .git folder, cut lists, groups off, expected findings,
// a host that did not answer, certificate states, a clean project). Development only.
import type { ExpectedRule, Item, Report } from '@/api'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'
import { secItem } from './security-items'
import type { ResultsBundle } from './results-bundle'

type Data = ResultsBundle & { latest: number }

const PROJECT = 'kho-hang'
const HOST = 'vps-hn-3'
const SITE = 'https://khohang.vn'
const DAY = 86_400

const KEYS = [
  'APP_KEY',
  'DB_PASSWORD',
  'DB_USERNAME',
  'MAIL_PASSWORD',
  'AWS_SECRET_ACCESS_KEY',
  'STRIPE_SECRET',
  'REDIS_PASSWORD',
  'PUSHER_APP_SECRET',
  'JWT_SECRET',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'SENTRY_DSN',
  'MAIL_HOST',
  'APP_ENV',
  'DB_HOST',
]

const crit = { level: 'crit' } as const
const warn = { level: 'warn' } as const
const info = { level: 'info' } as const

interface Context {
  /** Scan number of the report being built. */
  seq: number
  /** Unix seconds of the latest scan, the clock the files' times hang from. */
  at: number
}

function uploadItem(ctx: Context, n: number, total: number, extra: Partial<Item> = {}): Item {
  const target = `/var/www/khohang/storage/app/public/uploads/2026/09/img_${4471 + n}.php`
  return {
    ...secItem({
      check: 'sec.upload_php',
      host: HOST,
      project: PROJECT,
      target,
      level: crit,
      value: 1,
      data: { size: 3174, mtime: ctx.at - 2 * DAY - n * 90, owner: 'www-data', total },
      delta: { kind: 'still', scans_open: ctx.seq - 9 },
    }),
    ...extra,
  }
}

function exposedItem(keys: string[], delta: Item['delta']): Item {
  return secItem({
    check: 'url.exposed',
    project: PROJECT,
    target: SITE,
    level: crit,
    value: keys.some((k) => k.startsWith('/.git')) ? 2 : 1,
    unit: 'count',
    data: { exposed: true, matched_keys: keys },
    delta,
  })
}

function recentItem(ctx: Context, delta: Item['delta']): Item {
  const files: JsonValue[] = [
    'resources/views/layouts/app.blade.php',
    'resources/views/orders/index.blade.php',
    'app/Http/Controllers/OrderController.php',
    'public/js/app.js',
    'public/index.php',
  ].map((p, i): JsonValue => [p, ctx.at - DAY - i * 3600])
  return secItem({
    check: 'sec.recent_change',
    host: HOST,
    project: PROJECT,
    target: '/var/www/khohang',
    level: info,
    value: 37,
    unit: 'files',
    data: { newest: ctx.at - DAY, files },
    delta,
  })
}

/** The nine checks of kho-hang in scan `ctx.seq`: clean before #10, the story after. */
function baseItems(ctx: Context): Item[] {
  const clean = (check: string, extra: Record<string, JsonValue> = {}) =>
    secItem({ check, host: HOST, project: PROJECT, level: { level: 'ok' }, value: 0, data: extra })
  const items: Item[] = [
    secItem({
      check: 'sec.miner',
      host: HOST,
      project: PROJECT,
      value: 0,
      data: { seen: 212, total: 212 },
    }),
    clean('sec.preload'),
    clean('sec.tmp_exec'),
    secItem({
      check: 'sec.ports',
      host: HOST,
      project: PROJECT,
      target: '0.0.0.0:3306',
      level: warn,
      value: 1,
      data: { port: 3306, proc: 'mysqld' },
      delta: { kind: 'still', scans_open: ctx.seq },
    }),
    secItem({
      check: 'url.http',
      project: PROJECT,
      target: SITE,
      value: 212,
      unit: 'ms',
      data: { status: 200, class: '2xx' },
    }),
    secItem({ check: 'url.tls', project: PROJECT, target: SITE, value: 74, unit: 'days' }),
  ]
  items.push(
    ctx.seq >= 10
      ? uploadItem(ctx, 0, 1, {
          delta: ctx.seq === 10 ? { kind: 'new' } : { kind: 'still', scans_open: ctx.seq - 9 },
        })
      : clean('sec.upload_php', { total: 0 }),
  )
  items.push(
    ctx.seq >= 11
      ? recentItem(ctx, ctx.seq === 11 ? { kind: 'new' } : { kind: 'still', scans_open: 2 })
      : secItem({
          check: 'sec.recent_change',
          host: HOST,
          project: PROJECT,
          target: '/var/www/khohang',
          value: 0,
          unit: 'files',
        }),
  )
  items.push(
    ctx.seq >= 12
      ? exposedItem(
          KEYS.slice(0, 4).map((k) => `/.env:${k}`),
          { kind: 'new' },
        )
      : secItem({
          check: 'url.exposed',
          project: PROJECT,
          target: SITE,
          value: 0,
          data: { exposed: false },
        }),
  )
  return items
}

const MINE = (i: Item) => i.owner.kind === 'project' && i.owner.id === PROJECT
const SECURITY_CHECKS = (i: Item) =>
  [
    'sec.miner',
    'sec.preload',
    'sec.tmp_exec',
    'sec.upload_php',
    'sec.ports',
    'sec.recent_change',
    'url.http',
    'url.tls',
    'url.exposed',
  ].includes(i.key.check)

/** The report with kho-hang's nine checks replaced by `items` (the other projects stay). */
function withItems(report: Report, items: Item[], disabled: Report['disabled_groups']): Report {
  const rest = report.items.filter((i) => !(MINE(i) && SECURITY_CHECKS(i)))
  return { ...report, items: [...rest, ...items], disabled_groups: disabled }
}

type Scenario = (items: Item[], ctx: Context) => { items: Item[]; extra?: Partial<Report> }

const replace = (items: Item[], check: string, ...next: Item[]): Item[] => [
  ...items.filter((i) => i.key.check !== check),
  ...next,
]

const SCENARIOS: Record<string, Scenario> = {
  'miner-partial': (items) => ({
    items: replace(
      items,
      'sec.miner',
      secItem({
        check: 'sec.miner',
        host: HOST,
        project: PROJECT,
        level: { level: 'unknown', reason: 'needs_perm' },
        value: 0,
        data: { seen: 41, total: 212 },
        unknown: 'needs_perm',
      }),
    ),
  }),
  'miner-found': (items) => ({
    items: replace(
      items,
      'sec.miner',
      secItem({
        check: 'sec.miner',
        host: HOST,
        project: PROJECT,
        target: 'xmrig',
        level: crit,
        value: 1,
        data: {
          seen: 41,
          total: 212,
          count: 3,
          exe: '/tmp/.cache/xmrig',
          deleted: false,
          why: 'name',
        },
        delta: { kind: 'new' },
      }),
    ),
  }),
  git: (items) => ({
    items: replace(
      items,
      'url.exposed',
      exposedItem([...KEYS.map((k) => `/.env:${k}`), '/.git/HEAD:ref'], { kind: 'new' }),
    ),
  }),
  cut: (items, ctx) => ({
    items: replace(
      replace(
        items,
        'sec.upload_php',
        ...Array.from({ length: 50 }, (_, n) => uploadItem(ctx, n, 137)),
      ),
      'sec.tmp_exec',
      ...Array.from({ length: 50 }, (_, n) =>
        secItem({
          check: 'sec.tmp_exec',
          host: HOST,
          project: PROJECT,
          target: `/tmp/.x/run_${n}.sh`,
          level: warn,
          value: 1,
          data: { size: 900 + n, mtime: ctx.at - 3600 * (n + 1), total: 63 },
          delta: { kind: 'still', scans_open: 2 },
        }),
      ),
    ),
  }),
  expected: (items) => ({
    items: items.map((i) =>
      i.key.check === 'sec.upload_php' || i.key.check === 'sec.ports'
        ? { ...i, disposition: { kind: 'expected', rule: `exp-khohang-${i.key.check}` } as const }
        : i,
    ),
  }),
  unreachable: (items) => ({
    items: items
      .filter((i) => i.key.host === HOST)
      .map((i) => ({ ...i, disposition: { kind: 'stale', since_seq: 11 } as const })),
    extra: {},
  }),
  tls: (items) => ({
    items: replace(
      items,
      'url.tls',
      {
        ...secItem({
          check: 'url.tls',
          project: PROJECT,
          target: SITE,
          level: crit,
          value: -5,
          unit: 'days',
          data: { expired: true, untrusted: true, not_after: Date.now() / 1000 - 5 * DAY },
        }),
      },
      secItem({
        check: 'url.tls',
        project: PROJECT,
        target: 'https://www.khohang.vn',
        level: warn,
        value: 12,
        unit: 'days',
        data: { not_after: Date.now() / 1000 + 12 * DAY },
      }),
    ),
  }),
  clean: (items) => ({
    items: items
      .filter((i) => i.key.check !== 'sec.ports')
      .map((i) =>
        i.severity.level === 'crit' || i.severity.level === 'info'
          ? {
              ...i,
              severity: { level: 'ok' } as const,
              value: 0,
              delta: null,
              fact: i.fact && { ...i.fact, value: 0 },
            }
          : i,
      ),
  }),
}

const RULES: ExpectedRule[] = ['sec.upload_php', 'sec.ports'].map((check) => ({
  id: `exp-khohang-${check}`,
  host: HOST,
  check,
  target: '',
  reason: check === 'sec.ports' ? 'accepted_risk' : 'intended',
  until: '2026-12-25',
  note: check === 'sec.ports' ? 'Behind the provider firewall.' : 'Laravel silence file.',
}))

const DISABLED: Record<string, Report['disabled_groups']> = {
  off: ['security'],
  'all-off': ['security', 'code_changes', 'uptime'],
}

export function withSecurity<T extends Data>(data: T, scenario: string | null): T {
  const latest = data.latest
  const latestReport = data.reports[String(latest)]
  if (!latestReport) return data
  const at = Math.floor(Date.parse(latestReport.scanned_at ?? latestReport.evaluated_at) / 1000)
  const reports = { ...data.reports }
  for (const seq of [latest - 3, latest - 2, latest - 1, latest]) {
    const base = reports[String(seq)]
    if (!base) continue
    const ctx = { seq, at }
    let items = baseItems(ctx)
    let extra: Partial<Report> = {}
    if (seq === latest && scenario && SCENARIOS[scenario]) {
      const out = (SCENARIOS[scenario] as Scenario)(items, ctx)
      items = out.items
      extra = out.extra ?? {}
    }
    const disabled = seq === latest && scenario ? (DISABLED[scenario] ?? []) : []
    const kept = disabled.length > 0 ? items.filter((i) => !disabled.includes(i.group)) : items
    const projects =
      seq === latest && scenario === 'unreachable'
        ? base.projects.map((p) => (p.id === PROJECT ? { ...p, unreachable_hosts: [HOST] } : p))
        : base.projects
    reports[String(seq)] = { ...withItems(base, kept, disabled), projects, ...extra }
  }
  const rules = scenario === 'expected' ? [...data.rules, ...RULES] : data.rules
  return { ...data, reports, rules }
}
