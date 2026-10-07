// What the Security tab shows for one project, read from the latest report and the history
// store: the nine check rows, the findings, the first action, how it unfolded over the last
// scans and which state the screen is in. Nothing is graded here; the core did that.
import { computed, ref, watch, type Ref } from 'vue'
import { useNow } from '@/composables/use-now'
import { staleDays } from '@/lib/staleness'
import {
  criticalFindings,
  foldedFindings,
  ruleOf,
  securityFindings,
  type Finding,
  type Root,
} from '@/lib/security-findings'
import { doFirst } from '@/lib/security-first'
import {
  CHECK_GROUP,
  SECURITY_CHECKS,
  securityItems,
  securityRows,
  severityMix,
} from '@/lib/security-rows'
import { timeline, type TimelineEvent } from '@/lib/security-timeline'
import { useHistoryStore } from '@/stores/history'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useSettingsStore } from '@/stores/settings'

export type SecurityScreen = 'loading' | 'error' | 'empty' | 'ready'

const DAY_MS = 86_400_000
const TIMELINE_SCANS = 4

export function useProjectSecurity(id: Ref<string>) {
  const reports = useReportStore()
  const history = useHistoryStore()
  const projects = useProjectsStore()
  const settings = useSettingsStore()
  const clock = useNow()

  const report = computed(() => reports.latest)
  const seq = computed(() => report.value?.seq ?? null)

  const screen = computed<SecurityScreen>(() => {
    if (!report.value) return reports.error ? 'error' : 'loading'
    return report.value.seq == null ? 'empty' : 'ready'
  })

  const disabled = computed(() => report.value?.disabled_groups ?? [])
  const allOff = computed(() =>
    SECURITY_CHECKS.every((check) => disabled.value.includes(CHECK_GROUP[check])),
  )

  const items = computed(() => securityItems(report.value?.items ?? [], id.value))
  const rows = computed(() =>
    securityRows(items.value, disabled.value, seq.value, settings.language),
  )
  const mix = computed(() => severityMix(rows.value))

  const roots = computed<Root[]>(() =>
    (projects.details.find((p) => p.id === id.value)?.components ?? []).flatMap((c) =>
      c.kind === 'path' ? [{ host: c.host, path: c.path }] : [],
    ),
  )
  const findings = computed(() =>
    securityFindings(items.value, { roots: roots.value, seq: seq.value }),
  )
  const critical = computed(() => criticalFindings(findings.value))
  const folded = computed(() => foldedFindings(findings.value))
  const first = computed(() => doFirst(findings.value))

  const rollup = computed(() => projects.project(id.value))
  const unreachable = computed(() => rollup.value?.unreachable_hosts ?? [])
  const oldDays = computed(() => staleDays(report.value?.scanned_at, clock.value))

  /** The longest a host of the project took in the latest scan, when the scan recorded it. */
  const checkMs = computed(() => {
    const scan = history.view?.scans.find((s) => s.seq === seq.value)
    if (!scan) return null
    const hosts = new Set([
      '@local',
      ...projects.servers.filter((s) => s.used_by.includes(id.value)).map((s) => s.host),
    ])
    const times = [...hosts].flatMap((h) => {
      const ms = scan.hosts[h]?.ms
      return typeof ms === 'number' ? [ms] : []
    })
    return times.length > 0 ? Math.max(...times) : null
  })

  /** When a finding first appeared: the scan and how many whole days ago, when that scan is kept. */
  function firstSeen(finding: Finding): { seq: number; days: number | null } | null {
    if (finding.firstSeq === null) return null
    const scans = history.view?.scans ?? []
    const then = scans.find((s) => s.seq === finding.firstSeq)
    const now = scans.find((s) => s.seq === seq.value)
    const days =
      then && now
        ? Math.max(
            0,
            Math.floor((Date.parse(now.finished_at) - Date.parse(then.finished_at)) / DAY_MS),
          )
        : null
    return { seq: finding.firstSeq, days }
  }

  function rule(finding: Finding) {
    return ruleOf(history.rules, finding.ruleId)
  }

  // How it unfolded: the reports of the last scans, read once each (the history store caches).
  const events = ref<TimelineEvent[]>([])
  let reading = 0
  watch(
    [() => id.value, seq, () => history.view],
    async () => {
      const mine = ++reading
      const latest = seq.value
      const view = history.view
      if (latest === null || !view) {
        events.value = []
        return
      }
      const wanted = view.scans.map((s) => s.seq).slice(-TIMELINE_SCANS)
      const read = await Promise.all(
        wanted.map(async (n) => {
          const r = await history.report(n)
          const scan = view.scans.find((s) => s.seq === n)
          return r && scan
            ? { seq: n, at: scan.finished_at, items: securityItems(r.items, id.value) }
            : null
        }),
      )
      if (mine !== reading) return
      events.value = timeline(
        read.flatMap((r) => (r ? [r] : [])),
        TIMELINE_SCANS,
      )
    },
    { immediate: true },
  )

  return {
    screen,
    seq,
    report,
    disabled,
    allOff,
    rows,
    mix,
    findings,
    critical,
    folded,
    first,
    unreachable,
    oldDays,
    checkMs,
    events,
    firstSeen,
    rule,
    retry: () => reports.loadLatest(),
  }
}
