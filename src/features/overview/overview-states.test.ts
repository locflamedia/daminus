// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AppError, Report, ScanRun } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import ScanPanel from '@/features/scan-panel/ScanPanel.vue'
import { i18n, setI18nLocale } from '@/i18n'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import { useOverviewStore } from '@/stores/overview'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useScanStore } from '@/stores/scan'
import OverviewView from './OverviewView.vue'

const bundle = timeline as unknown as ResultsBundle
const DAY = 86_400_000
const idle = { facts: 0, dropped: 0 }

/** The twelfth scan, shifted so it finished `agoMs` ago. */
function reportAgo(agoMs: number): Report {
  const base = bundle.reports['12'] as Report
  const shift = Date.now() - agoMs - Date.parse(base.scanned_at ?? '')
  return JSON.parse(JSON.stringify(base), (_key, value) =>
    typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value)
      ? new Date(Date.parse(value) + shift).toISOString()
      : value,
  ) as Report
}

const calls: Array<{ cmd: string; args: Record<string, unknown> }> = []
const mounted: Array<{ unmount: () => void }> = []

async function mountOverview(withPanel = false) {
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    if (cmd === 'history_list') return { ...bundle.history, bytes: 0 }
    if (cmd === 'rules_list') return bundle.rules
    if (cmd === 'history_facts') return []
    if (cmd === 'report_at') return bundle.reports[String(args.seq)]
    if (cmd === 'report_latest') return reportAgo(2 * 60_000)
    if (cmd === 'scan_start') return { scan_id: 's2', joined: false }
    if (cmd === 'scan_stop') return true
    if (cmd === 'scan_status') return null
    return null
  })
  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'overview', component: stub },
      { path: '/history', name: 'history', component: stub },
      { path: '/project/:id/:tab?', name: 'project', component: stub },
      { path: '/server/:host', name: 'server', component: stub },
    ],
  })
  await router.push('/')
  const root = withPanel
    ? defineComponent({ render: () => [h(OverviewView), h(ScanPanel)] })
    : OverviewView
  const wrapper = mount(root, { global: { plugins: [i18n, router] }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function load(report: Report | null = reportAgo(2 * 60_000)) {
  useReportStore().latest = report
  useProjectsStore().details = bundle.projects
  useProjectsStore().loaded = true
}

beforeEach(() => {
  calls.length = 0
  setActivePinia(createPinia())
  setI18nLocale('en')
})
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  clearMocks()
  document.body.replaceChildren()
})

describe('Overview states', () => {
  it('shows bars of the final heights while the latest scan is read', async () => {
    useProjectsStore().loaded = true
    useProjectsStore().details = bundle.projects
    const wrapper = await mountOverview()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.find('article').exists()).toBe(false)
    expect(wrapper.find('.meta').exists()).toBe(false)
  })

  it('says why the read failed and reads again on "Try again"', async () => {
    load(null)
    const error: AppError = {
      code: { kind: 'io', path: 'snapshots' },
      params: {},
      retryable: true,
    } as unknown as AppError
    useReportStore().error = error
    const wrapper = await mountOverview()
    expect(wrapper.get('[role="alert"]').text()).toContain('Couldn’t read or write snapshots.')
    calls.length = 0
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.cmd === 'report_latest')).toBe(true)
  })

  it('shows the projects as waiting for the first scan, with no summary and no servers', async () => {
    load({ ...reportAgo(0), seq: null, scanned_at: null, items: [] })
    const wrapper = await mountOverview()
    expect(wrapper.findAll('article')).toHaveLength(3)
    expect(wrapper.text()).toContain('Waiting for the first scan')
    expect(wrapper.find('.summary').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Servers')
  })

  it('puts a card for each project under the summary, critical first', async () => {
    load()
    const wrapper = await mountOverview()
    expect(wrapper.get('.summary').text()).toContain('6 issues across 3 projects and 5 servers')
    expect(wrapper.findAll('article.card').map((c) => c.find('.name').text())).toEqual([
      'kho-hang',
      'tiemtra',
      'booking',
    ])
  })
})

