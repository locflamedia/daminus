// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { CheckKey } from '@/api'
import { i18n } from '@/i18n'
import { type AskedFinding, useAiThreadStore } from '@/stores/ai-thread'
import { useReportStore } from '@/stores/report'
import { item } from '@/testing/item-fixture'
import { report, server } from '@/testing/report-fixture'
import { countInScope, scopeFromRoute, scopeKey } from '../ask/ask-scope'
import AiFindingsView from './AiFindingsView.vue'
import { applyFilter, fallbackFindings, filterCounts, footerRows } from './findings-model'
import { resolveFindings } from './resolve-findings'

const items = [
  item({ host: 'vps-a', check: 'disk.fs', target: '/', level: { level: 'ok' } }),
  item({
    host: 'vps-a',
    check: 'sec.upload_php',
    target: '/a/x.php',
    level: { level: 'crit' },
    owner: { kind: 'project', id: 'kho-hang' },
  }),
  item({ host: 'vps-b', check: 'disk.fs', target: '/', level: { level: 'warn' } }),
]
const base = report({ items })

/** What Rust ties each id to; an id it does not know has no key. */
const KEYS: Record<string, CheckKey> = {
  c2: { host: 'vps-a', check: 'sec.upload_php', target: '/a/x.php' },
  c3: { host: 'vps-b', check: 'disk.fs', target: '/' },
}

function finding(id: string, rank: number, why = 'Because.'): AskedFinding {
  return { id, why, suggested_command: null, rank, key: KEYS[id] ?? null }
}

beforeEach(() => setActivePinia(createPinia()))

describe('finding ids', () => {
  it('count the results a scope covers', () => {
    expect(countInScope(base, { kind: 'whole' })).toBe(3)
    expect(countInScope(base, { kind: 'project', id: 'kho-hang' })).toBe(1)
    expect(countInScope(base, { kind: 'server', host: 'vps-b' })).toBe(1)
    expect(countInScope(null, { kind: 'whole' })).toBe(0)
  })

  it('name a scope from the page and give it a stable key', () => {
    expect(scopeFromRoute({ name: 'project', params: { id: 'a' } })).toEqual({
      kind: 'project',
      id: 'a',
    })
    expect(scopeFromRoute({ name: 'overview', params: {} })).toEqual({ kind: 'whole' })
    expect(scopeKey({ kind: 'server', host: 'h' })).toBe('server:h')
  })
})

describe('resolving findings', () => {
  it('takes severity from the check whatever the AI says, and orders by rank', () => {
    const rows = resolveFindings(
      [finding('c3', 2, 'Critical, urgent!'), finding('c2', 1), finding('c8', 3)],
      base,
      'en',
    )
    expect(rows.map((r) => r.id)).toEqual(['c2', 'c3', 'c8'])
    expect(rows.map((r) => r.tone)).toEqual(['crit', 'warn', 'plain'])
    expect(rows[2]?.item).toBeNull()
  })

  it('removes direction and zero-width characters from why', () => {
    const [row] = resolveFindings(
      [finding('c2', 1, 'rm\u202E -rf\u200B / \u202Dok\nnext')],
      base,
      'en',
    )
    expect(row?.why).toBe('rm -rf / ok\nnext')
  })

  it('lists the checks’ own critical and warn results, worst first, when nothing was asked', () => {
    const rows = fallbackFindings(base, 'en')
    expect(rows.map((r) => r.tone)).toEqual(['crit', 'warn'])
    expect(rows.every((r) => r.rank === 0 && r.why === '')).toBe(true)
  })

  it('counts what the list leaves out from the report', () => {
    const r = report({
      items: [
        ...items,
        item({ check: 'x.y', level: { level: 'ok' } }),
        item({
          check: 'x.z',
          level: { level: 'warn' },
          disposition: { kind: 'expected', rule: 'r1' },
        }),
      ],
      servers: [server('vps-a'), server('legacy', { outcome: { state: 'unreachable' } as never })],
    })
    expect(footerRows(r)).toEqual({ passed: 2, expected: 1, unreachable: ['legacy'] })
    expect(footerRows(null)).toEqual({ passed: 0, expected: 0, unreachable: [] })
  })

  it('filters by the check’s severity', () => {
    const rows = fallbackFindings(base, 'en')
    expect(filterCounts(rows)).toEqual({ all: 2, crit: 1, warn: 1 })
    expect(applyFilter(rows, 'warn')).toHaveLength(1)
  })
})

