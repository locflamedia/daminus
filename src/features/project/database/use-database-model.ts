// Wires the stores to the Database tab: each saved database part with its `db.size` result, the
// largest tables against the previous scan, and the size over past scans.
import { computed, type Ref } from 'vue'
import type { Component, Item } from '@/api'
import {
  dbFacts,
  dbProblem,
  growingTable,
  parseDb,
  previousFact,
  tableRows,
  biggestStep,
  type DbProblem,
  type DbTable,
  type DbView,
} from '@/lib/project-database'
import { itemsOf, num, projectItems } from '@/lib/project-facts'
import { topOf, totalChange, valueSeries, type SeriesPoint } from '@/lib/project-series'
import { partsOf, tabState } from '@/lib/project-tab-state'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useProjectFacts } from '../common/use-project-facts'

type DbPart = Extract<Component, { kind: 'db' }>

export interface DbSection {
  item: Item
  part: DbPart | undefined
  view: DbView | null
  problem: DbProblem | null
  rows: DbTable[]
  grower: string | null
  /** Change in size since the previous scan; `null` without one. */
  delta: number | null
  prevSeq: number | null
  series: SeriesPoint[]
  change: number | null
  step: { seq: number; bytes: number } | null
}

export function useDatabaseModel(id: Ref<string>) {
  const reports = useReportStore()
  const projects = useProjectsStore()
  const { facts, loading: factsLoading } = useProjectFacts(['db.size'])

  const saved = computed(() => projects.details.find((p) => p.id === id.value))
  const parts = computed(() => partsOf(saved.value, 'db'))
  const items = computed(() => itemsOf(projectItems(reports.latest, id.value), 'db.size'))
  const state = computed(() =>
    tabState({
      report: reports.latest,
      group: 'databases',
      parts: parts.value,
      rollup: projects.project(id.value),
      items: items.value,
    }),
  )

  const sections = computed<DbSection[]>(() =>
    items.value.map((item) => {
      const view = parseDb(item)
      const all = view ? dbFacts(facts.value, view) : []
      const seq = item.checked_seq ?? reports.latest?.seq ?? 0
      const prev = previousFact(all, seq)
      const rows = view ? tableRows(view.top, topOf(prev)) : []
      const series = valueSeries(all)
      const before = num(prev?.fact.value)
      return {
        item,
        part: parts.value.find((p) => p.host === item.key.host && p.database === item.key.target),
        view,
        problem: dbProblem(item),
        rows,
        grower: prev ? growingTable(rows) : null,
        delta: view?.size != null && before !== null ? view.size - before : null,
        prevSeq: prev?.seq ?? null,
        series,
        change: totalChange(series),
        step: biggestStep(series),
      }
    }),
  )

  return {
    parts,
    state,
    sections,
    loading: computed(() => reports.latest === null && reports.error === null),
    curveLoading: factsLoading,
  }
}
