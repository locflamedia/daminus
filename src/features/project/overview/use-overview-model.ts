// Wires the stores to the Overview tab: the project's results, the history of its URLs, disk and
// database, and the saved parts. The reading rules live in `lib/project-overview.ts`.
import { computed, type Ref } from 'vue'
import { projectItems } from '@/lib/project-facts'
import {
  needsLook,
  overviewTiles,
  partRows,
  responseStrip,
  stripMedian,
  slowestBad,
  urlRows,
  wiring,
  exposure,
} from '@/lib/project-overview'
import { useHistoryStore } from '@/stores/history'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useProjectFacts } from '../common/use-project-facts'

const CHARTED = ['url.http', 'url.tls', 'disk.path', 'db.size']

export function useOverviewModel(id: Ref<string>) {
  const reports = useReportStore()
  const projects = useProjectsStore()
  const history = useHistoryStore()
  const { facts, loading: factsLoading } = useProjectFacts(CHARTED)

  const saved = computed(() => projects.details.find((p) => p.id === id.value))
  const urls = computed(() => saved.value?.urls ?? [])
  const items = computed(() => projectItems(reports.latest, id.value))
  const hosts = computed(() => [...new Set((saved.value?.components ?? []).map((c) => c.host))])

  const tiles = computed(() => overviewTiles(items.value, facts.value, urls.value))
  const rows = computed(() => partRows(saved.value, items.value))
  const bands = computed(() => wiring(rows.value))
  const look = computed(() => needsLook(reports.latest?.items ?? [], id.value, hosts.value))
  const strip = computed(() => responseStrip(history.view, id.value, facts.value, urls.value))
  const urlList = computed(() => urlRows(items.value, urls.value))

  return {
    saved,
    items,
    tiles,
    rows,
    bands,
    hosts,
    look,
    strip,
    median: computed(() => stripMedian(strip.value)),
    worst: computed(() => slowestBad(strip.value)),
    urlList,
    exposure: computed(() => exposure(items.value)),
    seq: computed(() => reports.latest?.seq ?? null),
    loading: computed(() => reports.latest === null && reports.error === null),
    factsLoading,
    firstScan: computed(() => reports.latest !== null && reports.latest.seq == null),
  }
}
