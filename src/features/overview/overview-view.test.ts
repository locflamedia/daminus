// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { LAYOUT_RANGE, type SidebarRange } from '@/lib/viewport'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import { shellProjects, shellReport, shellScanRun } from '@/testing/shell-fixture'
import OverviewView from './OverviewView.vue'

async function mountOverview(range: SidebarRange = 'wide') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'overview', component: { template: '<div />' } },
      { path: '/history', name: 'history', component: { template: '<div />' } },
      { path: '/project/:id/:tab?', name: 'project', component: { template: '<div />' } },
      { path: '/server/:host', name: 'server', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(OverviewView, {
    global: { plugins: [i18n, router], provide: { [LAYOUT_RANGE as symbol]: ref(range) } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mockCommands((cmd) => {
    if (cmd === 'rules_list') return []
    if (cmd === 'history_list') return { scans: [], keep: null, bytes: 0 }
    return null
  })
  setActivePinia(createPinia())
  useReportStore().latest = shellReport()
  useProjectsStore().details = shellProjects()
})
afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Overview while a scan runs', () => {
  it('titles the scan by its running time, in the mono face, with no scan number yet', async () => {
    useScanStore().run = shellScanRun()
    const wrapper = await mountOverview()
    const meta = wrapper.get('.meta')
    expect(meta.text()).toMatch(/^Scanning · \d+\.\d s$/)
    expect(meta.get('.mono').text()).toMatch(/^\d+\.\d s$/)
    expect(meta.text()).not.toContain('#')
  })

  it('says "URL checks" with a tick, with no count of URLs', async () => {
    useScanStore().run = shellScanRun()
    const wrapper = await mountOverview()
    const progress = wrapper.get('.progress')
    expect(progress.text()).toBe('2 of 5 hostsURL checks ✓')
  })

  it('gives each host one state word: queued, reading, done or failed', async () => {
    const scan = useScanStore()
    const run = shellScanRun()
    run.hosts['legacy-shop'] = {
      step: null,
      facts: 0,
      dropped: 0,
      state: 'finished',
      outcome: { state: 'auth_failed' },
    }
    scan.run = run
    const wrapper = await mountOverview()
    const chips = wrapper.findAll('.host-chip').map((c) => c.text())
    expect(chips).toEqual([
      'vps-sg-1done',
      'vps-sg-2done',
      'vps-hn-3reading…',
      'db-mainreading…',
      'legacy-shopfailed',
    ])
    // The cause stays in the tooltip.
    expect(wrapper.findAll('.host-chip').at(-1)?.attributes('title')).toBe('key refused')
  })

  it('shows the saved scan number and age again once the scan ends', async () => {
    const scan = useScanStore()
    scan.run = shellScanRun()
    const wrapper = await mountOverview()
    scan.run = null
    await flushPromises()
    expect(wrapper.get('.meta').text()).toMatch(/^Scan #12 · /)
  })
})

describe('Overview toolbar with results over a day old', () => {
  it('gives the age first, in amber, then the scan number and its date', async () => {
    useReportStore().latest = shellReport(4 * 86_400_000)
    const wrapper = await mountOverview()
    const meta = wrapper.get('.meta')
    expect(meta.get('.age').text()).toBe('4 days ago')
    expect(meta.text()).toMatch(
      /^Last scan 4 days ago · scan #12 · [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/,
    )
  })

  it('writes a plain scan line while the results are current', async () => {
    const wrapper = await mountOverview()
    expect(wrapper.get('.meta').text()).toMatch(/^Scan #12 · /)
    expect(wrapper.find('.age').exists()).toBe(false)
  })
})

describe('Overview servers in a narrow window', () => {
  it('puts the servers in the free fourth cell of the two-across grid when three cards sit there', async () => {
    const wrapper = await mountOverview('narrow')
    const tail = wrapper.get('.tail')
    expect(tail.classes()).toContain('cell')
    expect(tail.find('.list-card').exists()).toBe(true)
  })

  it('keeps the full-width strip below the cards at a wide window', async () => {
    const wrapper = await mountOverview('wide')
    expect(wrapper.get('.tail').classes()).not.toContain('cell')
    expect(wrapper.find('.list-card').exists()).toBe(false)
  })
})
