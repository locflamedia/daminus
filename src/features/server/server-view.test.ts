// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Report } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import bundle from '@/testing/fixtures/results.json'
import ServerView from './ServerView.vue'

const timeline = bundle as unknown as {
  history: unknown
  reports: Record<string, Report>
  facts: unknown[]
}

async function mountServer(host: string, latest: Report | null = timeline.reports['12'] ?? null) {
  const calls: { cmd: string; args: Record<string, unknown> }[] = []
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    if (cmd === 'history_list') return timeline.history
    if (cmd === 'rules_list') return []
    if (cmd === 'history_facts') return timeline.facts
    if (cmd === 'report_at') return timeline.reports[String(args.seq)]
    if (cmd === 'scan_start') return { scan_id: 's1' }
    return null
  })
  setActivePinia(createPinia())
  useReportStore().latest = latest
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/server/:host', name: 'server', component: ServerView },
    ],
  })
  await router.push(`/server/${host}`)
  const wrapper = mount(ServerView, { global: { plugins: [i18n, router] } })
  await flushPromises()
  await flushPromises()
  return { wrapper, calls }
}

/** Just after scan #12, so its results are current (over a day later they turn old). */
function freshClock() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-26T07:00:00Z'))
}

afterEach(() => {
  vi.useRealTimers()
  clearMocks()
  document.body.replaceChildren()
})

