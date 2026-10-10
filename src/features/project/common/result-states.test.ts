// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ResultsMock, type ResultsVariant } from '@/api/dev-mock-results'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import type { HostOutcome } from '@/api'
import { useHostKeyStore } from '@/stores/host-key'
import { useProjectSheetStore } from '@/stores/project-sheet'
import type { ResultsBundle } from '@/testing/results-bundle'
import raw from '@/testing/fixtures/results.json'
import ProjectHistoryTab from '../history/ProjectHistoryTab.vue'
import ProjectSecurityTab from '../security/ProjectSecurityTab.vue'
import ProjectContainersTab from '../containers/ProjectContainersTab.vue'
import ProjectDatabaseTab from '../database/ProjectDatabaseTab.vue'
import ProjectDiskTab from '../disk/ProjectDiskTab.vue'
import ProjectOverviewTab from '../overview/ProjectOverviewTab.vue'

const bundle = raw as unknown as ResultsBundle

type Tab = typeof ProjectDiskTab

async function mountTab(
  tab: Tab,
  variant: string,
  id = 'tiemtra',
  edit?: (reports: ReturnType<typeof useReportStore>) => void,
) {
  const mock = new ResultsMock(variant as ResultsVariant, bundle)
  const starts: unknown[] = []
  mockCommands((cmd, args) => {
    // Only the scope is checked: the mock's own scan would keep timers running past the test.
    if (cmd === 'scan_start') {
      starts.push(args.scope)
      return { scan_id: 'test' }
    }
    return mock.handle(cmd, args) ?? null
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  // The `loading` variant never answers: the read is started, not awaited.
  const read = useReportStore().loadLatest()
  if (variant !== 'loading') await read
  await useProjectsStore().loadDetails()
  edit?.(useReportStore())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/project/:id/:tab?', name: 'project', component: { template: '<div />' } },
      { path: '/server/:host', name: 'server', component: { template: '<div />' } },
      { path: '/settings/:section?', name: 'settings', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(tab, { props: { id }, global: { plugins: [i18n, router, pinia] } })
  await flushPromises()
  return { wrapper, starts, router }
}

function button(wrapper: Awaited<ReturnType<typeof mountTab>>['wrapper'], text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

beforeEach(() => {
  i18n.global.locale.value = 'en'
})
afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Result screens, shared states (board 30)', () => {
  it('holds the place with a skeleton while the report is read', async () => {
    const { wrapper } = await mountTab(ProjectDiskTab, 'loading')
    expect(wrapper.find('.shell').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('.skeleton').exists()).toBe(true)
  })

  it('says the tab could not load, that nothing on the server changed, and tries again', async () => {
    const { wrapper } = await mountTab(ProjectDiskTab, 'error')
    expect(wrapper.text()).toContain('Couldn’t load this tab')
    expect(wrapper.text()).toContain('Nothing on the server changed.')
    expect(button(wrapper, 'Try again')).toBeDefined()
  })

  it('before the first scan says the tab fills after it and scans just this project', async () => {
    const { wrapper, starts } = await mountTab(ProjectDatabaseTab, 'first-scan')
    const name = useProjectsStore().details.find((p) => p.id === 'tiemtra')?.name ?? ''
    expect(wrapper.text()).toContain('No result yet')
    expect(wrapper.text()).toContain(`This tab fills after the first scan of ${name}.`)
    await button(wrapper, `Scan ${name}`)?.trigger('click')
    await flushPromises()
    expect(starts).toEqual([{ projects: ['tiemtra'], hosts: [] }])
  })

  it('over a day old keeps the values, hides the changes and colours, and offers Scan now', async () => {
    const { wrapper, starts } = await mountTab(ProjectDatabaseTab, 'stale')
    expect(wrapper.text()).toMatch(/From scan #9 · 4 days ago/)
    expect(wrapper.text()).toContain(
      'Values stay, deltas and severity colours are hidden until a fresh scan.',
    )
    expect(wrapper.find('.results-aged').exists()).toBe(true)
    expect(wrapper.text()).not.toMatch(/[+−-]\d[\d.,]* ?[KMG]?B since #/)
    await button(wrapper, 'Scan now')?.trigger('click')
    await flushPromises()
    expect(starts).toEqual([{ projects: ['tiemtra'], hosts: [] }])
  })

  it('over a day old drops the change and the outline of the folder that grew', async () => {
    const { wrapper } = await mountTab(ProjectDiskTab, 'stale')
    const map = wrapper.get('.treemap').text()
    expect(map).not.toContain('no change')
    expect(map).not.toMatch(/\+\d/)
    expect(wrapper.find('.treemap .tone-grow').exists()).toBe(false)
  })

  it('keeps the changes and colours when the results are current', async () => {
    const { wrapper } = await mountTab(ProjectDatabaseTab, 'results')
    expect(wrapper.find('.results-aged').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Scan now')
  })

  it('names the host the running scan reads while the values stay', async () => {
    const { wrapper } = await mountTab(ProjectDiskTab, 'results')
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
    expect(wrapper.find('.treemap').exists()).toBe(true)
  })

  it('says which host did not answer and retries only that host', async () => {
    const { wrapper, starts } = await mountTab(ProjectContainersTab, 'tab-unreachable')
    expect(wrapper.text()).toContain('vps-sg-2 did not answer scan #12')
    await button(wrapper, 'Retry vps-sg-2')?.trigger('click')
    await flushPromises()
    expect(starts).toEqual([{ projects: [], hosts: ['vps-sg-2'] }])
  })

  it('names the group of the Overview tab that is off as the one it checks', async () => {
    const { wrapper } = await mountTab(ProjectOverviewTab, 'results')
    expect(wrapper.text()).not.toContain('URL checks are off')
  })

  it('gives the Security tab the same error, first scan and old states', async () => {
    const error = await mountTab(ProjectSecurityTab, 'error')
    expect(error.wrapper.text()).toContain('Couldn’t load this tab')
    const first = await mountTab(ProjectSecurityTab, 'first-scan')
    expect(first.wrapper.text()).toContain('No result yet')
    const old = await mountTab(ProjectSecurityTab, 'stale')
    expect(old.wrapper.text()).toMatch(/From scan #9 · 4 days ago/)
    expect(old.wrapper.find('.results-aged').exists()).toBe(true)
  })

  it('gives the History tab the same error and first-scan states', async () => {
    const error = await mountTab(ProjectHistoryTab, 'error')
    expect(error.wrapper.text()).toContain('Couldn’t load this tab')
    const first = await mountTab(ProjectHistoryTab, 'first-scan')
    expect(first.wrapper.text()).toContain('No result yet')
  })

  describe('a host that could not be scanned, by cause (board 30, #274)', () => {
    /** The latest scan with vps-sg-2 failed as `outcome`, for the tiemtra project. */
    function failVps(outcome: HostOutcome) {
      return (reports: ReturnType<typeof useReportStore>) => {
        const latest = reports.latest
        if (!latest) return
        reports.latest = {
          ...latest,
          servers: latest.servers.map((s) => (s.host === 'vps-sg-2' ? { ...s, outcome } : s)),
          projects: latest.projects.map((p) =>
            p.id === 'tiemtra' ? { ...p, unreachable_hosts: ['vps-sg-2'] } : p,
          ),
        }
      }
    }

    it('retries only a network failure, timed out included', async () => {
      const { wrapper } = await mountTab(
        ProjectContainersTab,
        'results',
        'tiemtra',
        failVps({ state: 'timeout' }),
      )
      expect(wrapper.text()).toContain('vps-sg-2 did not answer scan #12')
      expect(button(wrapper, 'Retry vps-sg-2')).toBeDefined()
    })

    it('a refused key says so and opens Settings › Hosts on that host', async () => {
      const { wrapper, router } = await mountTab(
        ProjectContainersTab,
        'results',
        'tiemtra',
        failVps({ state: 'auth_failed' }),
      )
      expect(wrapper.text()).toContain('vps-sg-2 refused your key.')
      expect(wrapper.text()).toContain('Couldn’t reach it in this scan')
      expect(button(wrapper, 'Retry vps-sg-2')).toBeUndefined()
      await button(wrapper, 'Fix login')?.trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.fullPath).toBe('/settings/hosts')
    })

    it('a changed host key says not to go on and opens the host key review', async () => {
      const { wrapper } = await mountTab(
        ProjectContainersTab,
        'results',
        'tiemtra',
        failVps({ state: 'host_key_changed', fp: 'SHA256:abc' }),
      )
      expect(wrapper.text()).toContain(
        'vps-sg-2 has a different host key. Do not continue until you know why.',
      )
      await button(wrapper, 'Review host key')?.trigger('click')
      await flushPromises()
      expect(useHostKeyStore().alias).toBe('vps-sg-2')
    })

    it('a host gone from ~/.ssh/config opens this project to edit', async () => {
      const { wrapper } = await mountTab(
        ProjectContainersTab,
        'results',
        'tiemtra',
        failVps({ state: 'not_in_config' }),
      )
      expect(wrapper.text()).toContain('vps-sg-2 is no longer in ~/.ssh/config.')
      await button(wrapper, 'Edit project')?.trigger('click')
      await flushPromises()
      expect(useProjectSheetStore().isOpen).toBe(true)
    })
  })
})
