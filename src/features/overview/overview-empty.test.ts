// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { shellProjects, shellReport } from '@/testing/shell-fixture'
import { emptyListing, sampleListing } from '@/testing/setup-fixture'
import OverviewView from './OverviewView.vue'

let noConfig = false

async function mountOverview() {
  mockCommands((cmd) => {
    if (cmd === 'hosts_list') return noConfig ? emptyListing('no_config') : sampleListing()
    if (cmd === 'ssh_environment') {
      return {
        agent: noConfig ? 'empty' : 'keys',
        keys: noConfig ? 0 : 2,
        termius_installed: noConfig,
      }
    }
    return null
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  const wrapper = mount(OverviewView, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  noConfig = false
})
afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Overview with no project', () => {
  it('shows the first screen when projects.json was read and is empty', async () => {
    useProjectsStore().loaded = true
    const wrapper = await mountOverview()
    expect(wrapper.text()).toContain('Check every server in one pass.')
    expect(wrapper.find('.overview').exists()).toBe(false)
  })

  it('shows the help screen when there is no ssh config', async () => {
    noConfig = true
    useProjectsStore().loaded = true
    const wrapper = await mountOverview()
    expect(wrapper.text()).toContain('Let’s make them visible to ssh.')
    expect(wrapper.text()).not.toContain('Check every server in one pass.')
  })

  it('shows Overview itself when a project exists', async () => {
    useProjectsStore().loaded = true
    useProjectsStore().details = shellProjects()
    useReportStore().latest = shellReport()
    const wrapper = await mountOverview()
    expect(wrapper.find('.overview').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Check every server in one pass.')
  })

  it('does not take a failed read of projects.json for "no projects"', async () => {
    // Nothing was loaded: `loaded` is still false, whatever `details` holds.
    const wrapper = await mountOverview()
    expect(wrapper.find('.overview').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Check every server in one pass.')
  })

  it('leaves ⌘R to the empty screen: no scan starts with nothing to scan', async () => {
    useProjectsStore().loaded = true
    const wrapper = await mountOverview()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', metaKey: true }))
    await flushPromises()
    expect(wrapper.text()).toContain('Check every server in one pass.')
  })
})
