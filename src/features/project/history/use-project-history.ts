// What the History tab shows for one project: the scans of the chosen window, the strip of five
// check groups, the three curves and the diff between two compared scans. All of it is read
// from the history store (the core's scan summaries, raw facts and older reports).
import { computed, ref, watch, type Ref } from 'vue'
import type { ScanFact } from '@/api'
import { changesBetween, type ChangeRow } from '@/lib/history-diff'
import { scansInRange, validPair, type ComparePair, type HistoryRange } from '@/lib/history-range'
import { projectSeries, SERIES_CHECKS, type SeriesFacts } from '@/lib/history-series'
import { stripRows } from '@/lib/history-strip'
import { useHistoryStore } from '@/stores/history'
import { useProjectsStore } from '@/stores/projects'
import { useSettingsStore } from '@/stores/settings'

export type HistoryScreen = 'loading' | 'error' | 'empty' | 'ready'

const FACT_KEY = [...SERIES_CHECKS].sort().join(',')
const NO_FACTS: readonly ScanFact[] = []

export function useProjectHistory(id: Ref<string>) {
  const history = useHistoryStore()
  const projects = useProjectsStore()
  const settings = useSettingsStore()

  const range = ref<HistoryRange>('30d')
  const picked = ref<ComparePair | null>(null)

  const all = computed(() => history.view?.scans ?? [])
  const scans = computed(() => scansInRange(all.value, range.value))
  const pair = computed(() => validPair(picked.value, scans.value))

  const screen = computed<HistoryScreen>(() => {
    if (!history.view) return history.error ? 'error' : 'loading'
    return history.view.scans.length === 0 ? 'empty' : 'ready'
  })

  const strip = computed(() => stripRows(scans.value, id.value))

  // The raw facts of the curves: one read for the three checks, kept by the store.
  void history.factsOf(SERIES_CHECKS)
  watch(
    () => history.view,
    () => void history.factsOf(SERIES_CHECKS),
  )
  const facts = computed(() => history.factsNow.get(FACT_KEY) ?? NO_FACTS)
  const project = computed(() => projects.details.find((p) => p.id === id.value))
  const series = computed<SeriesFacts>(() =>
    projectSeries(facts.value, project.value, new Set(scans.value.map((s) => s.seq))),
  )

  // The diff needs the report of both scans; the store reads and caches them.
  const changes = ref<ChangeRow[]>([])
  const reading = ref(false)
  let token = 0
  watch(
    [pair, () => id.value, series, () => settings.language],
    async () => {
      const mine = ++token
      const p = pair.value
      if (!p || p.from === p.to) {
        changes.value = []
        return
      }
      reading.value = true
      const [from, to] = await Promise.all([history.report(p.from), history.report(p.to)])
      if (mine !== token) return
      reading.value = false
      changes.value =
        from && to
          ? changesBetween({
              from,
              to,
              projectId: id.value,
              scans: scans.value.filter((s) => s.seq >= p.from && s.seq <= p.to),
              response: series.value.response,
              locale: settings.language,
            })
          : []
    },
    { immediate: true },
  )

  function pick(next: ComparePair) {
    picked.value = next
  }

  return {
    screen,
    range,
    scans,
    allCount: computed(() => all.value.length),
    pair,
    pick,
    strip,
    series,
    facts,
    project,
    changes,
    reading,
    unavailable: computed(() => history.reportError !== null),
    retry: () => history.load(),
  }
}
