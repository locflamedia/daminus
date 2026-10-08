// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AiProvidersView } from '@/api/bindings/AiProvidersView'
import { i18n } from '@/i18n'
import { useAiProvidersStore } from '@/stores/ai-providers'
import SidebarAiChip from './SidebarAiChip.vue'

function mountChip(view: Partial<AiProvidersView> | null) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings/:section?', name: 'settings', component: { template: '<div />' } }],
  })
  const store = useAiProvidersStore()
  store.view = view === null ? null : ({ providers: [], ...view } as AiProvidersView)
  return mount(SidebarAiChip, { global: { plugins: [i18n, router] } })
}

beforeEach(() => setActivePinia(createPinia()))

describe('SidebarAiChip', () => {
  it('names the model and opens Settings › AI', () => {
    const chip = mountChip({ provider: 'anthropic', model: 'claude-sonnet-5' })
    expect(chip.text()).toContain('claude-sonnet-5')
    expect(chip.find('a').attributes('href')).toBe('/settings/ai')
  })

  it('draws nothing while AI is off', () => {
    expect(mountChip({ provider: null, model: null }).find('a').exists()).toBe(false)
  })
})