const blank = { template: '<div />' }

async function page(latest = base) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: blank },
      { path: '/project/:id/:tab?', name: 'project', component: blank },
      { path: '/server/:host', name: 'server', component: blank },
    ],
  })
  await router.push('/')
  useReportStore().latest = latest
  const view = mount(AiFindingsView, { global: { plugins: [i18n, router] } })
  return { view, router }
}

function answer(findings: AskedFinding[]) {
  const thread = useAiThreadStore()
  const id = thread.begin({ kind: 'whole' }, 'What first?', 12)
  thread.write(id, { summary: 'Fix the upload first.', findings, status: 'done' })
}

describe('Findings page', () => {
  it('shows the AI’s order with the checks’ severity, and the summary as text', async () => {
    answer([finding('c3', 2, 'Fills up soon.'), finding('c2', 1, 'A PHP file can run.')])
    const { view } = await page()
    const rows = view.findAll('[role="option"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('Critical')
    expect(rows[1]?.text()).toContain('Warning')
    expect(view.text()).toContain('Fix the upload first.')
    expect(view.text()).toContain('A PHP file can run.')
    await rows[1]?.trigger('click')
    expect(view.text()).toContain('Fills up soon.')
  })

  it('filters to critical only', async () => {
    answer([finding('c3', 2), finding('c2', 1)])
    const { view } = await page()
    await view
      .findAll('button')
      .find((b) => b.text().startsWith('Critical'))
      ?.trigger('click')
    expect(view.findAll('[role="option"]')).toHaveLength(1)
  })

  it('falls back to the checks’ list, unranked, when there is no answer', async () => {
    const { view } = await page()
    expect(view.text()).not.toContain('No AI review yet')
    expect(view.text()).toContain('From the checks, not ranked')
    expect(view.text()).toContain('AI providers')
    const rows = view.findAll('[role="option"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('1')
  })

  it('draws the note on what the AI saw and the Mark as expected button', async () => {
    answer([finding('c2', 1, 'A PHP file can run.')])
    const { view } = await page()
    expect(view.text()).toContain('The AI saw the file name, size and time.')
    expect(view.findAll('button').some((b) => b.text() === 'Mark as expected')).toBe(true)
  })

  it('opens the Ask panel for a follow-up', async () => {
    answer([finding('c2', 1)])
    const { view } = await page()
    await view
      .findAll('button')
      .find((b) => b.text() === 'Ask a follow-up')
      ?.trigger('click')
    await flushPromises()
    expect(useAiThreadStore().drawerOpen).toBe(true)
  })

  it('says a review failed in words', async () => {
    const thread = useAiThreadStore()
    const id = thread.begin({ kind: 'whole' }, 'q', 12)
    thread.write(id, {
      status: 'error',
      error: { code: { kind: 'provider_unavailable' }, retryable: false },
    })
    const { view } = await page()
    expect(view.find('[role="alert"]').text()).toContain('not reachable')
  })

  it('before any review, shows what the check found and two ways on', async () => {
    const php = item({
      host: 'vps-a',
      check: 'sec.upload_php',
      target: '/a/x.php',
      level: { level: 'crit' },
      owner: { kind: 'project', id: 'kho-hang' },
      data: { size: 3174, mtime: 1_790_740_440 },
    })
    php.group = 'security'
    const { view, router } = await page(report({ items: [php] }))
    const detail = view.get('article')
    expect(detail.text()).toContain(
      'From the check: sec.upload_php — PHP files inside upload or public storage folders.',
    )
    expect(detail.get('.evidence').text()).toMatch(/^\/a\/x\.php · 3\.1 KB · /)
    const button = (label: string) => detail.findAll('button').find((b) => b.text() === label)
    expect(button('Ask the AI about this')).toBeDefined()
    await button('Open in Security')?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/project/kho-hang/security')
  })

  it('offers Open in Security only for a result of the security group', async () => {
    // The base report's upload result is filed under the disk group.
    const { view } = await page()
    const detail = view.get('article')
    expect(detail.text()).toContain('From the check: sec.upload_php')
    expect(detail.findAll('button').some((b) => b.text() === 'Open in Security')).toBe(false)
  })
})
