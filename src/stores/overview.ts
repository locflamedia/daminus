// What the Overview remembers while it is open: which projects the filter shows and the scan
// the changes and deltas are compared with. The baseline is the scan before the latest unless
// the person chose another; its report comes from the history store (cached by scan number).
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import type { Report } from '@/api'
import { useHistoryStore } from './history'
import { useReportStore } from './report'

export type OverviewFilter = 'all' | 'needs'
export type SeverityFilter = 'crit' | 'warn' | null

/** How many earlier scans the baseline menu lists. */
export const BASELINE_CHOICES = 12

export const useOverviewStore = defineStore('overview', () => {
  const reports = useReportStore()
  const history = useHistoryStore()
  const filter = ref<OverviewFilter>('all')
  const severity = ref<SeverityFilter>(null)
  const chosen = ref<number | null>(null)
  const baseline = shallowRef<Report | null>(null)

  /** Earlier scans, newest first. */
  const choices = computed(() => {
    const latest = reports.latest?.seq
    return (history.view?.scans ?? [])
      .map((s) => s.seq)
      .filter((seq) => latest != null && seq < latest)
      .reverse()
      .slice(0, BASELINE_CHOICES)
  })

  /** The scan every delta follows: the choice when it is still kept, else the one before. */
  const baselineSeq = computed(() => {
    const picked = chosen.value
    if (picked !== null && choices.value.includes(picked)) return picked
    return choices.value[0] ?? null
  })

  function choose(seq: number) {
    chosen.value = seq
  }

  watch(
    baselineSeq,
    async (seq) => {
      if (seq === null) {
        baseline.value = null
        return
      }
      const report = await history.report(seq)
      // Only the newest request may answer: a slower older read must not replace it.
      if (baselineSeq.value === seq) baseline.value = report
    },
    { immediate: true },
  )

  function setFilter(next: OverviewFilter) {
    filter.value = next
    severity.value = null
  }

  /** A severity chip filters the grid; pressing it again clears the filter. */
  function toggleSeverity(level: 'crit' | 'warn') {
    severity.value = severity.value === level ? null : level
    filter.value = 'all'
  }

  return {
    filter,
    severity,
    chosen,
    baseline,
    baselineSeq,
    choices,
    choose,
    setFilter,
    toggleSeverity,
  }
})
