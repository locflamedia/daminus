// The one scan store (the report lives in `useReportStore`). Hydrates from `scan_status()`
// on mount or reload, then follows `scan://event`: events of an ended or unknown scan are
// dropped, events already folded into the hydrated status (`seq < next_seq`) are skipped,
// and a gap in `seq` triggers a fresh hydrate.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  type AppError,
  type HostProgress,
  type ScanEvent,
  type ScanRun,
  type ScanScope,
  isAppError,
  onScanEvent,
  onScanRefused,
  scanStart,
  scanStatus,
  scanStop,
} from '@/api'
import { useReportStore } from './report'

export type ScanEnd = 'done' | 'cancelled' | 'failed'

/** Folds one event into `run`, mirroring `ScanRun::apply` in Rust. */
export function applyEvent(run: ScanRun, e: ScanEvent): void {
  run.next_seq = e.seq + 1
  if (!('host' in e)) return
  const p: HostProgress | undefined = run.hosts[e.host]
  if (!p) return
  const keep = { step: p.step, facts: p.facts, dropped: p.dropped }
  switch (e.kind) {
    case 'host_started':
      run.hosts[e.host] = { ...keep, state: 'connecting' }
      break
    case 'agent_wait':
      run.hosts[e.host] = { ...keep, state: 'agent_wait' }
      break
    case 'host_running':
      run.hosts[e.host] = { ...keep, state: 'running' }
      break
    case 'step':
      run.hosts[e.host] = { ...keep, step: e.group, state: 'running' }
      break
    case 'fact':
      run.hosts[e.host] = { ...keep, facts: keep.facts + 1, state: 'running' }
      break
    case 'host_finished':
      run.hosts[e.host] = {
        step: keep.step,
        facts: e.facts,
        dropped: e.dropped,
        state: 'finished',
        outcome: e.outcome,
      }
      break
  }
}

function isFinal(e: ScanEvent): boolean {
  return e.kind === 'done' || e.kind === 'cancelled' || e.kind === 'failed'
}

export const useScanStore = defineStore('scan', () => {
  const reports = useReportStore()
  const run = ref<ScanRun | null>(null)
  const error = ref<AppError | null>(null)
  const lastEnd = ref<ScanEnd | null>(null)
  const scanning = computed(() => run.value !== null)

  const ended = new Set<string>()
  /** Events that arrived while a hydrate was in flight, replayed after it. */
  let buffered: ScanEvent[] | null = null
  /** The read in flight: a second caller waits for the same answer instead of returning early. */
  let reading: Promise<void> | null = null
  let unlisten: (() => void) | null = null

  function fail(e: unknown) {
    error.value = isAppError(e) ? e : null
    if (!isAppError(e)) console.error(e)
  }

  function finish(e: ScanEvent) {
    ended.add(e.scan_id)
    if (run.value?.scan_id === e.scan_id) run.value = null
    if (e.kind === 'done') {
      lastEnd.value = 'done'
      void reports.loadLatest()
    } else if (e.kind === 'cancelled') {
      lastEnd.value = 'cancelled'
    } else if (e.kind === 'failed') {
      lastEnd.value = 'failed'
      error.value = e.error
    }
  }

  /** Reads the scan in progress; events arriving meanwhile (and `pending`)
   * are replayed after it. A call made while a read is in flight joins that read, so every
   * caller resumes only once the status is known. */
  function hydrate(pending: ScanEvent[] = []): Promise<void> {
    if (reading) {
      buffered?.push(...pending)
      return reading
    }
    buffered = pending
    reading = (async () => {
      try {
        const status = await scanStatus()
        run.value = status && !ended.has(status.scan_id) ? status : null
        // A scan runs (one the menu bar started once the line was fixed): the refusal is old.
        if (run.value && error.value?.code.kind === 'ssh_config_invalid') error.value = null
      } catch (e) {
        fail(e)
      }
      // Cleared before the replay: an event that needs another read must be able to start one.
      reading = null
      const replay = buffered ?? []
      buffered = null
      for (const e of replay) handle(e, true)
    })()
    return reading
  }

  function handle(e: ScanEvent, replaying = false) {
    if (buffered) {
      buffered.push(e)
      return
    }
    if (ended.has(e.scan_id)) return
    const r = run.value
    if (!r || r.scan_id !== e.scan_id) {
      // Just hydrated and still unknown: the scan already ended (only its
      // final event matters) or the event is a straggler.
      if (replaying) {
        if (isFinal(e)) finish(e)
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
    if (isFinal(e)) finish(e)
    else applyEvent(r, e)
  }

  /** Subscribes once, then reads the live scan and the saved report. */
  async function init() {
    if (!unlisten) {
      const scans = await onScanEvent((e) => handle(e))
      // The menu bar's Scan now stopped before ssh: the window says it too.
      const refused = await onScanRefused((e) => (error.value = e))
      unlisten = () => {
        scans()
        refused()
      }
    }
    await Promise.all([hydrate(), reports.loadLatest()])
  }

  function dispose() {
    unlisten?.()
    unlisten = null
  }

  async function start(scope?: ScanScope) {
    error.value = null
    lastEnd.value = null
    try {
      const started = await scanStart(scope)
      if (run.value?.scan_id !== started.scan_id && !ended.has(started.scan_id)) await hydrate()
    } catch (e) {
      fail(e)
    }
  }

  /** Stops the scan. `scan_stop` answers once it has ended, so a hydrate
   * right after clears `run` even if the final event was dropped. */
  async function stop() {
    try {
      await scanStop()
    } catch (e) {
      fail(e)
    }
    await hydrate()
  }

  return { run, error, lastEnd, scanning, init, dispose, hydrate, start, stop }
})
