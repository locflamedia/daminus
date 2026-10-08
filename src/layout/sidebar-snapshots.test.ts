// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import type { HistoryView, ScanSummary } from '@/api'
import { i18n } from '@/i18n'
import { useHistoryStore } from '@/stores/history'
import SidebarSnapshots from './SidebarSnapshots.vue'

function show(view: HistoryView | null) {
  setActivePinia(createPinia())
  useHistoryStore().view = view
  return mount(SidebarSnapshots, { global: { plugins: [i18n] } })
}

const scans = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ seq: i + 1 }) as unknown as ScanSummary)

describe('Snapshots card', () => {
  it('says how many scans are kept out of the limit and what they weigh', () => {
    const w = show({ scans: scans(12), keep: 20, bytes: 184n * 1024n })
    expect(w.text()).toContain('12 of 20 kept · 184 KB on disk')
    expect(w.findAll('.cells i.on')).toHaveLength(12)
    expect(w.findAll('.cells i')).toHaveLength(20)
  })

  it('has no bar when every scan is kept', () => {
    const w = show({ scans: scans(3), keep: null, bytes: 2048n })
    expect(w.text()).toContain('3 kept')
    expect(w.find('.cells').exists()).toBe(false)
  })

  it('draws nothing before the scans are read', () => {
    expect(show(null).find('.snapshots').exists()).toBe(false)
  })
})
