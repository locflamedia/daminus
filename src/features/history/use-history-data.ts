// What the scan history screen reads: the kept scans from the history store, the report of
// each shown scan (for the tally and the compare card), the project filter and the two picked
// scans. The numbers are built by `lib/scan-history-*`; this wires the stores to them.
import { computed, ref, shallowRef, watch } from 'vue'
import type { Report } from '@/api'
import { compareReports, figuresOf } from '@/lib/scan-history-compare'
import {
  projectIds,
  scanRows,
  shownScans,
  unreachableRuns,
  type ProjectFilter,
} from '@/lib/scan-history-chart'
import { defaultSelection, pairOf, reconcile, toggleSelection } from '@/lib/scan-history-select'
import { tally } from '@/lib/scan-history-tally'
import { useHistoryStore } from '@/stores/history'
import { useReportStore } from '@/stores/report'

export function useHistoryData() {
  const history = useHistoryStore()
  const reports = useReportStore()

  const filter = ref<ProjectFilter>(null)
  const shown = computed(() => shownScans(history.view))
  const ids = computed(() => projectIds(history.view))

  // The filter names a project that is gone: back to all of them.
  watch(ids, (list) => {
    if (filter.value !== null && !list.includes(filter.value)) filter.value = null
  })

  /** Hosts a project uses, from the newest report; `null` for every project. */
  const hosts = computed<ReadonlySet<string> | null>(() => {
    if (filter.value === null) return null
    const list = reports.latest?.servers.filter((s) => s.used_by.includes(filter.value ?? '')) ?? []
    return new Set(list.map((s) => s.host))
  })

  const rows = computed(() => scanRows(shown.value.scans, filter.value, hosts.value))
  const runs = computed(() =>
    unreachableRuns(shown.value.scans).filter(
      (r) => hosts.value === null || hosts.value.has(r.host),
    ),
  )

  // Reports of the shown scans, oldest first; read once each (the store caches them).
  const loaded = shallowRef<Report[]>([])
  const reading = ref(false)
  async function readReports() {
    const seqs = shown.value.scans.map((s) => s.seq)
    const key = seqs.join(',')
    reading.value = true
    const read = await Promise.all(seqs.map((seq) => history.report(seq)))
    if (key === shown.value.scans.map((s) => s.seq).join(',')) {
      loaded.value = read.filter((r): r is Report => r !== null)
    }
    reading.value = false
  }
  watch(
    () => shown.value.scans.map((s) => s.seq).join(','),
    () => void readReports(),
    {
      immediate: true,
    },
  )

  const sums = computed(() => tally(loaded.value, filter.value))

  // The two scans being compared: the newest and the one before, until the user picks others.
  const picked = ref<number[] | null>(null)
  const selection = computed(() =>
    picked.value ? reconcile(picked.value, shown.value.scans) : defaultSelection(shown.value.scans),
  )
  function toggle(seq: number) {
    picked.value = toggleSelection(selection.value, seq)
  }
  const pair = computed(() => pairOf(selection.value))

  /** Which scan the comparison reads from: the newer one, or the older one turned around. */
  const reverse = ref(false)
  const compare = computed(() => {
    const p = pair.value
    if (!p) return null
    const bySeq = new Map(loaded.value.map((r) => [r.seq ?? -1, r] as const))
    const older = bySeq.get(p.older)
    const newer = bySeq.get(p.newer)
    if (!older || !newer) return null
    const result = reverse.value
      ? compareReports(newer, older, filter.value)
      : compareReports(older, newer, filter.value)
    const scans = history.view?.scans ?? []
    const a = scans.find((s) => s.seq === p.older)
    const b = scans.find((s) => s.seq === p.newer)
    return {
      ...result,
      pair: p,
      figures:
        a && b ? { older: figuresOf(a, hosts.value), newer: figuresOf(b, hosts.value) } : null,
    }
  })

  return {
    history,
    filter,
    ids,
    shown,
    rows,
    runs,
    sums,
    selection,
    toggle,
    pair,
    reverse,
    compare,
    reading,
    reload: () => history.load(),
  }
}
