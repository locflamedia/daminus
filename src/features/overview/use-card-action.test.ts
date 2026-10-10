// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { HostOutcome } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { useHostKeyStore } from '@/stores/host-key'
import { useHostsSettingsStore } from '@/stores/hosts-settings'
import { useProjectSheetStore } from '@/stores/project-sheet'
import { useProjectsStore } from '@/stores/projects'
import { useScanPanelStore } from '@/stores/scan-panel'
import type { CardView } from './overview-card-text'
import { useCardAction } from './use-card-action'

let router: Router
let act: (card: CardView) => void

async function setup() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'overview', component: { template: '<div />' } },
      { path: '/project/:id/:tab?', name: 'project', component: { template: '<div />' } },
      { path: '/settings/:section?', name: 'settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const Probe = defineComponent({
    setup() {
      act = useCardAction().act
      return () => null
    },
  })
  mount(Probe, { global: { plugins: [router] } })
}

function card(action: CardView['action'], outcome: HostOutcome | null): CardView {
  return { id: 'booking', action, tab: null, retryHosts: ['db-main'], outcome } as CardView
}

beforeEach(async () => {
  setActivePinia(createPinia())
  mockCommands(() => null)
  await setup()
})
afterEach(() => clearMocks())

describe('the button of a card whose host could not be scanned', () => {
  it('Fix login opens Settings › Hosts on that host, above no scan panel', async () => {
    const panel = useScanPanelStore()
    panel.show()
    act(card('login', { state: 'auth_failed' }))
    expect(panel.open).toBe(false)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/settings/hosts')
    expect(useHostsSettingsStore().selected).toBe('db-main')
  })

  it('Review host key opens the host key screen for that host', async () => {
    act(card('host-key', { state: 'host_key_changed', fp: 'ED25519 SHA256:x' }))
    await flushPromises()
    expect(useHostKeyStore().alias).toBe('db-main')
  })

  it('Edit project opens the project sheet on the saved project', () => {
    useProjectsStore().details = [
      { id: 'booking', name: 'booking', color: '#9a7bea', urls: [], components: [] },
    ]
    const panel = useScanPanelStore()
    panel.show()
    act(card('edit', { state: 'not_in_config' }))
    expect(panel.open).toBe(false)
    const sheet = useProjectSheetStore()
    expect(sheet.isOpen).toBe(true)
    expect(sheet.request?.mode).toBe('saved')
  })
})
