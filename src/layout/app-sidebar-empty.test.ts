// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { SshEnvironment } from '@/api'
import { i18n } from '@/i18n'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useSetupStore } from '@/stores/setup'
import { shellProjects, shellReport } from '@/testing/shell-fixture'
import { emptyListing, sampleListing } from '@/testing/setup-fixture'
import AppSidebar from './AppSidebar.vue'

async function mountSidebar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/history', name: 'history', component: { template: '<div />' } },
      { path: '/project/:id/:tab?', name: 'project', component: { template: '<div />' } },
      { path: '/server/:host', name: 'server', component: { template: '<div />' } },
      { path: '/settings/:section?', name: 'settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(AppSidebar, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

function know(
  setup: ReturnType<typeof useSetupStore>,
  env: SshEnvironment,
  config = sampleListing(),
) {
  setup.listing = config
  setup.environment = env
}

beforeEach(() => {
  setActivePinia(createPinia())
})
afterEach(() => document.body.replaceChildren())

describe('AppSidebar with no project', () => {
  it('draws the ghost slots, zero counts and the hint on a first launch', async () => {
    useProjectsStore().loaded = true
    know(useSetupStore(), { agent: 'keys', keys: 2, termius_installed: false })
    const wrapper = await mountSidebar()
    const groups = wrapper.findAll('.group').map((g) => g.text())
    expect(groups).toEqual(['Projects 0', 'Servers 0'])
    expect(wrapper.findAll('.slot')).toHaveLength(3)
    expect(wrapper.text()).toContain(
      'Projects and servers you add show up here, sorted by what needs a look.',
    )
    expect(wrapper.find('.search').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Why not read Termius?')
  })

  it('reads 0, never blank, before the config was read', async () => {
    useProjectsStore().loaded = true
    const wrapper = await mountSidebar()
    expect(wrapper.findAll('.group').map((g) => g.text())).toEqual(['Projects 0', 'Servers 0'])
  })

  it('on the help screen drops the search and the ghosts, and explains Termius when it is installed', async () => {
    useProjectsStore().loaded = true
    know(
      useSetupStore(),
      { agent: 'empty', keys: 0, termius_installed: true },
      emptyListing('no_config'),
    )
    const wrapper = await mountSidebar()
    expect(wrapper.find('.search').exists()).toBe(false)
    expect(wrapper.findAll('.slot')).toHaveLength(0)
    expect(wrapper.findAll('.group').map((g) => g.text())).toEqual(['Projects 0', 'Servers 0'])
    expect(wrapper.get('.why').text()).toContain('Why not read Termius?')
  })

  it('does not explain Termius when it is not installed', async () => {
    useProjectsStore().loaded = true
    know(
      useSetupStore(),
      { agent: 'empty', keys: 0, termius_installed: false },
      emptyListing('no_config'),
    )
    const wrapper = await mountSidebar()
    expect(wrapper.find('.why').exists()).toBe(false)
  })

  it('keeps its usual rows once a project exists', async () => {
    useProjectsStore().loaded = true
    useProjectsStore().details = shellProjects()
    useReportStore().latest = shellReport()
    const wrapper = await mountSidebar()
    expect(wrapper.find('.ghosts').exists()).toBe(false)
    expect(wrapper.find('.search').exists()).toBe(true)
    expect(wrapper.text()).toContain('kho-hang')
  })

  it('keeps one Servers group and no issue count when scans outlived projects.json', async () => {
    useProjectsStore().loaded = true
    useReportStore().latest = shellReport()
    know(useSetupStore(), { agent: 'keys', keys: 2, termius_installed: false })
    const wrapper = await mountSidebar()
    expect(wrapper.findAll('.group').map((g) => g.text())).toEqual(['Projects 0', 'Servers 0'])
    expect(wrapper.find('.item.server').exists()).toBe(false)
    expect(wrapper.find('.item .count').exists()).toBe(false)
  })

  it('does not take a failed read of projects.json for a first launch', async () => {
    // `loaded` stays false when the file could not be read.
    const wrapper = await mountSidebar()
    expect(wrapper.find('.ghosts').exists()).toBe(false)
  })
})
