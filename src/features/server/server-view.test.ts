// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Report } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useReportStore } from '@/stores/report'
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

afterEach(() => {
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
    const { wrapper } = await mountServer('vps-sg-2')
    expect(wrapper.text()).toContain('vs #11')
    expect(wrapper.findAll('.kpi')[2]?.find('.delta').text()).toContain('3 pts')
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

  it('says a host that did not answer is old and keeps its last results', async () => {
    const { wrapper } = await mountServer('legacy-shop')
    expect(wrapper.text()).toContain('legacy-shop did not answer')
    expect(wrapper.findAll('.kpi')[0]?.text()).toContain('Not re-checked since #6')
  })

  it('names a server it does not know and offers the way back', async () => {
    const { wrapper } = await mountServer('nope')
    expect(wrapper.text()).toContain('does not know a server called nope')
    expect(wrapper.find('article.kpi').exists()).toBe(false)
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