describe('Overview filters', () => {
  it('shows only the critical card when the critical chip is pressed, and all again on a second press', async () => {
    load()
    const wrapper = await mountOverview()
    const chip = wrapper.get('button.chip.crit')
    await chip.trigger('click')
    expect(chip.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('article.card')).toHaveLength(1)
    await chip.trigger('click')
    expect(wrapper.findAll('article.card')).toHaveLength(3)
  })

  it('keeps the cards that need a look under "Needs a look"', async () => {
    load()
    const wrapper = await mountOverview()
    const needs = wrapper.findAll('[role="tab"]').find((b) => b.text().startsWith('Needs a look'))
    await needs?.trigger('click')
    expect(wrapper.findAll('article.card').map((c) => c.find('.name').text())).toEqual([
      'kho-hang',
      'tiemtra',
    ])
  })

  it('compares with an earlier scan chosen in the menu', async () => {
    load()
    const wrapper = await mountOverview()
    const overview = useOverviewStore()
    expect(overview.baselineSeq).toBe(11)
    expect(wrapper.text()).toContain('vs #11')
    overview.choose(9)
    await flushPromises()
    expect(wrapper.text()).toContain('vs #9')
    expect(wrapper.text()).toContain('Changes since #9')
  })
})

describe('Overview with old results', () => {
  it('says how old the results are, drops the filters and offers one button', async () => {
    load(reportAgo(4 * DAY))
    const wrapper = await mountOverview()
    expect(wrapper.text()).toContain('These results are 4 days old')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.find('.summary').exists()).toBe(false)
    expect(wrapper.get('.cards').classes()).toContain('old')
    expect(wrapper.text()).toContain('Scan now')
  })

  it('writes every card as the old result it is', async () => {
    load(reportAgo(4 * DAY))
    const wrapper = await mountOverview()
    expect(wrapper.text()).toContain('4 d ago')
    expect(wrapper.text()).toContain('scan #12 · ')
  })
})

describe('Overview while a scan runs', () => {
  function running(): ScanRun {
    return {
      scan_id: 's',
      started_at: new Date().toISOString(),
      next_seq: 0,
      hosts: {
        '@local': { ...idle, state: 'finished', outcome: { state: 'reached' } },
        'vps-hn-3': { ...idle, state: 'running' },
        'vps-sg-1': { ...idle, state: 'queued' },
        'vps-sg-2': { ...idle, state: 'queued' },
        'db-main': { ...idle, state: 'queued' },
        'legacy-shop': { ...idle, state: 'queued' },
      },
    }
  }

  it('replaces the summary with the host chips and shows cards waiting for their hosts', async () => {
    load()
    useScanStore().run = running()
    const wrapper = await mountOverview()
    expect(wrapper.find('.summary').exists()).toBe(false)
    expect(wrapper.findAll('.host-chip')).toHaveLength(5)
    const kho = wrapper.findAll('article.card')[0]
    expect(kho?.text()).toContain('waiting')
    expect(kho?.text()).toContain('this scan · waiting')
    expect(kho?.text()).toContain('Reading vps-hn-3…')
  })

  it('keeps the order of the cards until the scan ends', async () => {
    load()
    useScanStore().run = running()
    const wrapper = await mountOverview()
    expect(wrapper.findAll('article.card').map((c) => c.find('.name').text())).toEqual([
      'kho-hang',
      'tiemtra',
      'booking',
    ])
  })

  it('opens the scan details from the progress pill', async () => {
    load()
    useScanStore().run = running()
    const wrapper = await mountOverview()
    await wrapper.get('button.progress').trigger('click')
    expect(useScanPanelStore().open).toBe(true)
  })
})

describe('Overview keys', () => {
  it('opens the panel and starts a scan on ⌘R', async () => {
    load()
    await mountOverview()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', metaKey: true }))
    await flushPromises()
    expect(useScanPanelStore().open).toBe(true)
    expect(calls.some((c) => c.cmd === 'scan_start')).toBe(true)
  })

  it('ends the scan on Esc when no panel is open', async () => {
    load()
    useScanStore().run = {
      scan_id: 's',
      started_at: new Date().toISOString(),
      next_seq: 0,
      hosts: { a: { ...idle, state: 'running' } },
    }
    await mountOverview()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(calls.some((c) => c.cmd === 'scan_stop')).toBe(true)
  })

  it('lets Esc close the panel and leaves the scan running', async () => {
    load()
    useScanStore().run = {
      scan_id: 's',
      started_at: new Date().toISOString(),
      next_seq: 0,
      hosts: { a: { ...idle, state: 'running' } },
    }
    await mountOverview(true)
    const panel = useScanPanelStore()
    panel.show()
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await flushPromises()
    expect(panel.open).toBe(false)
    expect(calls.some((c) => c.cmd === 'scan_stop')).toBe(false)
  })
})
