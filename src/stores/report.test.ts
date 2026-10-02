// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearMocks, mockCommands } from '@/api/testing'
import { report } from '@/testing/report-fixture'
import { useReportStore } from './report'

let answer: () => unknown

beforeEach(() => {
  setActivePinia(createPinia())
  mockCommands((cmd) => {
    if (cmd === 'report_latest') return answer()
    throw new Error(`unexpected command ${cmd}`)
  })
})

afterEach(() => clearMocks())

describe('useReportStore', () => {
  it('loads the latest report and caches it by scan number', async () => {
    answer = () => report({ seq: 12 })
    const store = useReportStore()
    await store.loadLatest()
    expect(store.latest?.seq).toBe(12)
    expect(store.cached(12)).toBe(store.latest)
    expect(store.cached(11)).toBeUndefined()
  })

  it('does not cache a report from before the first scan', async () => {
    answer = () => report({ seq: null })
    const store = useReportStore()
    await store.loadLatest()
    expect(store.latest?.seq).toBeNull()
  })

  it('keeps the last good report when a later read fails', async () => {
    const store = useReportStore()
    answer = () => report({ seq: 3 })
    await store.loadLatest()
    answer = () => {
      throw { code: { kind: 'store_busy' }, retryable: true }
    }
    await store.loadLatest()
    expect(store.latest?.seq).toBe(3)
    expect(store.error?.code.kind).toBe('store_busy')
    answer = () => report({ seq: 4 })
    await store.loadLatest()
    expect(store.latest?.seq).toBe(4)
    expect(store.error).toBeNull()
  })

  it('forgets the oldest scans past its limit', () => {
    const store = useReportStore()
    for (let seq = 1; seq <= 30; seq++) store.remember(report({ seq }))
    expect(store.cached(1)).toBeUndefined()
    expect(store.cached(6)).toBeUndefined()
    expect(store.cached(7)?.seq).toBe(7)
    expect(store.cached(30)?.seq).toBe(30)
  })
})
