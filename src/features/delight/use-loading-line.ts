// The warm status line of a running scan, one new line every 3 s. Off with the little-things
// switch; with any critical it states the facts; with Reduce Motion it does not cycle.
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useReducedMotion } from '@/lib/motion'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import { useSettingsStore } from '@/stores/settings'
import { currentDev } from './delight-gate'
import { LINE_MS, type LineEntry, lineEntries, pickLine } from './delight-lines'

const DEV_ENTRIES: LineEntry[] = [
  { host: 'vps-sg-2', group: 'disk' },
  { host: 'vps-sg-1', group: 'security' },
  { host: 'vps-sg-2', group: 'containers' },
  { host: 'vps-hn-3', group: 'databases' },
]

export function useLoadingLine() {
  const { t } = useI18n()
  const scan = useScanStore()
  const reports = useReportStore()
  const settings = useSettingsStore()
  const reduced = useReducedMotion()
  const dev = currentDev().kind === 'lines'

  const tick = ref(0)
  let timer: number | undefined
  const running = computed(() => scan.scanning || dev)
  /** Whether a line replaces the plain "Scanning" meta. */
  const active = computed(() => running.value && (dev || settings.appearance.easter_eggs))
  watch(
    [running, active, reduced],
    ([on, shown, still]) => {
      window.clearInterval(timer)
      timer = undefined
      tick.value = 0
      if (on && shown && !still) timer = window.setInterval(() => tick.value++, LINE_MS)
    },
    { immediate: true },
  )
  onScopeDispose(() => window.clearInterval(timer))

  const line = computed(() => {
    if (!active.value) return ''
    const entries = dev ? DEV_ENTRIES : lineEntries(scan.run, reports.latest?.disabled_groups ?? [])
    const critical = !dev && (reports.latest?.counts.crit ?? 0) > 0
    const pick = pickLine(entries, tick.value, critical)
    return t(pick.key, pick.params)
  })

  return { active, line }
}
