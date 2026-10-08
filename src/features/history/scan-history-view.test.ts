// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Report } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useReportStore } from '@/stores/report'
import bundle from '@/testing/fixtures/results.json'
import ScanHistoryView from './ScanHistoryView.vue'

const timeline = bundle as unknown as {
  history: unknown
  reports: Record<string, Report>
  rules: unknown[]
  facts: unknown[]
}

function answer(history: unknown) {
  mockCommands((cmd, args) => {
    if (cmd === 'history_list') return history
    if (cmd === 'rules_list') return []
    if (cmd === 'report_at') return timeline.reports[String(args.seq)]
    return null
  })
}

async function mountView(history: unknown = timeline.history) {
  answer(history)
  setActivePinia(createPinia())
  useReportStore().latest = timeline.reports['12'] ?? null
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  const wrapper = mount(ScanHistoryView, { global: { plugins: [i18n, router] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})
beforeEach(() => undefined)

describe('Scan history', () => {
  it('lists every kept scan newest first and says how many are kept', async () => {
    const wrapper = await mountView()
    const rows = wrapper.findAll('button.row').map((r) => r.find('.num').text())
    expect(rows[0]).toBe('#12')
    expect(rows).toHaveLength(12)
    expect(wrapper.get('header .meta').text()).toContain('12 scans since')
    expect(wrapper.get('header .meta').text()).toContain('keeping the last 20')
  })

  it('compares the newest scan with the one before it until two others are picked', async () => {
    const wrapper = await mountView()
    const pressed = wrapper
      .findAll('button.row[aria-pressed="true"]')
      .map((r) => r.find('.num').text())
    expect(pressed).toEqual(['#12', '#11'])
    expect(wrapper.text()).toContain('unchanged')
    await wrapper
      .findAll('button.row')
      .find((r) => r.find('.num').text() === '#5')
      ?.trigger('click')
    const after = wrapper
      .findAll('button.row[aria-pressed="true"]')
      .map((r) => r.find('.num').text())
    expect(after).toEqual(['#12', '#5'])
  })

  it('narrows the columns and the list to one project', async () => {
    const wrapper = await mountView()
    const before = wrapper.findAll('button.row')[0]?.findAll('.tag').length ?? 0
    const tab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'booking')
    await tab?.trigger('click')
    const after = wrapper.findAll('button.row')[0]?.findAll('.tag').length ?? 0
    expect(after).toBeLessThanOrEqual(before)
    expect(
      wrapper
        .findAll('[role="tab"]')
        .find((t) => t.text() === 'booking')
        ?.attributes('aria-selected'),
    ).toBe('true')
  })

  it('says there are no scans yet and offers to run one', async () => {
    const wrapper = await mountView({ scans: [], keep: null, bytes: 0 })
    expect(wrapper.text()).toContain('No scans yet')
    expect(wrapper.find('button.row').exists()).toBe(false)
  })

  it('does not draw an export button, since nothing can write one', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).not.toMatch(/export/i)
  })
})
