// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { counts, project, report } from '@/testing/report-fixture'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import { useSettingsStore } from '@/stores/settings'
import { SETTLE_MS, useDelightStore } from './delight-store'

function run() {
  return {
    scan_id: 's',
    started_at: new Date().toISOString(),
    next_seq: 0,
    hosts: {},
  }
}

/** Runs one scan to its end and lets the new report arrive. */
async function finish(end: 'done' | 'cancelled', latest = report()) {
  const scan = useScanStore()
  const reports = useReportStore()
  scan.run = run()
  await nextTick()
  scan.run = null
  scan.lastEnd = end
  await nextTick()
  reports.latest = latest
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  useReportStore().latest = report()
})
afterEach(() => vi.useRealTimers())

describe('completion', () => {
  it('plays everything for a done scan with nothing critical', async () => {
    const store = useDelightStore()
    await finish('done')
    expect(store.completion).toMatchObject({ sky: false, dust: true, settle: true })
  })

  it('never plays for a cancelled scan', async () => {
    const store = useDelightStore()
    await finish('cancelled')
    expect(store.completion).toBeNull()
  })

  it('skips sky and dust when something is critical, keeping the label', async () => {
    const store = useDelightStore()
    await finish(
      'done',
      report({ counts: counts({ crit: 1 }), projects: [project('a', { level: 'crit' })] }),
    )
    expect(store.hasCritical).toBe(true)
    expect(store.completion).toMatchObject({ sky: false, dust: false, settle: true })
  })

  it('respects the switches', async () => {
    const settings = useSettingsStore()
    settings.appearance = { ...settings.appearance, easter_eggs: false }
    const store = useDelightStore()
    await finish('done')
    expect(store.completion).toMatchObject({ dust: false, settle: false })
  })

  it('clear sky needs every project clear', async () => {
    const store = useDelightStore()
    await finish('done', report({ projects: [project('a'), project('b')] }))
    expect(store.allClear).toBe(true)
    expect(store.completion?.sky).toBe(true)
  })

  it('no sky while a warning is left', async () => {
    const store = useDelightStore()
    await finish(
      'done',
      report({ counts: counts({ warn: 1 }), projects: [project('a', { level: 'warn' })] }),
    )
    expect(store.completion?.sky).toBe(false)
  })

  it('holds the label for 600 ms after the dust arrives', async () => {
    const store = useDelightStore()
    await finish('done')
    expect(store.settled).toBe(false)
    vi.advanceTimersByTime(500)
    expect(store.settled).toBe(true)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(store.settled).toBe(false)
  })
})
