// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useSetupStore } from '@/stores/setup'
import { sampleListing } from '@/testing/setup-fixture'
import SetupView from './SetupView.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  mockCommands((cmd) => {
    if (cmd === 'hosts_list') return sampleListing()
    if (cmd === 'ssh_environment') return { agent: 'keys', keys: 1 }
    return null
  })
})
afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('SetupView', () => {
  it('opens the add-by-hand sheet on ⌘N and closes it with Escape', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const wrapper = mount(SetupView, {
      attachTo: document.body,
      global: { plugins: [i18n, router] },
    })
    await flushPromises()
    const setup = useSetupStore()
    expect(setup.addHostOpen).toBe(false)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true }))
    await flushPromises()
    expect(setup.addHostOpen).toBe(true)
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      'Add a host by hand',
    )

    document.body
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(setup.addHostOpen).toBe(false)
    wrapper.unmount()
  })
})
