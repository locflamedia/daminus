// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HostOutcome } from '@/api'
import { i18n } from '@/i18n'
import { LAYOUT_RANGE, type SidebarRange } from '@/lib/viewport'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import { shellProjects, shellReport, shellScanRun } from '@/testing/shell-fixture'
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

  it('scrolls the lists alone, so the Settings row stays outside the scrolling part', async () => {
    const wrapper = await mountShell(AppSidebar)
    const scroll = wrapper.get('.scroll')
    expect(scroll.text()).toContain('vps-sg-2')
    expect(scroll.find('.foot').exists()).toBe(false)
    expect(scroll.element.nextElementSibling?.classList.contains('foot')).toBe(true)
  })
})

describe('AppSidebar title bar and scan state', () => {
  it('leaves the first row to the window buttons of the overlay title bar', async () => {
    const wrapper = await mountShell(AppSidebar)
    const first = wrapper.get('nav').element.firstElementChild
    expect(first?.classList.contains('lights')).toBe(true)
    expect(first?.nextElementSibling?.classList.contains('brand')).toBe(true)
  })

  it('says "scanning" in accent on Overview while a scan runs, in place of the issue count', async () => {
    const wrapper = await mountShell(AppSidebar)
    const overview = () => wrapper.findAll('a.item')[0]
    expect(overview()?.get('.count').text()).toBe('5 issues')
    useScanStore().run = shellScanRun()
    await flushPromises()
    const count = overview()?.get('.count')
    expect(count?.text()).toBe('scanning')
    expect(count?.classes()).toContain('scanning')
  })
})

describe('AppSidebar with results over a day old', () => {
  const FOUR_DAYS = 4 * 86_400_000

  it('reads "4 d old" on Overview and colours no project count', async () => {
    useReportStore().latest = shellReport(FOUR_DAYS)
    const wrapper = await mountShell(AppSidebar)
    const overview = wrapper.findAll('a.item')[0]
    expect(overview?.get('.count').text()).toBe('4 d old')
    expect(overview?.get('.count').classes()).toContain('old')
    const projects = wrapper.findAll('a.item').filter((a) => a.find('.slot').exists())
    expect(projects.some((r) => r.find('.count').exists())).toBe(false)
  })

  it('keeps every server ring in the accent until a fresh scan says otherwise', async () => {
    useReportStore().latest = shellReport(FOUR_DAYS)
    const stale = await mountShell(AppSidebar)
    expect(stale.findAll('.ring').every((r) => r.classes().includes('tone-normal'))).toBe(true)
    expect(stale.findAll('.server .count').some((c) => c.classes().includes('warn'))).toBe(false)

    useReportStore().latest = shellReport()
    const fresh = await mountShell(AppSidebar)
    expect(fresh.findAll('.ring').some((r) => r.classes().includes('tone-warn'))).toBe(true)
  })

  it('is current under a day: the issue count stays', async () => {
    useReportStore().latest = shellReport(23 * 3_600_000)
    const wrapper = await mountShell(AppSidebar)
    expect(wrapper.findAll('a.item')[0]?.get('.count').text()).toBe('5 issues')
  })
})

describe('AppRail', () => {
  it('leaves the first row to the window buttons of the overlay title bar', async () => {
    const wrapper = await mountShell(AppRail, 'narrow')
    const first = wrapper.get('.scroll').element.firstElementChild
    expect(first?.classList.contains('lights')).toBe(true)
    expect(first?.nextElementSibling?.classList.contains('brand')).toBe(true)
  })

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

  it('scrolls only the projects and servers, so the Settings gear stays in a short window', async () => {
    const wrapper = await mountShell(AppRail, 'narrow')
    const mid = wrapper.get('.mid')
    expect(mid.findAll('a.project')).toHaveLength(3)
    expect(mid.find('a[aria-label="Settings"]').exists()).toBe(false)
    expect(wrapper.find('.scroll > a[aria-label="Settings"]').exists()).toBe(true)
  })
})

describe('SettingsNav', () => {
  it('leaves the first row to the window buttons of the overlay title bar', async () => {
    const wrapper = await mountShell(SettingsNav, 'wide', '/settings/general')
    expect(wrapper.get('nav').element.firstElementChild?.classList.contains('lights')).toBe(true)
  })

  it('shows the values at the right of the items down to 1080 px', async () => {
    const wrapper = await mountShell(SettingsNav, 'medium', '/settings/general')
    expect(wrapper.findAll('.hint').map((h) => h.text())).toEqual(
      expect.arrayContaining(['EN / VI', 'System', '5 of 6']),
    )
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

describe('servers that could not be scanned', () => {
  // The fixture's legacy-shop timed out connecting; give two more hosts other causes.
  function withCauses() {
    const report = shellReport()
    const outcomes: Record<string, HostOutcome> = {
      'vps-sg-1': { state: 'auth_failed' },
      'vps-sg-2': { state: 'not_in_config' },
    }
    useReportStore().latest = {
      ...report,
      servers: report.servers.map((s) =>
        outcomes[s.host] ? { ...s, outcome: outcomes[s.host] } : s,
      ),
    }
  }

  it('names the cause in the sidebar, red when the user must act', async () => {
    withCauses()
    const wrapper = await mountShell(AppSidebar)
    const label = (host: string) =>
      wrapper
        .findAll('a.server')
        .find((a) => a.get('.name').text() === host)
        ?.get('.count')
    expect(label('vps-sg-1')?.text()).toBe('Key refused')
    expect(label('vps-sg-1')?.classes()).toContain('crit')
    expect(label('vps-sg-2')?.text()).toBe('Not in ~/.ssh/config')
    expect(label('vps-sg-2')?.classes()).toContain('warn')
    expect(label('legacy-shop')?.text()).toBe('Unreachable')
  })

  it('keeps the host name and the full cause in the tooltip when the label is cut', async () => {
    withCauses()
    const wrapper = await mountShell(AppSidebar)
    const row = wrapper.findAll('a.server').find((a) => a.get('.name').text() === 'vps-sg-2')
    expect(row?.attributes('title')).toBe('vps-sg-2 · Not in ~/.ssh/config')
    expect(row?.get('.count').classes()).toContain('cause')
  })

  it('names the cause in the rail tooltip', async () => {
    withCauses()
    const wrapper = await mountShell(AppRail, 'narrow')
    const labels = wrapper.findAll('a.ri').map((a) => a.attributes('aria-label'))
    expect(labels).toContain('vps-sg-1 · Key refused')
    expect(labels).toContain('vps-sg-2 · Not in ~/.ssh/config')
    expect(labels).toContain('legacy-shop · Unreachable')
  })
})
