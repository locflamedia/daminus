// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HostSetup, SetupResult, SetupRun } from '@/api'
import { i18n, setI18nLocale } from '@/i18n'
import { useSetupDraftsStore } from '@/stores/setup-drafts'
import { useSetupStore } from '@/stores/setup'
import {
  SAMPLE_HOSTS,
  SAMPLE_RECORDS,
  discoveryOf,
  sampleProposal,
  sampleSetup,
} from '@/testing/setup-fixture'
import DiscoverView from './DiscoverView.vue'

const HOSTS = ['vps-sg-1', 'vps-sg-2', 'vps-hn-3', 'db-main']

function result(): SetupResult {
  const hosts: HostSetup[] = HOSTS.map((alias) => {
    const sample = SAMPLE_HOSTS.find((h) => h.alias === alias)
    if (!sample) throw new Error(alias)
    return { ...sampleSetup(sample), discovery: discoveryOf(SAMPLE_RECORDS[alias] ?? []) }
  })
  return { hosts, proposal: sampleProposal(HOSTS) }
}

const mounted: { unmount: () => void }[] = []

async function mountView(path = '/setup/discover') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/setup', component: { template: '<div />' } },
      { path: '/setup/discover', component: { template: '<div />' } },
      { path: '/setup/group', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(DiscoverView, {
    attachTo: document.body,
    global: { plugins: [i18n, router] },
  })
  await flushPromises()
  mounted.push(wrapper)
  return { wrapper, router }
}

/** What the store holds once every host has been read. */
function finish(setup: ReturnType<typeof useSetupStore>, hosts = HOSTS) {
  setup.discovering = hosts
  setup.liveItems = Object.fromEntries(hosts.map((h) => [h, SAMPLE_RECORDS[h] ?? []]))
  setup.lanes = Object.fromEntries(
    hosts.map((h) => [
      h,
      {
        outcome: { state: 'reached' as const },
        ms: 2300,
        items: 3,
        dropped: h === 'vps-hn-3' ? 2 : 0,
      },
    ]),
  )
  setup.result = result()
  setup.logins = Object.fromEntries(setup.result.hosts.map((h) => [h.host, h]))
}