describe('Server page', () => {
  it('shows the four numbers with the core state of each', async () => {
    const { wrapper } = await mountServer('vps-sg-2')
    const cards = wrapper.findAll('.kpi')
    expect(cards.map((c) => c.find('.label').text())).toEqual(['Load', 'Memory', 'Disk /', 'Swap'])
    expect(cards[2]?.find('.tag').text()).toBe('warn')
    expect(cards[2]?.find('.big').text()).toContain('87')
  })

  it('reads the change against the scan before the newest by default', async () => {
    freshClock()
    const { wrapper } = await mountServer('vps-sg-2')
    expect(wrapper.text()).toContain('vs #11')
    expect(wrapper.findAll('.kpi')[2]?.find('.delta').text()).toContain('3 pts')
  })

  it('names the machine and its disk in bytes as the board does', async () => {
    freshClock()
    const { wrapper } = await mountServer('vps-sg-2')
    expect(wrapper.text()).toContain('4 vCPU · 8 GB')
    expect(wrapper.text()).toContain('82.6 of 95 GB · 12.4 GB free')
    expect(wrapper.findAll('.kpi')[2]?.find('.delta').text()).toMatch(/3 pts · \+2\.\d GB/)
  })

  it('keeps the always-info sizes out of Findings', async () => {
    const { wrapper } = await mountServer('vps-sg-2')
    const findings = wrapper.findComponent({ name: 'ServerFindingsCard' })
    expect(findings.text()).not.toContain('db.size')
    expect(findings.text()).not.toContain('disk.path')
  })

  it('draws the disk trend with the forecast on the newest scan', async () => {
    const { wrapper } = await mountServer('vps-sg-2')
    expect(wrapper.find('[aria-roledescription="chart"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('crit ≥ 90%')
  })

  it('lists the containers of the host and its findings, and no Explain button', async () => {
    const { wrapper } = await mountServer('vps-sg-2')
    expect(wrapper.text()).toContain('tiemtra-api-worker-1')
    expect(wrapper.text()).toContain('disk.fs')
    expect(wrapper.text()).not.toMatch(/explain/i)
  })

  it('says a host that did not answer is not re-checked, keeps its values and retries it', async () => {
    const { wrapper, calls } = await mountServer('legacy-shop')
    expect(wrapper.text()).toContain('legacy-shop not re-checked since #6')
    expect(wrapper.text()).toContain(
      'Couldn’t reach it in this scan; the values below are from #6 and keep their colour.',
    )
    expect(wrapper.findAll('.kpi')[0]?.text()).toContain('Not re-checked since #6')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Retry legacy-shop')
      ?.trigger('click')
    await flushPromises()
    const start = calls.find((c) => c.cmd === 'scan_start')
    expect(start?.args.scope).toEqual({ projects: [], hosts: ['legacy-shop'] })
  })

  it('names a server it does not know and offers the way back', async () => {
    const { wrapper } = await mountServer('nope')
    expect(wrapper.text()).toContain('Server not found')
    expect(wrapper.text()).toContain('nope is no longer in your projects or ~/.ssh/config.')
    expect(wrapper.text()).toContain('Back to Overview')
    expect(wrapper.find('article.kpi').exists()).toBe(false)
  })

  it('over a day old: keeps the values, drops the changes and colours, offers Scan now', async () => {
    const { wrapper } = await mountServer('vps-sg-2')
    expect(wrapper.text()).toMatch(/From scan #12 · \d+ days ago/)
    expect(wrapper.text()).toContain(
      'Values stay, deltas and severity colours are hidden until a fresh scan.',
    )
    expect(wrapper.findAll('.kpi')[2]?.find('.big').text()).toContain('87')
    const delta = wrapper.findAll('.kpi')[2]?.find('.delta')
    expect(delta?.text()).not.toContain('pts')
    expect(delta?.find('.glyph').exists()).toBe(false)
    expect(wrapper.find('.results-aged').exists()).toBe(true)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Scan now')).toBe(true)
  })

  it('says which host the running scan reads, while the values stay', async () => {
    freshClock()
    const { wrapper } = await mountServer('vps-sg-2')
    useScanStore().run = {
      scan_id: 's1',
      started_at: '2026-09-26T06:59:00Z',
      next_seq: 13,
      hosts: { 'vps-sg-2': { state: 'running', facts: 0, dropped: 0 } },
    }
    await flushPromises()
    expect(wrapper.text()).toContain('Scanning vps-sg-2…')
    expect(wrapper.text()).toContain(
      'Last values stay in place; a value that changes cross-fades when it lands.',
    )
    expect(wrapper.findAll('.kpi')).toHaveLength(4)
  })

  it('before the first scan says the page fills after it and scans this server', async () => {
    const latest = timeline.reports['12']
    const { wrapper, calls } = await mountServer('vps-sg-2', latest && { ...latest, seq: null })
    expect(wrapper.text()).toContain('No result yet')
    expect(wrapper.text()).toContain('This tab fills after the first scan of vps-sg-2.')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Scan vps-sg-2')
      ?.trigger('click')
    await flushPromises()
    const start = calls.find((c) => c.cmd === 'scan_start')
    expect(start?.args.scope).toEqual({ projects: [], hosts: ['vps-sg-2'] })
  })

  it('names why the saved scan could not be read and tries again', async () => {
    setActivePinia(createPinia())
    const { wrapper } = await mountServer('vps-sg-2', null)
    useReportStore().error = { code: { kind: 'store_busy' }, retryable: true } as never
    await flushPromises()
    expect(wrapper.text()).toContain('Couldn’t load this tab')
    expect(wrapper.text()).toContain(
      'The saved scan could not be read (store busy). Nothing on the server changed.',
    )
    expect(wrapper.findAll('button').some((b) => b.text() === 'Try again')).toBe(true)
  })

  it('hides the scan controls and the scan line for a server it does not know', async () => {
    const { wrapper } = await mountServer('nope')
    expect(wrapper.text()).not.toContain('Scan server')
    expect(wrapper.text()).not.toContain('scan #')
    expect(wrapper.text()).not.toContain('vs #')
  })

  it('scans only this server when asked', async () => {
    const { wrapper, calls } = await mountServer('vps-sg-2')
    const button = wrapper.findAll('button').find((b) => b.text().includes('Scan server'))
    await button?.trigger('click')
    await flushPromises()
    const start = calls.find((c) => c.cmd === 'scan_start')
    expect(start?.args.scope).toEqual({ projects: [], hosts: ['vps-sg-2'] })
  })

  it('shows skeletons while the first report is read', async () => {
    const { wrapper } = await mountServer('vps-sg-2', null)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.find('article.kpi').exists()).toBe(false)
  })
})
