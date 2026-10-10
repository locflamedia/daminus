// The setup flow on the Rust side, as the screens use it: the hosts of `~/.ssh/config`, which
// ones are ticked, what the login test said about each, what discover found, and the one run
// that is going. Like the scan store it hydrates from `setup_status()` and then follows
// `setup://event`: events of an ended or unknown run are dropped, events already folded into the
// hydrated status (`seq < next_seq`) are skipped, and a gap in `seq` triggers a fresh hydrate.
//
// The core runs one step at a time and a new run forgets the hosts it was not given, so this
// store keeps what each host answered across runs and starts the next test only when the
// previous run has ended.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  type AgentState,
  type AppError,
  type HostAlias,
  type HostEntry,
  type HostKeyInfo,
  type HostListing,
  type HostOutcome,
  type HostSetup,
  type SetupEvent,
  type SetupRecord,
  type SetupResult,
  type SetupRun,
  type SetupStep,
  type SkippedHost,
  type SshConfigProblem,
  type SshEnvironment,
  type EmptyReason,
  hostsList,
  isAppError,
  onSetupEvent,
  setupResult,
  setupStart,
  setupStatus,
  setupStop,
  sshEnvironment,
} from '@/api'
import {
  type TestChip,
  type TestProgress,
  chipOf,
  isFailed,
  isReady,
  isRunning,
} from '@/lib/host-test'
import { useProjectsStore } from './projects'

export type SetupEnd = 'done' | 'cancelled' | 'failed'

/** The three screens of the flow, in order. */
export const SETUP_STEPS = ['pick', 'discover', 'group'] as const
export type SetupScreen = (typeof SETUP_STEPS)[number]

/** What one host answered to the last run that asked it something. */
export interface HostAnswer {
  outcome: HostOutcome | null
  /** Wall time of the run on this host, in ms. */
  ms: number | null
  hostKey: HostKeyInfo | null
}

/** How the discover run on a host ended, for its lane. */
export interface LaneEnd {
  outcome: HostOutcome
  ms: number
  items: number
  dropped: number
}

/** Folds one event into `run`, mirroring `SetupRun::apply` in Rust. */
export function applySetupEvent(run: SetupRun, e: SetupEvent): void {
  run.next_seq = e.seq + 1
  if (!('host' in e)) return
  const p = run.hosts[e.host]
  if (!p) return
  const items = p.items
  switch (e.kind) {
    case 'host_started':
      run.hosts[e.host] = { state: 'connecting', items, dropped: p.dropped }
      break
    case 'agent_wait':
      run.hosts[e.host] = { state: 'agent_wait', items, dropped: p.dropped }
      break
    case 'host_running':
      run.hosts[e.host] = { state: 'running', items, dropped: p.dropped }
      break
    case 'item':
      run.hosts[e.host] = { state: 'running', items: items + 1, dropped: p.dropped }
      break
    case 'host_finished':
      run.hosts[e.host] = {
        state: 'finished',
        outcome: e.outcome,
        items: e.items,
        dropped: e.dropped,
      }
      break
  }
}

function isFinal(e: SetupEvent): boolean {
  return e.kind === 'done' || e.kind === 'cancelled' || e.kind === 'failed'
}

