// Decides whether the intro plays when the window opens, and drives its overlay: the journey
// is chosen from the launch kind, the `general.intro` setting and the ssh config's hosts; any
// key or click ends it; the overlay fades out in 200 ms (at once with Reduce Motion) and goes.
// Nothing here may hold the app back: every failure means "no intro".
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { type LaunchInfo, type Report, appLaunch, hostsList } from '@/api'
import { prefersReducedMotion } from '@/lib/motion'
import { useReportStore } from '@/stores/report'
import { useSettingsStore } from '@/stores/settings'
import { chooseJourney, devIntro } from './journey'
import type { IntroJourney, IntroScene } from './scene'
import { sceneFromReport } from './scene-from-report'

export const FADE_MS = 200
export const REPORT_WAIT_MS = 1500

export interface IntroPlan {
  journey: IntroJourney
  scene: IntroScene
  reducedMotion: boolean
  freezeAt?: number
}

export interface IntroDeps {
  launch: () => Promise<LaunchInfo>
  /** The aliases of the ssh config, or `null` when the list cannot be read. */
  hostAliases: () => Promise<string[] | null>
  mode: () => 'first_launch' | 'always' | 'never'
  /** The latest report, waiting up to `ms` for it; `null` when there is none. */
  report: (ms: number) => Promise<Report | null>
  reducedMotion: () => boolean
  /** Query string of the window, read for the development switches. */
  search: string
  dev: boolean
}

function liveDeps(): IntroDeps {
  const reports = useReportStore()
  const settings = useSettingsStore()
  return {
    launch: appLaunch,
    hostAliases: async () => {
      try {
        return (await hostsList()).list.hosts.map((h) => h.alias)
      } catch {
        return null
      }
    },
    mode: () => settings.general.intro,
    report: (ms) => waitForReport(reports, ms),
    reducedMotion: prefersReducedMotion,
    search: typeof location === 'undefined' ? '' : location.search,
    dev: import.meta.env.DEV,
  }
}

function waitForReport(
  store: ReturnType<typeof useReportStore>,
  ms: number,
): Promise<Report | null> {
  const ready = (r: Report | null) => (r !== null && r.seq != null ? r : null)
  const now = ready(store.latest)
  if (now !== null) return Promise.resolve(now)
  void store.loadLatest()
  return new Promise((resolve) => {
    const stop = watch(
      () => store.latest,
      (r) => {
        const got = ready(r)
        if (got === null) return
        clearTimeout(timer)
        stop()
        resolve(got)
      },
    )
    const timer = setTimeout(() => {
      stop()
      resolve(null)
    }, ms)
  })
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS'])

export function useIntro(override: Partial<IntroDeps> = {}) {
  const deps: IntroDeps = { ...liveDeps(), ...override }
  const plan = shallowRef<IntroPlan | null>(null)
  const leaving = ref(false)
  let fadeTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  /** Ends the intro: fades the overlay out, then drops it. */
  function end(): void {
    const current = plan.value
    if (current === null || leaving.value) return
    if (current.reducedMotion) {
      plan.value = null
      return
    }
    leaving.value = true
    fadeTimer = setTimeout(() => {
      plan.value = null
      leaving.value = false
    }, FADE_MS)
  }

  function onKey(e: KeyboardEvent): void {
    if (MODIFIERS.has(e.key) || e.isComposing) return
    e.preventDefault()
    e.stopPropagation()
    end()
  }

  watch(plan, (now, before) => {
    if (now !== null && before === null) window.addEventListener('keydown', onKey, true)
    if (now === null) window.removeEventListener('keydown', onKey, true)
  })

  async function resolveScene(journey: IntroJourney, aliases: string[] | null): Promise<IntroPlan> {
    const dev = devIntro(deps.dev ? deps.search : '')
    const reducedMotion = deps.reducedMotion() || dev.reduce
    const base = {
      reducedMotion,
      ...(dev.freezeAt === undefined ? {} : { freezeAt: dev.freezeAt }),
    }
    if (journey === 'first') {
      return { ...base, journey, scene: sceneFromReport(null, aliases ?? []) }
    }
    if (journey === 'nohosts' || journey === 'daily') {
      return { ...base, journey, scene: sceneFromReport(null, []) }
    }
    const report = await deps.report(REPORT_WAIT_MS)
    if (report === null) return { ...base, journey: 'daily', scene: sceneFromReport(null, []) }
    return { ...base, journey, scene: sceneFromReport(report, []) }
  }

  /** Reads the launch once and starts the intro when it should play. Never rejects. */
  async function start(): Promise<void> {
    try {
      const forced = deps.dev ? devIntro(deps.search).journey : null
      const info = await deps.launch().catch(() => null)
      let journey = forced
      let aliases: string[] | null = null
      if (journey === null) {
        if (info === null) return
        const mode = deps.mode()
        if (chooseJourney(info.kind, mode, 1) === null) return
        if (info.kind === 'first') aliases = await deps.hostAliases()
        journey = chooseJourney(info.kind, mode, aliases === null ? null : aliases.length)
        if (journey === null) return
      } else if (journey === 'first') {
        aliases = await deps.hostAliases()
      }
      const next = await resolveScene(journey, aliases)
      if (!disposed) plan.value = next
    } catch (e) {
      console.error(e)
    }
  }

  onScopeDispose(() => {
    disposed = true
    clearTimeout(fadeTimer)
    window.removeEventListener('keydown', onKey, true)
  })

  return { plan, leaving, start, skip: end, finish: end }
}
