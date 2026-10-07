// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { clearMocks, mockCommands } from '@/api/testing'
import { report } from '@/testing/report-fixture'
import { useHistoryStore } from './history'
import { useReportStore } from './report'

const view = { scans: [], keep: 20, bytes: 1000 }
let calls: { cmd: string; args: Record<string, unknown> }[]
let failReport = false

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  setActivePinia(createPinia())
  calls = []
  failReport = false
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    if (cmd === 'history_list') return view
    if (cmd === 'rules_list') return [{ id: 'rule-1' }]
    if (cmd === 'report_at') {
      if (failReport) throw { code: { kind: 'io', path: 'snapshots/000009.json' }, retryable: true }
      return report({ seq: Number(args.seq) })
    }
    if (cmd === 'history_facts') return [{ seq: 1, host: 'vps-a', fact: { check: 'disk.fs' } }]
    throw new Error(`unexpected command ${cmd}`)
  })
})

afterEach(() => clearMocks())

describe('useHistoryStore', () => {
  it('reads the scan summaries and the rules together', async () => {
    const store = useHistoryStore()
    await store.load()
    expect(store.view).toEqual(view)
    expect(store.rules).toEqual([{ id: 'rule-1' }])
    expect(store.loading).toBe(false)
  })

  it('reads an older report once and shares it with the report store', async () => {
    const store = useHistoryStore()
    const reports = useReportStore()
    expect((await store.report(9))?.seq).toBe(9)
    expect((await store.report(9))?.seq).toBe(9)
    expect(calls.filter((c) => c.cmd === 'report_at')).toHaveLength(1)
    expect(reports.cached(9)?.seq).toBe(9)
  })

  it('answers null and keeps the error when an older scan is no longer kept', async () => {
    const store = useHistoryStore()
    failReport = true
    expect(await store.report(9)).toBeNull()
    expect(store.reportError?.code.kind).toBe('io')
  })

  it('asks for the facts of one set of checks once, whatever their order', async () => {
    const store = useHistoryStore()
    await store.factsOf(['disk.fs', 'db.size'])
    await store.factsOf(['db.size', 'disk.fs'])
    expect(calls.filter((c) => c.cmd === 'history_facts')).toHaveLength(1)
    expect(calls.find((c) => c.cmd === 'history_facts')?.args).toEqual({
      checks: ['disk.fs', 'db.size'],
      last: 30,
    })
  })

  it('reads everything again when a new scan lands', async () => {
    const reports = useReportStore()
    const store = useHistoryStore()
    reports.latest = report({ seq: 12 })
    await settle()
    await store.factsOf(['disk.fs'])
    const before = calls.filter((c) => c.cmd === 'history_list').length
    reports.latest = report({ seq: 13 })
    await nextTick()
    await settle()
    await store.factsOf(['disk.fs'])
    expect(calls.filter((c) => c.cmd === 'history_list').length).toBe(before + 1)
    expect(calls.filter((c) => c.cmd === 'history_facts')).toHaveLength(2)
  })
})
