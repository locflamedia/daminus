// @vitest-environment happy-dom
// ssh refuses ~/.ssh/config: Scan all stops before ssh. The Overview shows the config banner
// (file, line, the quoted lines, Reveal in Finder, Check again) above the last results, which
// stay as they were; no host turns unreachable and the Mac is not called offline.
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HostListing, Report } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import OverviewView from './OverviewView.vue'

const bundle = timeline as unknown as ResultsBundle
const latest = bundle.reports['12'] as Report

const REFUSED = {
  code: { kind: 'ssh_config_invalid', path: '/Users/someone/.ssh/config', line: 9 },
  retryable: false,
} as const

function listing(refused: boolean): HostListing {
  const host = { alias: 'apollo-test', file: '/Users/someone/.ssh/config', line: 1 }
  return {
    list: { config_found: true, hosts: [host], skipped: [] },
    entries: [{ host, resolved: null }],
    ...(refused && {
      config_error: {
        error: REFUSED,
        excerpt: [
          { number: 8, text: '  HostName 103.75.186.31' },
          { number: 9, text: '  Port 99999' },
        ],
      },
    }),
  } as HostListing
}

let fixed = false
const calls: string[] = []
const mounted: Array<{ unmount: () => void }> = []

async function mountOverview() {
  mockCommands((cmd, args) => {
    calls.push(cmd)
    if (cmd === 'scan_start') {
      if (!fixed) throw REFUSED
      return { scan_id: 's2', joined: false }
    }
    if (cmd === 'hosts_list') return listing(!fixed)
    if (cmd === 'ssh_environment') return { agent: 'keys', keys: 1 }
    if (cmd === 'history_list') return { ...bundle.history, bytes: 0 }
    if (cmd === 'rules_list') return bundle.rules
    if (cmd === 'history_facts') return []
    if (cmd === 'report_at') return bundle.reports[String(args.seq)]
    if (cmd === 'report_latest') return latest
    if (cmd === 'scan_status') return null
    return null
  })
  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'overview', component: stub },
      { path: '/history', name: 'history', component: stub },
      { path: '/project/:id/:tab?', name: 'project', component: stub },
      { path: '/server/:host', name: 'server', component: stub },
    ],
  })
  await router.push('/')
  const wrapper = mount(OverviewView, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  fixed = false
  calls.length = 0
  setActivePinia(createPinia())
  setI18nLocale('en')
  useReportStore().latest = latest
  useProjectsStore().details = bundle.projects
  useProjectsStore().loaded = true
})

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  clearMocks()
  document.body.replaceChildren()
})

describe('Overview when ssh refuses the ssh config', () => {
  it('shows the config banner above the last results, and nothing reads offline', async () => {
    const wrapper = await mountOverview()
    const before = wrapper.text()
    await useScanStore().start()
    await flushPromises()

    const banner = wrapper.get('.config-problem')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.text()).toContain('Could not read your SSH config')
    expect(banner.text()).toContain(
      'ssh stops at line 9 of ~/.ssh/config, so no server can connect. Fix that line, then check again.',
    )
    expect(banner.text()).toContain('Port 99999')
    // The generic error banner does not stand in for it.
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    // The last results stay: the project names of the report are still on screen.
    const name = bundle.projects[0]?.name ?? ''
    expect(before).toContain(name)
    expect(wrapper.text()).toContain(name)
    expect(wrapper.text().toLowerCase()).not.toContain('offline')
  })

  it('Check again reads the config again and the banner goes once it is fixed', async () => {
    const wrapper = await mountOverview()
    await useScanStore().start()
    await flushPromises()
    expect(wrapper.find('.config-problem').exists()).toBe(true)

    fixed = true
    const again = wrapper
      .get('.config-problem')
      .findAll('button')
      .find((b) => b.text().includes('Check again'))
    await again?.trigger('click')
    await flushPromises()
    expect(wrapper.find('.config-problem').exists()).toBe(false)
    expect(useScanStore().error).toBeNull()
  })
})
