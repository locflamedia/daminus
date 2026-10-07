// Wires the stores to the Disk tab's model: the project's `disk.path` results, the previous scan's
// folder sizes for the growth, the curve over scans, and the shared disks. The reading rules live
// in `lib/project-disk.ts`; this only feeds them.
import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { itemsOf, projectItems } from '@/lib/project-facts'
import {
  diskSeries,
  diskTiles,
  freeable,
  largeFiles,
  logFindings,
  parseDiskPath,
  previousSizes,
  serverDisks,
  type DiskPathView,
} from '@/lib/project-disk'
import { partsOf, tabState } from '@/lib/project-tab-state'
import { totalChange } from '@/lib/project-series'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useProjectFacts } from '../common/use-project-facts'

export function useDiskModel(id: Ref<string>) {
  const { t } = useI18n()
  const fmt = useFormat()
  const reports = useReportStore()
  const projects = useProjectsStore()
  const { facts, loading: factsLoading } = useProjectFacts(['disk.path'])

  const saved = computed(() => projects.details.find((p) => p.id === id.value))
  const parts = computed(() => partsOf(saved.value, 'path'))
  const items = computed(() => projectItems(reports.latest, id.value))
  const pathItems = computed(() => itemsOf(items.value, 'disk.path'))
  const views = computed<DiskPathView[]>(() =>
    pathItems.value.flatMap((i) => {
      const v = parseDiskPath(i)
      return v ? [v] : []
    }),
  )
  const state = computed(() =>
    tabState({
      report: reports.latest,
      group: 'disk',
      parts: parts.value,
      rollup: projects.project(id.value),
      items: pathItems.value,
    }),
  )

  const checkedSeq = computed(() => {
    const seqs = pathItems.value.map((i) => i.checked_seq).filter((s): s is number => s != null)
    return seqs.length ? Math.min(...seqs) : (reports.latest?.seq ?? null)
  })
  const previous = computed(() => previousSizes(facts.value, views.value, checkedSeq.value))
  const previousSeq = computed(() => {
    const seq = checkedSeq.value
    if (seq == null) return null
    const seqs = facts.value.map((f) => f.seq).filter((s) => s < seq)
    return seqs.length ? Math.max(...seqs) : null
  })

  const tiles = computed(() =>
    diskTiles(views.value, previous.value, {
      size: (b) => fmt.measure(b, 'bytes').text,
      delta: (b) => fmt.delta(b, 'bytes').text,
      none: t('projectShared.delta.same'),
    }),
  )
  const total = computed(() => views.value.reduce((s, v) => s + v.total, 0))
  const series = computed(() => diskSeries(facts.value, views.value))
  const change = computed(() => totalChange(series.value))
  const partial = computed(() => views.value.some((v) => v.partial))
  const logs = computed(() => logFindings(reports.latest?.items ?? []))
  const projectLogs = computed(() => logs.value.filter((l) => hosts.value.includes(l.host)))
  const files = computed(() =>
    largeFiles(
      views.value,
      logs.value.map((l) => l.item),
    ),
  )
  const hosts = computed(() => [...new Set(parts.value.map((p) => p.host))])
  const disks = computed(() => serverDisks(reports.latest?.items ?? [], hosts.value))
  const free = computed(() => freeable(reports.latest?.items ?? [], hosts.value))

  /** The folder that grew most since the previous scan, for the sentence under the curve. */
  const grower = computed(() => {
    let best: { label: string; growth: number } | null = null
    for (const m of tiles.value) {
      if ((m.growth ?? 0) > (best?.growth ?? 0))
        best = { label: m.tile.label, growth: m.growth ?? 0 }
    }
    return best
  })

  return {
    parts,
    pathItems,
    views,
    state,
    loading: computed(() => reports.latest === null && reports.error === null),
    curveLoading: factsLoading,
    tiles,
    total,
    series,
    change,
    partial,
    projectLogs,
    files,
    hosts,
    disks,
    free,
    grower,
    previousSeq,
  }
}
