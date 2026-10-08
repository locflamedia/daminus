// Wires the stores to the Containers tab: the project's Compose and pm2 results, the CPU and memory
// of each service over past scans, and when each project's image last changed.
import { computed, type Ref } from 'vue'
import { itemsOf, projectItems, unknownReason } from '@/lib/project-facts'
import {
  hostMemory,
  imageChangedAt,
  neighbours,
  parseCompose,
  parsePm2,
  peak,
  serviceSeries,
  troubledService,
  type ComposeView,
  type Pm2View,
  type ServiceView,
} from '@/lib/project-containers'
import { partsOf, tabState } from '@/lib/project-tab-state'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import type { Item } from '@/api'
import { useProjectFacts } from '../common/use-project-facts'

export interface ComposeSection {
  item: Item
  view: ComposeView | null
  /** Why the result has no answer; `null` when it has one. */
  problem: string | null
  imageSeq: number | null
}

export interface Pm2Section {
  item: Item
  view: Pm2View | null
  problem: string | null
}

/** MEMORY scans drawn in the exit card. */
const MEMORY_SCANS = 8

export function useContainersModel(id: Ref<string>) {
  const reports = useReportStore()
  const projects = useProjectsStore()
  const { facts, loading: factsLoading } = useProjectFacts(['docker.compose'])

  const saved = computed(() => projects.details.find((p) => p.id === id.value))
  const parts = computed(() => [...partsOf(saved.value, 'compose'), ...partsOf(saved.value, 'pm2')])
  const all = computed(() => projectItems(reports.latest, id.value))
  const composeItems = computed(() => itemsOf(all.value, 'docker.compose'))
  const pm2Items = computed(() => itemsOf(all.value, 'pm2.app'))
  const state = computed(() =>
    tabState({
      report: reports.latest,
      group: 'containers',
      parts: parts.value,
      rollup: projects.project(id.value),
      items: [...composeItems.value, ...pm2Items.value],
    }),
  )

  const composes = computed<ComposeSection[]>(() =>
    composeItems.value.map((item) => ({
      item,
      view: parseCompose(item),
      problem: unknownReason(item),
      imageSeq: imageChangedAt(facts.value, item.key.host, item.key.target),
    })),
  )
  const apps = computed<Pm2Section[]>(() =>
    pm2Items.value.map((item) => ({ item, view: parsePm2(item), problem: unknownReason(item) })),
  )

  /** The first Compose project with a service that needs a look. */
  const trouble = computed(() => {
    for (const c of composes.value) {
      const service = c.view ? troubledService(c.view.services) : null
      if (c.view && service) return { section: c, service }
    }
    return null
  })

  const cpuOf = (c: ComposeSection, s: ServiceView) =>
    serviceSeries(facts.value, c.item.key.host, c.item.key.target, s.name, 'cpu').map(
      (p) => p.value,
    )

  const memory = computed(() => {
    const t = trouble.value
    if (!t) return []
    const { host, target } = t.section.item.key
    const series = serviceSeries(facts.value, host, target, t.service.name, 'mem')
    return series.slice(-MEMORY_SCANS)
  })

  const also = computed(() => {
    const t = trouble.value
    return t
      ? neighbours(reports.latest?.items ?? [], t.section.item.key.host, t.section.item.key.target)
      : []
  })

  const hostMem = computed(() => {
    const t = trouble.value
    return t ? hostMemory(reports.latest?.items ?? [], t.section.item.key.host) : null
  })

  return {
    hostMem,
    parts,
    state,
    composes,
    apps,
    trouble,
    memory,
    memoryPeak: computed(() => peak(memory.value)),
    also,
    cpuOf,
    loading: computed(() => reports.latest === null && reports.error === null),
    curveLoading: factsLoading,
  }
}
