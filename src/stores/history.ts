// What the history screens read, kept apart from the latest report: one summary per kept scan,
// raw facts of the charted checks across scans, the expected rules, and reports of older scans
// for "vs #n". A new scan makes all of it stale, so it is read again when the latest report's
// scan number changes. Reports read for an older scan live in `useReportStore`.
import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import {
  type AppError,
  type ExpectedRule,
  type HistoryView,
  type Report,
  type ScanFact,
  historyFacts,
  historyList,
  isAppError,
  reportAt,
  rulesList,
} from '@/api'
import { useReportStore } from './report'

/** How many scans of raw facts the charts read; the core caps one call at 100. */
export const FACT_SCANS = 30

export const useHistoryStore = defineStore('history', () => {
  const reports = useReportStore()
  const view = shallowRef<HistoryView | null>(null)
  const rules = shallowRef<ExpectedRule[]>([])
  const error = ref<AppError | null>(null)
  const loading = ref(false)
  const facts = new Map<string, Promise<ScanFact[]>>()
  const factsNow = shallowRef<Map<string, ScanFact[]>>(new Map())

  function fail(e: unknown) {
    error.value = isAppError(e) ? e : null
    if (!isAppError(e)) console.error(e)
  }

  /** Reads the scan summaries and the rules again; on failure the last good ones stay. */
  async function load() {
    loading.value = true
    try {
      const [v, r] = await Promise.all([historyList(), rulesList()])
      view.value = v
      rules.value = r
      error.value = null
    } catch (e) {
      fail(e)
    } finally {
      loading.value = false
    }
  }

  /** The report as scan `seq` saw it, from the cache when it was read before. */
  async function report(seq: number): Promise<Report | null> {
    const cached = reports.cached(seq)
    if (cached) return cached
    try {
      const r = await reportAt(seq)
      reports.remember(r)
      return r
    } catch (e) {
      fail(e)
      return null
    }
  }

  /** The raw facts of `checks` over the last scans, oldest first; one read per set of checks. */
  function factsOf(checks: readonly string[]): Promise<ScanFact[]> {
    const key = [...checks].sort().join(',')
    let pending = facts.get(key)
    if (!pending) {
      pending = historyFacts([...checks], FACT_SCANS).then(
        (list) => {
          factsNow.value = new Map(factsNow.value).set(key, list)
          return list
        },
        (e) => {
          facts.delete(key)
          fail(e)
          return []
        },
      )
      facts.set(key, pending)
    }
    return pending
  }

  function forget() {
    facts.clear()
    factsNow.value = new Map()
  }

  // A scan that ended: summaries, facts and the cached older reports describe a shorter past.
  watch(
    () => reports.latest?.seq,
    (seq, before) => {
      if (before !== undefined && seq === before) return
      forget()
      void load()
    },
    { immediate: true },
  )

  return { view, rules, error, loading, load, report, factsOf, factsNow }
})
