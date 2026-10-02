// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { shellProjects, shellReport } from '@/testing/shell-fixture'
import AppWindow from './AppWindow.vue'

let reportFullscreen: (full: boolean) => void = () => {}
const stop = vi.fn()

vi.mock('@/api', async (original) => ({
  ...(await original<typeof import('@/api')>()),
  watchFullscreen: vi.fn(async (onChange: (full: boolean) => void) => {
    reportFullscreen = onChange
    return stop
  }),
}))

async function mountWindow() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'overview', component: { template: '<div />' } },
      { path: '/history', name: 'history', component: { template: '<div />' } },
      { path: '/project/:id/:tab?', name: 'project', component: { template: '<div />' } },
      { path: '/server/:host', name: 'server', component: { template: '<div />' } },
      { path: '/settings/:section?', name: 'settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(AppWindow, {
    global: { plugins: [i18n, router] },
    slots: { default: '<p />' },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  useReportStore().latest = shellReport()
  useProjectsStore().details = shellProjects()
  stop.mockClear()
})
afterEach(() => {
  document.body.replaceChildren()
  delete document.documentElement.dataset.fullscreen
})

describe('AppWindow title bar', () => {
  it('has one 40 px drag strip over the sidebar and one over the page', async () => {
    const wrapper = await mountWindow()
    const strips = wrapper.findAll('[data-tauri-drag-region]')
    expect(strips).toHaveLength(2)
    expect(wrapper.get('.side').find('[data-tauri-drag-region]').exists()).toBe(true)
    expect(wrapper.get('.main').find('[data-tauri-drag-region]').exists()).toBe(true)
    // Decorative: nothing for a screen reader to find in it.
    expect(strips.every((s) => s.attributes('aria-hidden') === 'true')).toBe(true)
  })

  it('marks the document while the window is in full screen and stops watching on unmount', async () => {
    const wrapper = await mountWindow()
    reportFullscreen(true)
    expect(document.documentElement.dataset.fullscreen).toBe('true')
    reportFullscreen(false)
    expect(document.documentElement.dataset.fullscreen).toBe('false')
    wrapper.unmount()
    expect(stop).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.fullscreen).toBeUndefined()
  })
})
