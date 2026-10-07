// Everything the Overview shows, read from the stores and worded: the project cards, the
// servers strip, the changes since the baseline and what is coming up. The stores hold the
// facts; the libraries decide what they mean; this only joins them for the screen.
import { computed } from 'vue'
import { useNow } from '@/composables/use-now'
import { buildProjectCards } from '@/lib/overview-cards'
import { CHANGES_SHOWN, diffReports } from '@/lib/overview-changes'
import { comingUp } from '@/lib/overview-coming-up'
import { cardScan } from '@/lib/overview-scan'
import { buildServerCells, serverChip } from '@/lib/overview-servers'
import { staleDays } from '@/lib/staleness'
import { useHistoryStore } from '@/stores/history'
import { useOverviewStore } from '@/stores/overview'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import { cardView, type CardContext, type CardView } from './overview-card-text'
import { changeRow, upcomingRow } from './overview-list-text'

export function useOverview() {
  const reports = useReportStore()
  const projects = useProjectsStore()
  const history = useHistoryStore()
  const scan = useScanStore()
  const selection = useOverviewStore()
  const clock = useNow()

  const report = computed(() => reports.latest)
  /** A report with no scan number yet: projects exist, nothing was scanned. */
  const first = computed(() => report.value !== null && report.value.seq == null)
  const loading = computed(() => report.value === null && !reports.error && !scan.error)
  const oldDays = computed(() => staleDays(report.value?.scanned_at, clock.value))

  /** The report with its projects in the order the sidebar uses; it only changes with a report. */
  const ordered = computed(() =>
    report.value ? { ...report.value, projects: projects.projects } : null,
  )

  const allCards = computed<CardView[]>(() => {
    const r = ordered.value
    if (!r) return []
    const data = buildProjectCards(
      projects.details,
      r,
      selection.baseline,
      history.rules,
      clock.value,
    )
    return data.map((d) => {
      const project = projects.details.find((p) => p.id === d.id)
      const context: CardContext = {
        domain: projects.domain(d.id),
        color: projects.color(d.id),
        seq: r.seq ?? null,
        scannedAt: r.scanned_at ?? null,
        oldDays: oldDays.value,
        scan: project && scan.run ? cardScan(project, scan.run) : null,
        first: first.value,
      }
      return cardView(d, context)
    })
  })

  /** The cards the filter lets through; the order is the sidebar's. */
  const cards = computed(() => {
    const keep = selection.severity
    return allCards.value.filter((c) => {
      if (keep) return c.state === keep
      if (selection.filter === 'needs') return c.look
      return true
    })
  })

  const counts = computed(() => ({
    all: allCards.value.length,
    needs: allCards.value.filter((c) => c.look).length,
  }))

  const servers = computed(() =>
    ordered.value
      ? buildServerCells({ ...ordered.value, servers: projects.servers }, clock.value)
      : [],
  )
  const serverSummary = computed(() => (report.value ? serverChip(report.value) : null))

  const changes = computed(() => {
    const rows = report.value ? diffReports(report.value, selection.baseline).map(changeRow) : []
    return { rows: rows.slice(0, CHANGES_SHOWN), more: Math.max(0, rows.length - CHANGES_SHOWN) }
  })

  const diskFacts = computed(() => {
    void history.factsNow
    return history.factsNow.get('disk.fs') ?? []
  })

  const upcoming = computed(() =>
    report.value
      ? comingUp(report.value, history.rules, diskFacts.value, clock.value).map(upcomingRow)
      : [],
  )

  /** How long the saved scan took, from its summary. */
  const tookMs = computed(() => {
    const seq = report.value?.seq
    const found = history.view?.scans.find((s) => s.seq === seq)
    if (!found) return null
    const took = Date.parse(found.finished_at) - Date.parse(found.started_at)
    return Number.isFinite(took) && took > 0 ? took : null
  })

  return {
    report,
    first,
    loading,
    oldDays,
    cards,
    counts,
    servers,
    serverSummary,
    changes,
    upcoming,
    tookMs,
    clock,
  }
}
