// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { useProjectSheetStore } from '@/stores/project-sheet'
import { useProjectsStore } from '@/stores/projects'
import ProjectHeader from './ProjectHeader.vue'

let wrapper: VueWrapper | undefined
const original = window.innerWidth

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: original })
  document.body.replaceChildren()
})

let pinia = createPinia()

async function make(width: number) {
  pinia = createPinia()
  setActivePinia(pinia)
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
    global: { plugins: [i18n, router, pinia] },
    attachTo: document.body,
  })
  return router
}

describe('ProjectHeader tabs', () => {
  it('keeps the scan number apart from the servers, so only the servers are cut', async () => {
    await make(1280)
    await wrapper!.setProps({ meta: 'tiemtra.vn · vps-sg-1 + vps-sg-2', scan: 'scan #12, 13:42' })
    expect(wrapper!.get('.meta').attributes('title')).toBe('tiemtra.vn · vps-sg-1 + vps-sg-2')
    expect(wrapper!.get('.scan').text()).toBe('· scan #12, 13:42')
  })

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
    const items = [...document.querySelectorAll('[role="menuitemradio"]')]
    expect(items.map((i) => i.querySelector('.label')?.textContent?.trim())).toEqual([
      'Overview',
      'Disk',
      'Database',
      'Containers',
      'Security',
      'History',
    ])
    expect(items.map((i) => i.querySelector('.hint')?.textContent)).toEqual([
      '⌘1',
      '⌘2',
      '⌘3',
      '⌘4',
      '⌘5',
      '⌘6',
    ])
    // The open tab is ticked, and the one with something to look at carries its dot.
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
      'false',
    ])
    expect(items[1]?.querySelector('.mark.warn')).not.toBeNull()
    ;(items[4] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.currentRoute.value.params.tab).toBe('security')
  })
})

describe('ProjectHeader keys', () => {
  it('opens the tabs in order with ⌘1 to ⌘6, strip or menu', async () => {
    for (const width of [1280, 900]) {
      const router = await make(width)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '5', metaKey: true }))
      await new Promise((r) => setTimeout(r, 0))
      expect(router.currentRoute.value.params.tab).toBe('security')
      wrapper!.unmount()
    }
  })

  it('ignores the number key without ⌘', async () => {
    const router = await make(1280)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(router.currentRoute.value.params.tab).toBe('disk')
  })
})

describe('ProjectHeader edit button', () => {
  it('is hidden until projects.json was read, then opens the sheet on the saved project', async () => {
    await make(1200)
    expect(wrapper!.text()).not.toContain('Edit')
    useProjectsStore().details = [
      {
        id: 'kho-hang',
        name: 'Kho hàng',
        color: '#4f6bed',
        urls: ['https://kho.example'],
        components: [{ role: 'be', host: 'vps-1', kind: 'path', path: '/srv/kho' }],
      },
    ]
    await wrapper!.vm.$nextTick()
    const edit = wrapper!.findAll('button').find((b) => b.text() === 'Edit')
    expect(edit).toBeDefined()
    await edit!.trigger('click')
    const sheet = useProjectSheetStore()
    expect(sheet.isOpen).toBe(true)
    expect(sheet.request?.mode).toBe('saved')
    expect(sheet.request?.draft).toMatchObject({ id: 'kho-hang', name: 'Kho hàng', isNew: false })
  })
})
