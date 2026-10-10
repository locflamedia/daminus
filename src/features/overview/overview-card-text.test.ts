import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostOutcome, Project, Report, ScanRun } from '@/api'
import { setI18nLocale } from '@/i18n'
import { buildProjectCards, type ProjectCardData } from '@/lib/overview-cards'
import { cardScan } from '@/lib/overview-scan'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import { cardView, type CardContext, type CardView } from './overview-card-text'

const bundle = timeline as unknown as ResultsBundle
const latest = bundle.reports['12'] as Report
const before = bundle.reports['11'] as Report
const NOW = Date.parse(latest.scanned_at ?? '')

beforeEach(() => setI18nLocale('en'))
afterEach(() => setI18nLocale('en'))

function data(id: string, report: Report = latest, baseline: Report | null = before) {
  const found = buildProjectCards(bundle.projects, report, baseline, bundle.rules, NOW).find(
    (c) => c.id === id,
  )
  if (!found) throw new Error(`no card ${id}`)
  return found
}

const context = (partial: Partial<CardContext> = {}): CardContext => ({
  domain: 'khohang.vn',
  color: '#4F6BED',
  seq: 12,
  scannedAt: latest.scanned_at ?? null,
  oldDays: null,
  scan: null,
  first: false,
  ...partial,
})

function view(id: string, partial: Partial<CardContext> = {}, d?: ProjectCardData): CardView {
  return cardView(d ?? data(id), context(partial))
}

function metric(card: CardView, label: string) {
  const found = card.metrics.find((m) => m.label === label)
  if (!found) throw new Error(`no metric ${label}`)
  return found
}

const idle = { facts: 0, dropped: 0 }
const run = (hosts: ScanRun['hosts']): ScanRun => ({
  scan_id: 's',
  started_at: '2026-09-26T06:00:00Z',
  next_seq: 0,
  hosts,
})
const project = (id: string): Project => bundle.projects.find((p) => p.id === id) as Project

describe('card head', () => {
  it('names the state in words and the place the project runs', () => {
    const kho = view('kho-hang')
    expect(kho).toMatchObject({ state: 'crit', stateLabel: '2 critical', where: 'vps-hn-3' })
    expect(view('tiemtra')).toMatchObject({
      state: 'warn',
      stateLabel: '2 warnings',
      where: '2 servers',
    })
    expect(view('booking')).toMatchObject({ state: 'ok', stateLabel: 'All clear' })
  })

  it('takes the tint nearest to the project colour and writes tags without versions', () => {
    expect(view('tiemtra', { color: '#9F86E6' }).tint).toBe('lilac')
    expect(view('tiemtra').tags.map((t) => t.label)).toEqual(['pm2', 'compose', 'PostgreSQL'])
  })

  it('follows the language', () => {
    setI18nLocale('vi')
    expect(view('kho-hang').stateLabel).toBe('2 nghiêm trọng')
    expect(view('booking').stateLabel).toBe('Ổn cả')
  })
})

describe('a project that is not fully read', () => {
  const booking = data('booking')

  it('does not say all clear while a result could not be read, and agrees with the footer', () => {
    const card = view('booking', {}, { ...booking, unreadable: 2, passed: 12 })
    expect(card).toMatchObject({ state: 'partial', stateLabel: 'Partly checked' })
    expect(card.status).toMatchObject({ icon: 'lock', title: '2 checks could not be read' })
    expect(card.passedLabel).toBe('12 of 14 passed')
  })

  it('says how many results come from an earlier scan', () => {
    const card = view('booking', {}, { ...booking, staleCount: 3, passed: 11 })
    expect(card.state).toBe('partial')
    expect(card.status.title).toBe('3 results are from an earlier scan')
  })

  it('keeps the all clear wording when every check passed', () => {
    expect(view('booking')).toMatchObject({ state: 'ok', stateLabel: 'All clear' })
  })

  it('draws a technology mark where the data names the technology', () => {
    expect(view('tiemtra').tags.map((t) => t.brand)).toEqual(['pm2', 'docker', 'postgresql'])
    expect(view('booking').tags.map((t) => t.brand)).toEqual(['pm2', 'mysql'])
  })
})