function runOf(hosts: Record<string, SetupRun['hosts'][string]>): SetupRun {
  return {
    setup_id: 'r1',
    step: 'discover',
    started_at: new Date(Date.now() - 4000).toISOString(),
    next_seq: 5,
    hosts,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
  document.body.replaceChildren()
  const rail = document.createElement('div')
  rail.id = 'setup-rail'
  document.body.append(rail)
})
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('Discover screen', () => {
  it('goes back to step 1 when nothing was picked', async () => {
    const { router } = await mountView()
    expect(router.currentRoute.value.path).toBe('/setup')
  })

  it('draws a lane for each state: reading, queued, done and incomplete', async () => {
    const setup = useSetupStore()
    finish(setup, ['vps-sg-2', 'vps-hn-3'])
    setup.discovering = ['vps-sg-2', 'vps-hn-3', 'db-main', 'legacy-shop']
    delete setup.lanes['db-main']
    setup.liveItems['db-main'] = [{ rec: 'db', engine: 'mysql', origin: 'process', name: 'mysqld' }]
    setup.run = runOf({
      'db-main': { state: 'running', items: 1, dropped: 0 },
      'legacy-shop': { state: 'queued', items: 0, dropped: 0 },
    })
    const { wrapper } = await mountView()
    const states = Object.fromEntries(
      wrapper
        .findAll('[data-testid^="lane-"]')
        .map((l) => [l.attributes('data-testid'), l.attributes('data-state')]),
    )
    expect(states).toEqual({
      'lane-vps-sg-2': 'done',
      'lane-vps-hn-3': 'incomplete',
      'lane-db-main': 'running',
      'lane-legacy-shop': 'queued',
    })
    const running = wrapper.get('[data-testid="lane-db-main"]')
    expect(running.text()).toContain('Probing listening ports')
    expect(running.text()).toContain('counts roll as items land')
    expect(wrapper.get('[data-testid="lane-legacy-shop"]').text()).toContain('Queued')
    expect(wrapper.get('[data-testid="discover-chip"]').text()).toMatch(/found · 2 of 4 hosts/)
  })

  it('shows the counts by kind, a zero dim and not hidden', async () => {
    const setup = useSetupStore()
    finish(setup)
    const { wrapper } = await mountView()
    const counts = wrapper.get('[data-testid="lane-vps-sg-2"] .counts')
    expect(counts.findAll('li').map((li) => li.text())).toEqual([
      '3 sites',
      '2 compose',
      '0 pm2 apps',
      '1 database',
      '3 .env',
      '1 port',
    ])
    expect(counts.findAll('li')[2]?.classes()).toContain('zero')
  })

  it('lists one amber row per unread source with a fix that can be copied', async () => {
    const setup = useSetupStore()
    finish(setup)
    const { wrapper } = await mountView()
    const lane = wrapper.get('[data-testid="lane-vps-hn-3"]')
    expect(lane.text()).toContain('Incomplete')
    expect(lane.text()).toContain('3 sources not read')
    expect(lane.text()).toContain('pm2 under user node')
    expect(lane.text()).toContain('logs in as node')
    expect(lane.text()).toContain('sudo usermod -aG docker deploy')
    expect(lane.findAll('code').map((c) => c.text())).toContain('$ sudo usermod -aG docker deploy')
    expect(lane.text()).toContain('nginx config')
    expect(wrapper.get('[data-testid="lane-vps-sg-2"]').text()).not.toContain('not read')
  })

  it('keeps the dropped lines and unreadable .env files in a collapsed Details row', async () => {
    const setup = useSetupStore()
    finish(setup)
    const { wrapper } = await mountView()
    const lane = wrapper.get('[data-testid="lane-vps-hn-3"]')
    const toggle = lane.get('button.details')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toContain('2 lines dropped as invalid')
    // The summary wraps (it is not cut) and takes the footer's whole width when it is long.
    expect(lane.get('.foot').classes()).toContain('stacked')
    expect(lane.get('.summary').text()).toBe(toggle.text().replace(/^Details\s*/, ''))
    expect(lane.find('.expanded').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(lane.get('.expanded').text()).toContain('/var/www/kho-hang/legacy/.env')
  })

  it('reads one host again, and only that host', async () => {
    const setup = useSetupStore()
    finish(setup)
    const readAgain = vi.fn()
    setup.readAgain = readAgain
    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="read-again-vps-hn-3"]').trigger('click')
    expect(readAgain).toHaveBeenCalledWith('vps-hn-3')
  })

  it('marks a host that timed out or could not be reached, with Read again', async () => {
    const setup = useSetupStore()
    finish(setup, ['vps-sg-2', 'legacy-shop', 'db-main'])
    setup.lanes['legacy-shop'] = { outcome: { state: 'timeout' }, ms: 90000, items: 0, dropped: 0 }
    setup.lanes['db-main'] = { outcome: { state: 'auth_failed' }, ms: 900, items: 0, dropped: 0 }
    const { wrapper } = await mountView()
    const slow = wrapper.get('[data-testid="lane-legacy-shop"]')
    expect(slow.attributes('data-state')).toBe('timeout')
    expect(slow.text()).toContain('Timed out')
    expect(slow.find('[data-testid="read-again-legacy-shop"]').exists()).toBe(true)
    const refused = wrapper.get('[data-testid="lane-db-main"]')
    expect(refused.attributes('data-state')).toBe('unreachable')
    expect(refused.text()).toContain('Login refused')
  })

  it('puts the finds in their columns with the project each belongs to', async () => {
    const setup = useSetupStore()
    finish(setup)
    const { wrapper } = await mountView()
    const sites = wrapper.get('section[aria-label="Websites"]')
    expect(sites.text()).toContain('tiemtra.vn')
    expect(sites.text()).toContain('vps-sg-1 · proxy → :3000')
    expect(sites.text()).toContain('PHP · /var/www/booking')
    expect(wrapper.get('section[aria-label="Node apps"]').text()).toContain('2 instances')
    const boxes = wrapper.get('section[aria-label="Containers"]')
    expect(boxes.text()).toContain('api, worker, db, redis')
    expect(boxes.text()).toContain('Unassigned')
    const dbs = wrapper.get('section[aria-label="Databases"]')
    expect(dbs.text()).toContain('.env found for 2')
    expect(dbs.text()).toContain('PostgreSQL')
    expect(dbs.text()).toContain('MySQL')
  })

  it('keeps a listener nothing accounts for, and flags a public database port', async () => {
    const setup = useSetupStore()
    finish(setup)
    const { wrapper } = await mountView()
    const card = wrapper.get('section[aria-label="Also listening"]')
    expect(card.text()).toContain(':9000')
    expect(card.text()).toContain('php-fpm · vps-sg-2')
    const publicPort = card.get('.port.warn')
    expect(publicPort.text()).toBe(':3306 public on db-main')
    expect(card.text()).toContain('flagged again in the first security scan')
  })

  it('shows the pairs of a front end and a back end that sit apart', async () => {
    const setup = useSetupStore()
    finish(setup)
    const { wrapper } = await mountView()
    const labels = wrapper.findAll('.pair').map((p) => p.attributes('aria-label'))
    expect(labels).toContain('tiemtra: back end on vps-sg-2 :8000, front end on vps-sg-1')
  })

  it('says what discover reads, truthfully, in the sidebar rail', async () => {
    const setup = useSetupStore()
    finish(setup)
    await mountView()
    const rail = document.querySelector('#setup-rail')
    expect(rail?.textContent).toContain('docker ps -a --format')
    expect(rail?.textContent).toContain('never opened here')
    expect(rail?.querySelectorAll('.code li')).toHaveLength(6)
  })

  it('marks a find "New" once, only if it arrived while the screen was open', async () => {
    const setup = useSetupStore()
    finish(setup, ['vps-sg-1'])
    setup.run = runOf({ 'vps-sg-1': { state: 'running', items: 4, dropped: 0 } })
    const { wrapper } = await mountView()
    expect(wrapper.findAll('.new')).toHaveLength(0)
    setup.liveItems = {
      ...setup.liveItems,
      'vps-sg-1': [
        ...(setup.liveItems['vps-sg-1'] ?? []),
        {
          rec: 'vhost',
          file: 'x',
          names: ['late.vn'],
          proxy: null,
          ssl: true,
          php: false,
          listen: [443],
          root: '/srv/late',
        },
      ],
    }
    await flushPromises()
    const fresh = wrapper.findAll('.find.fresh')
    expect(fresh).toHaveLength(1)
    expect(fresh[0]?.text()).toContain('late.vn')
    expect(fresh[0]?.text()).toContain('New')
  })

  it('moves on to step 3 from the first finished host, with the drafts made', async () => {
    const setup = useSetupStore()
    const drafts = useSetupDraftsStore()
    setup.discovering = ['vps-sg-2', 'db-main']
    setup.liveItems = { 'vps-sg-2': [], 'db-main': [] }
    setup.run = runOf({
      'vps-sg-2': { state: 'running', items: 0, dropped: 0 },
      'db-main': { state: 'running', items: 0, dropped: 0 },
    })
    const { wrapper, router } = await mountView()
    const group = wrapper.get('[data-testid="discover-group"]')
    expect(group.attributes('disabled')).toBeDefined()

    finish(setup, ['vps-sg-2'])
    setup.discovering = ['vps-sg-2', 'db-main']
    await flushPromises()
    expect(group.attributes('disabled')).toBeUndefined()
    expect(group.text()).toMatch(/Group\s*\d+\s*finds/)
    await group.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/setup/group')
    expect(drafts.drafts.length).toBeGreaterThan(0)
  })

  it('continues with Enter, unless Enter was meant for a button', async () => {
    const setup = useSetupStore()
    finish(setup)
    const { wrapper, router } = await mountView()
    wrapper
      .get('[data-testid="discover-back"]')
      .element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/setup/discover')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/setup/group')
  })

  it('goes back to step 1 and keeps the ticks', async () => {
    const setup = useSetupStore()
    finish(setup)
    setup.ticked = [...HOSTS]
    const { wrapper, router } = await mountView()
    await wrapper.get('[data-testid="discover-back"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/setup')
    expect(setup.ticked).toEqual(HOSTS)
  })

  it('adds a folder by path, and rejects one that is not absolute', async () => {
    const setup = useSetupStore()
    const drafts = useSetupDraftsStore()
    finish(setup)
    setup.ticked = [...HOSTS]
    vi.spyOn(setup, 'ready', 'get').mockReturnValue(['vps-sg-2'])
    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="add-path"]').trigger('click')
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('input[placeholder="/var/www/shop"]')
    expect(input).not.toBeNull()
    input!.value = 'relative/dir'
    input!.dispatchEvent(new Event('input'))
    await flushPromises()
    document.querySelector<HTMLFormElement>('form.form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(document.body.textContent).toContain('Use an absolute path')
    expect(drafts.loose.some((l) => l.name === 'relative/dir')).toBe(false)

    input!.value = '/srv/jobs'
    input!.dispatchEvent(new Event('input'))
    await flushPromises()
    document.querySelector<HTMLFormElement>('form.form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(drafts.loose.some((l) => l.name === '/srv/jobs' && l.host === 'vps-sg-2')).toBe(true)
  })

  it('speaks Vietnamese with the same structure', async () => {
    setI18nLocale('vi')
    const setup = useSetupStore()
    finish(setup)
    const { wrapper } = await mountView()
    expect(wrapper.text()).toContain('Những gì đang chạy trên máy chủ của bạn')
    expect(wrapper.get('[data-testid="lane-vps-hn-3"]').text()).toContain('3 nguồn chưa đọc được')
    expect(wrapper.get('[data-testid="read-again-vps-hn-3"]').text()).toBe('Đọc lại')
    expect(wrapper.get('[data-testid="discover-group"]').text()).toMatch(/Gom nhóm\s*\d+\s*mục/)
  })
})
