// Watches scans end and decides which small moments play for that one scan. A completion is
// resolved once the new report has been read (so "critical" and "all clear" are about this
// scan), and only for a scan that was seen running and ended `done`: opening the app, a
// cancelled scan and a failed one never play anything.
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { prefersReducedMotion } from '@/lib/motion'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import { useSettingsStore } from '@/stores/settings'
import { playChime } from './chime'
import { shouldChime, shouldPlay } from './delight-gate'

/** The grain reaches the button, then the label holds this long. */
export const SETTLE_MS = 600
export const DUST_MS = 450
const REPORT_WAIT_MS = 1500

export interface Completion {
  id: number
  durationMs: number
  /** Clear sky and twinkle over the summary. */
  sky: boolean
  /** Grain drifting into the Scan button. */
  dust: boolean
  /** The ring and "Done in …" label on the button. */
  settle: boolean
}

export const useDelightStore = defineStore('delight', () => {
  const scan = useScanStore()
  const reports = useReportStore()
  const settings = useSettingsStore()
  const projects = useProjectsStore()

  const completion = shallowRef<Completion | null>(null)
  /** True while the Scan button shows "Done in …". */
  const settled = ref(false)
  let nextId = 0
  let startedAt: number | null = null
  const timers = new Set<number>()

  const hasCritical = computed(
    () =>
      (reports.latest?.counts.crit ?? 0) > 0 || projects.projects.some((p) => p.level === 'crit'),
  )
  const allClear = computed(() => {
    const counts = reports.latest?.counts
    return (
      !!counts &&
      counts.crit === 0 &&
      counts.warn === 0 &&
      projects.issues === 0 &&
      projects.projects.length > 0
    )
  })

  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }

  function resolve(durationMs: number, force = false) {
    const reduceMotion = prefersReducedMotion()
    const little = settings.appearance.easter_eggs
    const quiet = { hasCritical: force ? false : hasCritical.value, reduceMotion }
    const done: Completion = {
      id: ++nextId,
      durationMs,
      sky:
        force ||
        (allClear.value && shouldPlay({ setting: settings.appearance.clear_sky, ...quiet })),
      dust: force || shouldPlay({ setting: little, ...quiet }),
      settle: force || little,
    }
    completion.value = done
    if (!force && shouldChime({ setting: settings.appearance.completion_chime, ...quiet })) {
      playChime()
    }
    if (done.settle) {
      later(() => (settled.value = true), done.dust ? DUST_MS : 0)
      later(() => (settled.value = false), (done.dust ? DUST_MS : 0) + SETTLE_MS)
    }
  }

  /** A completion for the development switches; ignores the switches and criticals. */
  function devComplete(durationMs = 58_000) {
    resolve(durationMs, true)
  }

  watch(
    () => scan.scanning,
    (running) => {
      if (running) {
        startedAt = scan.run ? Date.parse(scan.run.started_at) : Date.now()
        if (!Number.isFinite(startedAt)) startedAt = Date.now()
        return
      }
      const began = startedAt
      startedAt = null
      if (began === null || scan.lastEnd !== 'done') return
      const durationMs = Math.max(0, Date.now() - began)
      const before = reports.latest
      let fired = false
      const fire = () => {
        if (fired) return
        fired = true
        stop()
        resolve(durationMs)
      }
      const stop = watch(() => reports.latest, fire)
      later(fire, REPORT_WAIT_MS)
      if (reports.latest !== before) fire()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    for (const id of timers) window.clearTimeout(id)
    timers.clear()
  })

  return { completion, settled, hasCritical, allClear, devComplete }
})