describe('status row', () => {
  it('leads a critical card with the main issue and lists the other checks', () => {
    const kho = view('kho-hang')
    expect(kho.status).toMatchObject({ tone: 'crit', icon: 'critical' })
    expect(kho.status.title).toBe('https://khohang.vn/.env serves a private file')
    expect(kho.status.meta).toBe('PHP in uploads · Open database ports')
    expect(kho).toMatchObject({ actionLabel: 'Security ›', action: 'tab', tab: 'security' })
  })

  it('says "Open" on a warning and nothing on a clear card', () => {
    expect(view('tiemtra')).toMatchObject({ actionLabel: 'Open ›', action: 'open' })
    expect(view('booking')).toMatchObject({ action: null })
  })

  it('counts every check on an all clear card and says what is expected', () => {
    const booking = view('booking')
    expect(booking.status).toMatchObject({ tone: 'ok', title: 'All 14 checks passed' })
    expect(booking.status.meta).toMatch(/^2 expected · review due in \d+ d$/)
  })

  it('says a group is off in Settings on the all clear card', () => {
    const report: Report = { ...latest, disabled_groups: ['security'] }
    const booking = cardView(data('booking', report), context())
    expect(booking.status.meta).toContain('Security off in Settings')
  })

  it('does not mention the code changes group, which is off out of the box', () => {
    expect(view('booking').status.meta).not.toContain('Code changes')
  })

  it('offers Retry on a project whose host is silent', () => {
    const quiet = {
      ...data('booking'),
      state: 'unreachable' as const,
      unreachableHosts: ['db-main'],
    }
    const card = cardView(quiet, context())
    expect(card.status).toMatchObject({ tone: 'neutral', title: 'db-main is not answering.' })
    expect(card).toMatchObject({ actionLabel: 'Retry', action: 'retry', retryHosts: ['db-main'] })
    expect(card.stateLabel).toBe('Unreachable')
  })

  describe('a host that could not be scanned for another reason', () => {
    const down = (outcome: HostOutcome) =>
      cardView(
        {
          ...data('booking'),
          state: 'unreachable' as const,
          unreachableHosts: ['db-main'],
          unreachableOutcome: outcome,
          unreachableAnswered: true,
        },
        context(),
      )

    it('names the cause, tints the row, and offers the one step that can fix it', () => {
      const cases: Array<[HostOutcome, string, string, string, string, string]> = [
        [
          { state: 'timeout' },
          'Timed out',
          'neutral',
          'db-main took too long to answer.',
          'retry',
          'Retry',
        ],
        [
          { state: 'auth_failed' },
          'Key refused',
          'crit',
          'db-main refused your key.',
          'login',
          'Fix login',
        ],
        [
          { state: 'host_key_changed', fp: 'ED25519 SHA256:x' },
          'Host key changed',
          'crit',
          'db-main has a different host key. Do not continue until you know why.',
          'host-key',
          'Review host key',
        ],
        [
          { state: 'host_key_unknown', fp: 'ED25519 SHA256:x' },
          'Host key unknown',
          'warn',
          'db-main needs its host key trusted first.',
          'host-key',
          'Review host key',
        ],
        [
          { state: 'not_in_config' },
          'Not in config',
          'warn',
          'db-main is no longer in ~/.ssh/config.',
          'edit',
          'Edit project',
        ],
      ]
      for (const [outcome, label, tone, title, action, actionLabel] of cases) {
        const card = down(outcome)
        expect(card.stateLabel, outcome.state).toBe(label)
        expect(card.status, outcome.state).toMatchObject({ tone, title })
        expect(card, outcome.state).toMatchObject({ action, actionLabel, outcome })
      }
    })

    it('drops "showing what it said last time" for a host that never answered', () => {
      const never = cardView(
        {
          ...data('booking'),
          state: 'unreachable' as const,
          unreachableHosts: ['db-main'],
          unreachableOutcome: { state: 'not_in_config' },
          unreachableAnswered: false,
        },
        context(),
      )
      expect(never.status.meta).toBeUndefined()
      expect(down({ state: 'auth_failed' }).status.meta).toBe(
        'Showing what it said the last time it answered',
      )
    })

    it('says it in Vietnamese', () => {
      setI18nLocale('vi')
      const card = down({ state: 'auth_failed' })
      expect(card.status.title).toBe('db-main từ chối khoá của bạn.')
      expect(card.actionLabel).toBe('Sửa đăng nhập')
      expect(down({ state: 'not_in_config' }).actionLabel).toBe('Sửa project')
      expect(down({ state: 'not_in_config' }).stateLabel).toBe('Không có trong config')
      expect(down({ state: 'unreachable', cause: 'no_route' }).status.title).toBe(
        'db-main không trả lời.',
      )
    })
  })

  it('writes old results as "ago" with the scan, and offers no action', () => {
    const card = view('booking', { oldDays: 4 })
    expect(card.status).toMatchObject({ icon: 'clock', title: 'All clear 4 days ago' })
    expect(card.status.meta).toMatch(/· scan #12$/)
    expect(card).toMatchObject({ action: null, checkedAt: undefined })
    expect(card.passedLabel).toBe('scan #12 · 14 of 14 passed')
  })

  it('names the host being read, or the one still waiting for a slot', () => {
    const reading = run({
      'db-main': { ...idle, state: 'running' },
      'vps-sg-2': { ...idle, state: 'queued' },
    })
    const card = view('booking', { scan: cardScan(project('booking'), reading) })
    expect(card.status).toMatchObject({ title: 'Reading db-main…' })
    expect(card.status.meta).toBe('last result stays until the new one lands')
    const waiting = run({
      'db-main': { ...idle, state: 'queued' },
      'vps-sg-2': { ...idle, state: 'queued' },
    })
    expect(view('booking', { scan: cardScan(project('booking'), waiting) }).status.title).toBe(
      'Waiting for vps-sg-2…',
    )
  })
})

describe('metrics', () => {
  it('writes the uptime as the status with the time beside it', () => {
    expect(metric(view('kho-hang'), 'Uptime')).toMatchObject({
      value: '200',
      unit: '· 212 ms',
      note: 'no change',
      noteTone: 'plain',
    })
  })

  it('drops the unit of a change when it is the unit of the size, and marks growth', () => {
    const disk = metric(view('kho-hang'), 'Disk')
    expect(disk).toMatchObject({ value: '3.22', unit: 'GB' })
    expect(disk.note).toBe('+35.8 MB')
    expect(disk.noteTone).toBe('delta')
  })

  it('says a project with no database has none set up, and what to do', () => {
    expect(metric(view('kho-hang'), 'Database')).toMatchObject({
      state: 'not-set-up',
      value: 'Not set up',
      note: 'add .env path',
    })
  })

  it('shimmers a database that is not set up while its scan runs, keeping the hint', () => {
    const waiting = run({ 'vps-hn-3': { ...idle, state: 'queued' } })
    const card = view('kho-hang', { scan: cardScan(project('kho-hang'), waiting) })
    expect(metric(card, 'Database')).toMatchObject({ state: 'scanning', note: 'add .env path' })
  })

  it('puts the clock with its tooltip on a MySQL database only', () => {
    expect(metric(view('booking'), 'Database').hint).toBe(
      'MySQL updates table sizes about once a day',
    )
    expect(metric(view('tiemtra'), 'Database').hint).toBeUndefined()
  })

  it('shows tiles being read as scanning and leaves the rest as they were', () => {
    const reading = run({
      '@local': { ...idle, state: 'finished', outcome: { state: 'reached' } },
      'vps-hn-3': { ...idle, state: 'running' },
    })
    const kho = view('kho-hang', { scan: cardScan(project('kho-hang'), reading) })
    expect(metric(kho, 'Disk').state).toBe('scanning')
    expect(metric(kho, 'Uptime').state).toBe('normal')
    expect(kho.passedLabel).toBe('this scan · waiting')
    expect(kho).toMatchObject({ state: 'scanning', stateLabel: 'waiting', checkedAt: undefined })
  })

  it('says "updating" once a host of the project has finished', () => {
    const half = run({
      'vps-sg-2': { ...idle, state: 'finished', outcome: { state: 'reached' } },
      'db-main': { ...idle, state: 'running' },
    })
    const booking = view('booking', { scan: cardScan(project('booking'), half) })
    expect(booking.stateLabel).toBe('updating')
    expect(booking.passedLabel).toBe('this scan · partial, updating')
  })

  it('replaces every note by the age when the results are old', () => {
    const kho = view('kho-hang', { oldDays: 4 })
    expect(kho.metrics.map((m) => m.note)).toEqual(['4 d ago', '4 d ago', 'add .env path'])
    expect(metric(kho, 'Uptime').noteTone).toBe('plain')
  })

  it('writes a database that cannot be read with the reason, and a group that is off', () => {
    const unreadable: Report = {
      ...latest,
      items: latest.items.map((i) =>
        i.key.check === 'db.size' && i.key.target === 'booking'
          ? {
              ...i,
              severity: { level: 'unknown', reason: 'needs_perm' as const },
              fact: { check: 'db.size', target: 'booking', unknown: 'needs_perm' as const },
            }
          : i,
      ),
    }
    const db = metric(cardView(data('booking', unreadable), context()), 'Database')
    expect(db).toMatchObject({ state: 'needs-permission', note: 'Needs permission' })
    const off = cardView(data('booking', { ...latest, disabled_groups: ['databases'] }), context())
    expect(metric(off, 'Database')).toMatchObject({ note: 'off in Settings', noteTone: 'plain' })
  })
})

describe('first scan', () => {
  it('shows empty tiles and says the card waits for the first scan', () => {
    const card = view('booking', { first: true, seq: null, scannedAt: null })
    expect(card.stateLabel).toBe('No scan yet')
    expect(card.status.title).toBe('Waiting for the first scan')
    expect(card.metrics.every((m) => m.value === undefined && m.note === undefined)).toBe(true)
    expect(card.passedLabel).toBe('Waiting for the first scan')
  })
})
