// Decides whether the intro plays when the window opens, and drives its overlay: the journey
// is chosen from the launch kind, the `general.intro` setting and the ssh config's hosts; any
// key or click ends it, also while the choice is still being made; the overlay fades out in
// 200 ms (at once with Reduce Motion) and goes. Nothing here may hold the app back: every
// failure, and a choice that takes longer than `DECISION_MS`, means "no intro".
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { type LaunchInfo, type Report, appLaunch, hostsList } from '@/api'
import { prefersReducedMotion } from '@/lib/motion'
import { useReportStore } from '@/stores/report'
import { useSettingsStore } from '@/stores/settings'
import { chooseJourney, devIntro } from './journey'
import type { IntroJourney, IntroScene } from './scene'
import { sceneFromReport } from './scene-from-report'
import { loadStarry } from './starry'

export const FADE_MS = 200
export const REPORT_WAIT_MS = 1500
/** The whole decision (launch, hosts, report, painting data) gets this long. */
export const DECISION_MS = 3000

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
  /** Loads what the intro draws from; a failure means no intro. */
  preload: () => Promise<unknown>
  /** True while the overlay is the topmost thing, so a key may skip it and be swallowed. */
  topmost: () => boolean
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
    preload: loadStarry,
    topmost: () => true,
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
  let listening = false
  let skipped = false
  let giveUp: (plan: null) => void = () => undefined
  const gate = new Promise<null>((resolve) => {
    giveUp = resolve
  })

  /** Ends the intro: fades the overlay out, then drops it. */
  function end(): void {
    const current = plan.value
    if (current === null || leaving.value) return
    if (current.reducedMotion) {
      plan.value = null
      disarm()
      return
    }
    leaving.value = true
    fadeTimer = setTimeout(() => {
      plan.value = null
      leaving.value = false
      disarm()
    }, FADE_MS)
  }

  /** A key or click: before the plan exists it cancels the decision, after it ends the intro. */
  function skip(): void {
    if (plan.value !== null) {
      end()
      return
    }
    if (!listening) return
    skipped = true
    giveUp(null)
    disarm()
  }

  function onKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || MODIFIERS.has(e.key) || e.isComposing) return
    if (!deps.topmost()) return
    e.preventDefault()
    e.stopPropagation()
    skip()
  }

  /** Starts listening for the key that skips; call as soon as the cover is up. */
  function arm(): void {
    if (listening || disposed) return
    listening = true
    window.addEventListener('keydown', onKey, true)
  }

  /** Stops listening; the decision, if still running, ends as "no intro". */
  function disarm(): void {
    listening = false
    window.removeEventListener('keydown', onKey, true)
  }

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

  /** The plan for this launch, or null when no intro should play. */
  async function decide(): Promise<IntroPlan | null> {
    const forced = deps.dev ? devIntro(deps.search).journey : null
    const info = await deps.launch().catch(() => null)
    let journey = forced
    let aliases: string[] | null = null
    if (journey === null) {
      if (info === null) return null
      const mode = deps.mode()
      if (chooseJourney(info.kind, mode, 1) === null) return null
      if (info.kind === 'first') aliases = await deps.hostAliases()
      journey = chooseJourney(info.kind, mode, aliases === null ? null : aliases.length)
      if (journey === null) return null
    } else if (journey === 'first') {
      aliases = await deps.hostAliases()
    }
    return resolveScene(journey, aliases)
  }

  /**
   * Reads the launch once and starts the intro when it should play. Never rejects, and
   * settles within `DECISION_MS` or as soon as a key or click skips it.
   */
  async function start(): Promise<void> {
    if (skipped || disposed) return
    const deadline = setTimeout(() => giveUp(null), DECISION_MS)
    try {
      // The painting data loads while the launch is read, not after it.
      const preload = deps.preload().then(
        () => true,
        (e: unknown) => {
          console.error(e)
          return false
        },
      )
      const work = Promise.all([decide(), preload]).then(([next, loaded]) => (loaded ? next : null))
      void work.catch(() => undefined)
      const next = await Promise.race([work, gate])
      if (next !== null && !skipped && !disposed) {
        plan.value = next
        arm()
      } else {
        disarm()
      }
    } catch (e) {
      console.error(e)
      disarm()
    } finally {
      clearTimeout(deadline)
    }
  }

  onScopeDispose(() => {
    disposed = true
    clearTimeout(fadeTimer)
    giveUp(null)
    disarm()
  })

  return { plan, leaving, start, arm, cancel: disarm, skip, finish: end }
}
