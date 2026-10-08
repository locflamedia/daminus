// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import SettingsView from './SettingsView.vue'

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

afterEach(() => document.body.replaceChildren())

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