export const useSetupStore = defineStore('setup', () => {
  const projects = useProjectsStore()

  // --- the hosts -----------------------------------------------------------------------
  const listing = shallowRef<HostListing | null>(null)
  const environment = ref<SshEnvironment | null>(null)
  const loading = ref(false)
  /** The "Add host" sheet is open (the hand-made Host block). */
  const addHostOpen = ref(false)
  const error = ref<AppError | null>(null)

  const entries = computed<HostEntry[]>(() => listing.value?.entries ?? [])
  const skipped = computed<SkippedHost[]>(() => listing.value?.list.skipped ?? [])
  const configFound = computed(() => listing.value?.list.config_found ?? false)
  /** Why there is no host to pick: no file, or a file with nothing usable. */
  const emptyReason = computed<EmptyReason | null>(() => listing.value?.list.empty ?? null)
  const agent = computed<AgentState | null>(() => environment.value?.agent ?? null)
  /** ssh refused the config itself (a bad line): every host fails until it is fixed. */
  const configProblem = computed<SshConfigProblem | null>(() => listing.value?.config_error ?? null)
  const configError = computed<AppError | null>(() => configProblem.value?.error ?? null)

  function fail(e: unknown) {
    error.value = isAppError(e) ? e : null
    if (!isAppError(e)) console.error(e)
  }

  /** Reads the ssh config and the agent. A failure keeps what was listed before. */
  async function load() {
    loading.value = true
    try {
      const [hosts, env] = await Promise.all([hostsList(), sshEnvironment()])
      listing.value = hosts
      environment.value = env
      error.value = null
      const known = new Set(hosts.entries.map((h) => h.host.alias))
      ticked.value = ticked.value.filter((a) => known.has(a))
      if (!hosts.config_error) {
        // Ticked while ssh refused the config: tested now that it reads again.
        const waiting = ticked.value.filter((h) => !queue.value.includes(h) && needsTest(h))
        queue.value = [...queue.value, ...waiting]
        void startQueued()
      }
    } catch (e) {
      fail(e)
    } finally {
      loading.value = false
    }
  }

  /** "Reload" / "Check again": the config is read again and the ticks are kept. */
  const reload = load

  // --- ticks and tests -----------------------------------------------------------------
  /** Hosts the user wants, in the order they ticked them. */
  const ticked = ref<HostAlias[]>([])
  /** What each host answered; kept across runs. */
  const answers = ref<Record<string, HostAnswer>>({})
  const logins = shallowRef<Record<string, HostSetup>>({})
  const run = ref<SetupRun | null>(null)
  const lastEnd = ref<SetupEnd | null>(null)
  const runError = ref<AppError | null>(null)
  /** Hosts waiting for the run in progress to end before their test starts. */
  const queue = ref<HostAlias[]>([])

  function progressOf(host: string): TestProgress | null {
    const p = run.value?.step === 'test' ? run.value.hosts[host] : undefined
    if (p)
      return p.state === 'finished' ? { state: 'finished', outcome: p.outcome } : { state: p.state }
    if (queue.value.includes(host)) return { state: 'queued' }
    const answer = answers.value[host]
    return answer?.outcome ? { state: 'finished', outcome: answer.outcome } : null
  }

  /** The chip of a host's login test, live while a run is going. */
  function chip(host: string): TestChip {
    const progress = progressOf(host)
    if (configProblem.value && (progress === null || progress.state === 'queued')) {
      return 'not_checked'
    }
    return chipOf(progress, logins.value[host]?.login ?? null)
  }

  function isTicked(host: string): boolean {
    return ticked.value.includes(host)
  }

  /** Hosts that were ticked and answered the login test. */
  const ready = computed(() => ticked.value.filter((h) => isReady(chip(h))))
  const failedHosts = computed(() => ticked.value.filter((h) => isFailed(chip(h))))
  const testing = computed(() =>
    ticked.value.filter((h) => isRunning(chip(h)) || chip(h) === 'queued'),
  )

  /** Project folders the login test asks about on `host`: the saved projects' code folders. */
  function pathsFor(host: string): string[] {
    return [
      ...new Set(
        projects.details.flatMap((p) =>
          p.components.flatMap((c) => (c.host === host && c.kind === 'path' ? [c.path] : [])),
        ),
      ),
    ]
  }

  function needsTest(host: string): boolean {
    const c = chipOf(progressOf(host), logins.value[host]?.login ?? null)
    return c === 'queued' && !queue.value.includes(host) && answers.value[host]?.outcome == null
  }

  async function startQueued() {
    // ssh refuses the config: every test would fail; they start once it is fixed.
    if (configProblem.value || run.value || queue.value.length === 0) return
    const hosts = [...queue.value]
    const paths = [...new Set(hosts.flatMap(pathsFor))]
    try {
      const started = await setupStart('test', hosts, paths)
      if (!started.joined) queue.value = queue.value.filter((h) => !hosts.includes(h))
      await hydrate()
    } catch (e) {
      queue.value = queue.value.filter((h) => !hosts.includes(h))
      fail(e)
    }
  }

  /** Ticks or unticks a host. A host that was never tested is tested at once. */
  function tick(host: string, on: boolean) {
    if (on) {
      if (!isTicked(host)) ticked.value = [...ticked.value, host]
      skippedHosts.value = skippedHosts.value.filter((h) => h !== host)
      if (needsTest(host)) {
        queue.value = [...queue.value, host]
        void startQueued()
      }
    } else {
      ticked.value = ticked.value.filter((h) => h !== host)
      // Still waiting for its test (a run in progress, or a config ssh refuses): not tested.
      queue.value = queue.value.filter((h) => h !== host)
    }
  }

  /** Ticks every listed host, or none. */
  function tickAll(on: boolean) {
    if (!on) {
      for (const e of entries.value) tick(e.host.alias, false)
      return
    }
    // Every host is queued before the one run starts, so they all go in the same run.
    for (const e of entries.value) {
      const host = e.host.alias
      if (!isTicked(host)) ticked.value = [...ticked.value, host]
      skippedHosts.value = skippedHosts.value.filter((h) => h !== host)
      if (needsTest(host)) queue.value = [...queue.value, host]
    }
    void startQueued()
  }

  /** Tests `host` again (Retry): its earlier answer is forgotten. */
  function retest(host: string) {
    delete answers.value[host]
    logins.value = Object.fromEntries(Object.entries(logins.value).filter(([h]) => h !== host))
    if (!queue.value.includes(host)) queue.value = [...queue.value, host]
    void startQueued()
  }

  /** Hosts the user skipped after a failed test; the sidebar counts them ("1 skipped"). */
  const skippedHosts = ref<HostAlias[]>([])

  /** "Skip host": it leaves this run's list. */
  function skip(host: string) {
    ticked.value = ticked.value.filter((h) => h !== host)
    queue.value = queue.value.filter((h) => h !== host)
    if (!skippedHosts.value.includes(host)) skippedHosts.value = [...skippedHosts.value, host]
  }

  // --- discover ------------------------------------------------------------------------
  const result = shallowRef<SetupResult | null>(null)
  /** Records of the discover run in progress, by host, as they arrive. */
  const liveItems = ref<Record<string, SetupRecord[]>>({})
  const lanes = ref<Record<string, LaneEnd>>({})
  /** Hosts that discover was asked about, in order (the lanes). */
  const discovering = ref<HostAlias[]>([])

  /**
   * What discover found on `host`: the records that arrived in this session, else what the core
   * kept (after a reload of the window).
   */
  function recordsOf(host: string): SetupRecord[] {
    const live = liveItems.value[host]
    if (live) return live
    const found = result.value?.hosts.find((h) => h.host === host)?.discovery
    if (!found) return []
    return [
      ...found.vhosts.map((r) => ({ rec: 'vhost' as const, ...r })),
      ...found.compose.map((r) => ({ rec: 'compose' as const, ...r })),
      ...found.pm2.map((r) => ({ rec: 'pm2' as const, ...r })),
      ...found.pm2_homes.map((r) => ({ rec: 'pm2_home' as const, ...r })),
      ...found.dbs.map((r) => ({ rec: 'db' as const, ...r })),
      ...found.envs.map((r) => ({ rec: 'env' as const, ...r })),
      ...found.ports.map((r) => ({ rec: 'port' as const, ...r })),
      ...found.notes.map((r) => ({ rec: 'note' as const, ...r })),
    ]
  }

  /** The things that make up projects: server blocks, compose projects, pm2 apps, databases. */
  const finds = computed(() =>
    discovering.value.reduce(
      (n, host) =>
        n +
        recordsOf(host).filter(
          (r) => r.rec === 'vhost' || r.rec === 'compose' || r.rec === 'pm2' || r.rec === 'db',
        ).length,
      0,
    ),
  )

  /** Discover waiting for the login-test run in progress to end (the core runs one at a time). */
  const pendingDiscover = ref<HostAlias[] | null>(null)

  async function startDiscover(hosts: HostAlias[] = ready.value) {
    if (hosts.length === 0) return
    discovering.value = [...hosts]
    for (const h of hosts) {
      delete liveItems.value[h]
      delete lanes.value[h]
    }
    if (run.value && run.value.step !== 'discover') {
      pendingDiscover.value = [...hosts]
      return
    }
    try {
      let started = await setupStart('discover', hosts)
      await hydrate()
      if (started.joined && run.value?.step !== 'discover') {
        if (run.value) {
          // A login test really is running: wait for it to end.
          pendingDiscover.value = [...hosts]
        } else {
          // That run ended before the status came back: nothing is left to wake us, so ask once more.
          started = await setupStart('discover', hosts)
          await hydrate()
        }
      }
    } catch (e) {
      fail(e)
    }
  }

  /** "Read again" on one host's lane. */
  async function readAgain(host: HostAlias) {
    await startDiscover([host, ...discovering.value.filter((h) => h !== host && lanes.value[h])])
  }

  async function refreshResult() {
    try {
      const next = await setupResult()
      result.value = next
      const byHost: Record<string, HostSetup> = { ...logins.value }
      for (const h of next.hosts) if (h.login) byHost[h.host] = h
      logins.value = byHost
    } catch (e) {
      fail(e)
    }
  }

  // --- the run -------------------------------------------------------------------------
  const ended = new Set<string>()
  let buffered: SetupEvent[] | null = null
  let reading: Promise<void> | null = null
  let unlisten: (() => void) | null = null

  function noteHostFinished(e: Extract<SetupEvent, { kind: 'host_finished' }>, step: SetupStep) {
    if (step === 'test') {
      answers.value = {
        ...answers.value,
        [e.host]: {
          outcome: e.outcome,
          ms: e.ms,
          hostKey: answers.value[e.host]?.hostKey ?? null,
        },
      }
    } else {
      lanes.value = {
        ...lanes.value,
        [e.host]: { outcome: e.outcome, ms: e.ms, items: e.items, dropped: e.dropped },
      }
    }
  }

  async function finish(e: SetupEvent) {
    ended.add(e.setup_id)
    const step = run.value?.step
    if (run.value?.setup_id === e.setup_id) run.value = null
    lastEnd.value = e.kind === 'done' ? 'done' : e.kind === 'cancelled' ? 'cancelled' : 'failed'
    runError.value = e.kind === 'failed' ? e.error : null
    await refreshResult()
    // A run that was stopped leaves the hosts it never reached without an answer.
    if (step === 'test' && e.kind !== 'done') queue.value = []
    const waiting = pendingDiscover.value
    pendingDiscover.value = null
    if (waiting) await startDiscover(waiting)
    else await startQueued()
  }

  function hydrate(pending: SetupEvent[] = []): Promise<void> {
    if (reading) {
      buffered?.push(...pending)
      return reading
    }
    buffered = pending
    reading = (async () => {
      try {
        const status = await setupStatus()
        run.value = status && !ended.has(status.setup_id) ? status : null
      } catch (e) {
        fail(e)
      }
      reading = null
      const replay = buffered ?? []
      buffered = null
      for (const e of replay) handle(e, true)
    })()
    return reading
  }

  function handle(e: SetupEvent, replaying = false) {
    if (buffered) {
      buffered.push(e)
      return
    }
    if (ended.has(e.setup_id)) return
    const r = run.value
    if (!r || r.setup_id !== e.setup_id) {
      if (replaying) {
        if (isFinal(e)) void finish(e)
        return
      }
      void hydrate([e])
      return
    }
    if (e.seq < r.next_seq) return
    if (e.seq > r.next_seq) {
      void hydrate([e])
      return
    }
    if (isFinal(e)) {
      void finish(e)
      return
    }
    applySetupEvent(r, e)
    switch (e.kind) {
      case 'item':
        liveItems.value = {
          ...liveItems.value,
          [e.host]: [...(liveItems.value[e.host] ?? []), e.item],
        }
        break
      case 'host_key': {
        const answer = answers.value[e.host]
        answers.value = {
          ...answers.value,
          [e.host]: { outcome: answer?.outcome ?? null, ms: answer?.ms ?? null, hostKey: e.info },
        }
        break
      }
      case 'host_finished':
        noteHostFinished(e, r.step)
        // The suggestions and the login answer are in the core's result by now.
        void refreshResult()
        break
    }
  }

  /** Subscribes once, then reads the run in progress and what the core already knows. */
  async function init() {
    if (!unlisten) unlisten = await onSetupEvent((e) => handle(e))
    await Promise.all([hydrate(), refreshResult()])
  }

  function dispose() {
    unlisten?.()
    unlisten = null
  }

  /** Stops the run in progress (Cancel setup, Esc). */
  async function stop() {
    pendingDiscover.value = null
    try {
      await setupStop()
    } catch (e) {
      fail(e)
    }
    await hydrate()
  }

  /** Starts over: nothing ticked, nothing remembered (Cancel setup). */
  function reset() {
    ticked.value = []
    skippedHosts.value = []
    answers.value = {}
    logins.value = {}
    queue.value = []
    pendingDiscover.value = null
    liveItems.value = {}
    lanes.value = {}
    discovering.value = []
    result.value = null
    lastEnd.value = null
    runError.value = null
  }

  const scanning = computed(() => run.value !== null)

  return {
    listing,
    environment,
    loading,
    addHostOpen,
    configError,
    configProblem,
    error,
    entries,
    skipped,
    configFound,
    emptyReason,
    agent,
    load,
    reload,
    ticked,
    answers,
    logins,
    run,
    lastEnd,
    runError,
    queue,
    scanning,
    chip,
    isTicked,
    ready,
    failedHosts,
    testing,
    tick,
    tickAll,
    retest,
    skip,
    skippedHosts,
    result,
    liveItems,
    lanes,
    discovering,
    recordsOf,
    finds,
    startDiscover,
    pendingDiscover,
    readAgain,
    refreshResult,
    init,
    dispose,
    hydrate,
    stop,
    reset,
  }
})
