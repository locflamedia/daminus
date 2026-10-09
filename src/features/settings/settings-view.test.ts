// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { SetupMock } from '@/api/dev-mock-setup'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import SettingsView from './SettingsView.vue'

const asked: string[] = []

beforeEach(() => {
  asked.length = 0
  const setup = new SetupMock('setup', 1000)
  mockCommands((cmd, args) => {
    asked.push(cmd)
    return setup.handle(cmd, args) ?? null
  })
})

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings/:section?', name: 'settings', component: SettingsView }],
  })
  await router.push(path)
  const wrapper = mount(SettingsView, { global: { plugins: [createPinia(), i18n, router] } })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('SettingsView header', () => {
  it('writes the section title and the line that says what it is for', async () => {
    const wrapper = await mountAt('/settings/scan')
    expect(wrapper.get('h2').text()).toBe('Scan')
    expect(wrapper.get('.sub').text()).toBe(
      'What a scan reads, how long it waits and when it speaks up.',
    )
  })

  it('opens on General, and About has the title alone', async () => {
    expect((await mountAt('/settings')).get('h2').text()).toBe('General')
    const about = await mountAt('/settings/about')
    expect(about.get('h2').text()).toBe('About')
    expect(about.find('.sub').exists()).toBe(false)
  })
})

describe('SettingsView data', () => {
  it('reads the ssh hosts once on any section, so the nav can count them', async () => {
    await mountAt('/settings/general')
    expect(asked.filter((c) => c === 'hosts_list')).toHaveLength(1)
  })
})
