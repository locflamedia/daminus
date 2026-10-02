// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { LAYOUT_RANGE, type SidebarRange } from '@/lib/viewport'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { shellProjects, shellReport } from '@/testing/shell-fixture'
import AppRail from './AppRail.vue'
import AppSidebar from './AppSidebar.vue'
import SettingsNav from './SettingsNav.vue'

async function mountShell(component: object, range: SidebarRange = 'wide', at = '/') {
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
  await router.push(at)
  const wrapper = mount(component, {
    global: {
      plugins: [i18n, router],
      provide: { [LAYOUT_RANGE as symbol]: computed(() => range) },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  useReportStore().latest = shellReport()
  useProjectsStore().details = shellProjects()
})
afterEach(() => document.body.replaceChildren())

describe('AppSidebar project rows', () => {
  it('draws a dot in the colour of each project and the count in the severity ink', async () => {
    const wrapper = await mountShell(AppSidebar)
    const rows = wrapper.findAll('a.item').filter((a) => a.find('.slot').exists())
    expect(rows.map((r) => r.find('.name').text())).toEqual(['kho-hang', 'tiemtra', 'booking'])
    expect(rows.map((r) => r.find('.own').attributes('style'))).toEqual([
      expect.stringContaining('#e0649a'),
      expect.stringContaining('#4f6bed'),
      expect.stringContaining('#9a7bea'),
    ])
    const counts = rows.map((r) => r.find('.count'))
    expect(counts[0]?.text()).toBe('3')
    expect(counts[0]?.classes()).toContain('crit')
    expect(counts[1]?.text()).toBe('2')
    expect(counts[1]?.classes()).toContain('warn')
    expect(counts[2]?.exists()).toBe(false)
  })

  it('pins one Settings row at the bottom', async () => {
    const wrapper = await mountShell(AppSidebar)
    const foot = wrapper.get('.foot')
    expect(foot.text()).toBe('Settings')
    expect(foot.get('a').attributes('href')).toBe('/settings')
  })
})

describe('AppRail', () => {
  it('shows a tile per project with its badge, and the gear alone for Settings', async () => {
    const wrapper = await mountShell(AppRail, 'narrow', '/project/kho-hang/overview')
    const tiles = wrapper.findAll('a.project')
    expect(tiles).toHaveLength(3)
    expect(tiles.map((t) => t.find('.badge').exists())).toEqual([true, true, false])
    expect(tiles[0]?.get('.badge').text()).toBe('3')
    expect(tiles[0]?.get('.badge').classes()).toContain('crit')
    expect(tiles[1]?.get('.badge').classes()).toContain('warn')
    // The open project is ringed in its own colour; the others are not.
    expect(tiles.map((t) => t.find('.tile').classes().includes('active'))).toEqual([
      true,
      false,
      false,
    ])
    const gear = wrapper.findAll('a').at(-1)
    expect(gear?.attributes('aria-label')).toBe('Settings')
    expect(gear?.text()).toBe('')
  })
})

describe('SettingsNav', () => {
  it('shows the values at the right of the items down to 1080 px', async () => {
    const wrapper = await mountShell(SettingsNav, 'medium', '/settings/general')
    expect(wrapper.findAll('.hint').map((h) => h.text())).toEqual(['English', 'System'])
  })

  it('keeps the labels and hides the values below 1080 px', async () => {
    const wrapper = await mountShell(SettingsNav, 'narrow', '/settings/general')
    expect(wrapper.findAll('.hint')).toHaveLength(0)
    expect(wrapper.findAll('a.item').map((a) => a.text())).toEqual([
      'General',
      'Appearance',
      'Scan',
      'Hosts',
      'AI providers',
      'Data',
      'About',
    ])
  })
})
