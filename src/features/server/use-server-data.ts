// Everything the server page reads: the latest report, the raw facts of the charted checks
// across scans, and the report of the baseline scan the changes are measured against. The
// models are built by `lib/server-*`; this only wires the stores to them.
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import type { Report } from '@/api'
import { buildContainers } from '@/lib/server-containers'
import { buildDiskChart } from '@/lib/server-disk'
import { failedOutcome, hostItems, hostState } from '@/lib/server-facts'
import { buildKpis, fullestDisk } from '@/lib/server-metrics'
import { buildFindings, buildSecurityLite } from '@/lib/server-security'
import { buildUsage } from '@/lib/server-usage'
import { useHistoryStore } from '@/stores/history'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'

/** The checks whose raw facts the page charts across scans. */
export const CHARTED = ['sys.load', 'sys.mem', 'disk.fs', 'sys.swap'] as const

export function useServerData(host: Ref<string>) {
  const reports = useReportStore()
  const history = useHistoryStore()
  const projects = useProjectsStore()

  const report = computed(() => reports.latest)
  const rollup = computed(() => projects.server(host.value))
  const state = computed(() => hostState(rollup.value))
  const failed = computed(() => failedOutcome(rollup.value))
  const items = computed(() => hostItems(report.value, host.value))

  // Facts: read again when a new scan lands, the history store forgets the old ones first.
  const factsKey = [...CHARTED].sort().join(',')
  watch(
    () => reports.latest?.seq,
    () => void history.factsOf(CHARTED),
    { immediate: true },
  )
  const facts = computed(() =>
    reports.latest?.seq == null
      ? []
      : (history.factsNow.get(factsKey) ?? []).filter((f) => f.host === host.value),
  )

  // Baseline: the scan the change is measured against; the one before the newest by default.
  const latestSeq = computed(() => report.value?.seq ?? null)
  const earlier = computed(() =>
    (history.view?.scans ?? [])
      .filter((s) => latestSeq.value !== null && s.seq < latestSeq.value)
      .map((s) => s.seq)
      .reverse(),
  )
  const chosen = ref<number | null>(null)
  const baselineSeq = computed(() =>
    chosen.value !== null && earlier.value.includes(chosen.value)
      ? chosen.value
      : (earlier.value[0] ?? null),
  )
  const baseline = shallowRef<Report | null>(null)
  watch(
    baselineSeq,
    async (seq) => {
      baseline.value = null
      if (seq === null) return
      const read = await history.report(seq)
      if (seq === baselineSeq.value) baseline.value = read
    },
    { immediate: true },
  )
  const before = computed(() => hostItems(baseline.value, host.value))

  const kpis = computed(() => buildKpis(items.value, before.value, facts.value, host.value))
  const diskChart = computed(() =>
    buildDiskChart(fullestDisk(items.value), facts.value, host.value),
  )
  const usage = computed(() => buildUsage(items.value, before.value))
  const containers = computed(() => buildContainers(items.value, before.value))
  const findings = computed(() => buildFindings(items.value))
  const security = computed(() => buildSecurityLite(items.value, report.value))

  return {
    report,
    rollup,
    state,
    failed,
    items,
    facts,
    earlier,
    chosen,
    baselineSeq,
    kpis,
    diskChart,
    usage,
    containers,
    findings,
    security,
  }
}
