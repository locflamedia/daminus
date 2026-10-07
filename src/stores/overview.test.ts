// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Report } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import { useOverviewStore } from './overview'
import { useReportStore } from './report'

const bundle = timeline as unknown as ResultsBundle
const reads: number[] = []

beforeEach(() => {
  reads.length = 0
  mockCommands((cmd, args) => {
    if (cmd === 'history_list') return { ...bundle.history, bytes: 0 }
    if (cmd === 'rules_list') return bundle.rules
    if (cmd === 'history_facts') return []
    if (cmd === 'report_at') {
      reads.push(Number(args.seq))
      return bundle.reports[String(args.seq)]
    }
    return null
  })
  setActivePinia(createPinia())
  useReportStore().latest = bundle.reports['12'] as Report
})
afterEach(() => clearMocks())

describe('overview store', () => {
  it('compares with the scan before the latest unless another was chosen', async () => {
    const overview = useOverviewStore()
    await flushPromises()
    expect(overview.choices.slice(0, 3)).toEqual([11, 10, 9])
    expect(overview.baselineSeq).toBe(11)
    expect(overview.baseline?.seq).toBe(11)
  })

  it('reads the chosen scan and keeps following it', async () => {
    const overview = useOverviewStore()
    await flushPromises()
    overview.choose(9)
    await flushPromises()
    expect(overview.baselineSeq).toBe(9)
    expect(overview.baseline?.seq).toBe(9)
  })

  it('falls back to the scan before when the chosen one is no longer kept', async () => {
    const overview = useOverviewStore()
    await flushPromises()
    overview.choose(999)
    expect(overview.baselineSeq).toBe(11)
  })

  it('has no baseline before a second scan exists', async () => {
    useReportStore().latest = bundle.reports['1'] as Report
    const overview = useOverviewStore()
    await flushPromises()
    expect(overview.baselineSeq).toBeNull()
    expect(overview.baseline).toBeNull()
  })

  it('filters by a severity chip and clears it when pressed again', () => {
    const overview = useOverviewStore()
    overview.toggleSeverity('crit')
    expect(overview.severity).toBe('crit')
    overview.toggleSeverity('crit')
    expect(overview.severity).toBeNull()
  })

  it('drops the severity filter when the segmented filter is used', () => {
    const overview = useOverviewStore()
    overview.toggleSeverity('warn')
    overview.setFilter('needs')
    expect(overview).toMatchObject({ filter: 'needs', severity: null })
  })
})
