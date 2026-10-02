// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import ProjectHeader from './ProjectHeader.vue'

let wrapper: VueWrapper | undefined
const original = window.innerWidth

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: original })
  document.body.replaceChildren()
})

async function make(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'overview', component: { template: '<div />' } },
      { path: '/p/:id/:tab', name: 'project', component: { template: '<div />' } },
    ],
  })
  await router.push('/p/kho-hang/disk')
  wrapper = mount(ProjectHeader, {
    props: { id: 'kho-hang', tab: 'disk', tabLevels: { disk: 'warn' } },
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  })
  return router
}

describe('ProjectHeader tabs', () => {
  it('is a tab strip from 960 px up', async () => {
    await make(960)
    expect(wrapper!.findAll('[role="tab"]')).toHaveLength(6)
    expect(wrapper!.find('[aria-haspopup="menu"]').exists()).toBe(false)
  })

  it('becomes a menu under 960 px, named by the current tab', async () => {
    await make(900)
    expect(wrapper!.find('[role="tablist"]').exists()).toBe(false)
    const trigger = wrapper!.get('[aria-haspopup="menu"]')
    expect(trigger.text()).toContain('Disk')
    expect(trigger.find('.mark.warn').exists()).toBe(true)
  })

  it('opens the menu with every tab and goes to the one picked', async () => {
    const router = await make(900)
    await wrapper!.get('[aria-haspopup="menu"]').trigger('click')
    const items = [...document.querySelectorAll('[role="menuitem"]')]
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      'Overview',
      'Disk',
      'Database',
      'Containers',
      'Security',
      'History',
    ])
    ;(items[4] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.currentRoute.value.params.tab).toBe('security')
  })
})
