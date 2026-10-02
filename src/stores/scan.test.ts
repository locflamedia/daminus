// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Report, ScanEvent, ScanEventBody, ScanRun } from '@/api'
import { clearMocks, emitScanEvent, mockCommands } from '@/api/testing'
import { useReportStore } from './report'
import { useScanStore } from './scan'

const STARTED_AT = '2026-09-26T13:42:00Z'

function emptyReport(seq?: number): Report {
  return {
    ...(seq === undefined ? {} : { seq, scanned_at: STARTED_AT }),
    evaluated_at: STARTED_AT,
    items: [],
    projects: [],
    servers: [],
    disabled_groups: [],
    rules_due: [],
    counts: { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0 },
  }
}

function queuedRun(id: string, hosts: string[], nextSeq = 0): ScanRun {
  return {
    scan_id: id,
    started_at: STARTED_AT,
    next_seq: nextSeq,
    hosts: Object.fromEntries(hosts.map((h) => [h, { state: 'queued', facts: 0, dropped: 0 }])),
  }
}

/** A tiny fake of the Rust side: one scan with a status the test controls. */
class FakeBackend {
  status: ScanRun | null = null
  saved = 0
  starts = 0
  readonly id = '19a1b2c3d4e-0'

  handler = (cmd: string): unknown => {
    switch (cmd) {
      case 'scan_status':
        return this.status && structuredClone(this.status)
      case 'report_latest':
        return emptyReport(this.saved || undefined)
      case 'scan_start':
        this.starts += 1
        if (this.status) return { scan_id: this.status.scan_id, joined: true }
        this.status = queuedRun(this.id, ['vps-a', 'vps-b'])
        return { scan_id: this.id, joined: false }
      case 'scan_stop': {
        // Rust answers once the scan has ended.
        const was = this.status !== null
        this.status = null
        return was
      }
      default:
        throw new Error(`unexpected command ${cmd}`)
    }
  }

  /** Sends the next event, folding it into the status first as Rust does. */
  async send(body: ScanEventBody, scanId = this.id) {
    const s = this.status
    const seq = s?.next_seq ?? 0
    const event = { scan_id: scanId, seq, ...body } as ScanEvent
    if (s && scanId === s.scan_id) {
      s.next_seq = seq + 1
      if (body.kind === 'done') {
        this.saved = body.snapshot_seq
        this.status = null
      } else if (body.kind === 'cancelled' || body.kind === 'failed') {
        this.status = null
      } else if ('host' in body) {
        const h = s.hosts[body.host]
        if (h && body.kind === 'fact') h.facts += 1
        if (h && body.kind === 'host_started') s.hosts[body.host] = { ...h, state: 'connecting' }
      }
    }
    await emitScanEvent(event)
    await flush()
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

const fact = (host: string): ScanEventBody => ({
  kind: 'fact',
  host,
  fact: { check: 'sys.load', target: '', value: 0.2, unit: 'load' },
})

let backend: FakeBackend

beforeEach(() => {
  setActivePinia(createPinia())
  backend = new FakeBackend()
  mockCommands((cmd) => backend.handler(cmd))
})

afterEach(() => clearMocks())

describe('useScanStore', () => {
  it('replays a whole scan into the right state', async () => {
    const store = useScanStore()
    await store.init()
    expect(store.scanning).toBe(false)
    expect(useReportStore().latest?.seq).toBeUndefined()

    await store.start()
    expect(store.run?.scan_id).toBe(backend.id)

    await backend.send({ kind: 'host_started', host: 'vps-a' })
    await backend.send({ kind: 'host_started', host: 'vps-b' })
    await backend.send({ kind: 'host_running', host: 'vps-a' })
    await backend.send({ kind: 'step', host: 'vps-a', group: 'system', ms: 3 })
    await backend.send(fact('vps-a'))
    await backend.send(fact('vps-a'))
    await backend.send({ kind: 'agent_wait', host: 'vps-b' })

    expect(store.run?.hosts['vps-a']).toEqual({
      state: 'running',
      step: 'system',
      facts: 2,
      dropped: 0,
    })
    expect(store.run?.hosts['vps-b']?.state).toBe('agent_wait')

    await backend.send({
      kind: 'host_finished',
      host: 'vps-b',
      outcome: { state: 'auth_failed' },
      ms: 900,
      facts: 0,
      dropped: 0,
    })
    expect(store.run?.hosts['vps-b']).toMatchObject({
      state: 'finished',
      outcome: { state: 'auth_failed' },
    })

    await backend.send({ kind: 'done', snapshot_seq: 1 })
    await flush()
    expect(store.scanning).toBe(false)
    expect(store.lastEnd).toBe('done')
    expect(useReportStore().latest?.seq).toBe(1)
  })

  it('hydrates after a reload mid-scan and skips events already counted', async () => {
    // Before the reload: a scan with 3 events already folded in.
    backend.status = queuedRun(backend.id, ['vps-a'], 0)
    await backend.send({ kind: 'host_started', host: 'vps-a' })
    await backend.send(fact('vps-a'))
    await backend.send(fact('vps-a'))

    // The reloaded page: a fresh store.
    setActivePinia(createPinia())
    const store = useScanStore()
    await store.init()
    expect(store.run?.next_seq).toBe(3)
    expect(store.run?.hosts['vps-a']).toMatchObject({ state: 'connecting', facts: 2 })

    // A late copy of seq 2 must not count twice; seq 3 applies.
    await emitScanEvent({ scan_id: backend.id, seq: 2, ...fact('vps-a') } as ScanEvent)
    await flush()
    expect(store.run?.hosts['vps-a']?.facts).toBe(2)
    await backend.send(fact('vps-a'))
    expect(store.run?.hosts['vps-a']?.facts).toBe(3)
  })

  it('drops events of an ended scan and re-hydrates on a gap', async () => {
    const store = useScanStore()
    await store.init()
    await store.start()
    await backend.send({ kind: 'cancelled' })
    expect(store.scanning).toBe(false)
    expect(store.lastEnd).toBe('cancelled')

    // A straggler of the cancelled scan changes nothing.
    await emitScanEvent({ scan_id: backend.id, seq: 0, kind: 'host_started', host: 'vps-a' })
    await flush()
    expect(store.run).toBeNull()

    // A new scan started from the menu bar: the store picks it up.
    backend.status = queuedRun('19a1b2c3d4f-1', ['vps-a'])
    await backend.send({ kind: 'host_started', host: 'vps-a' }, '19a1b2c3d4f-1')
    expect(store.run?.scan_id).toBe('19a1b2c3d4f-1')
    expect(store.run?.hosts['vps-a']?.state).toBe('connecting')

    // Missed events (seq jumps): the store reads the status again.
    backend.status.next_seq = 5
    const h = backend.status.hosts['vps-a']
    if (h) backend.status.hosts['vps-a'] = { ...h, facts: 4 }
    await backend.send(fact('vps-a'), '19a1b2c3d4f-1')
    expect(store.run?.next_seq).toBe(6)
    expect(store.run?.hosts['vps-a']?.facts).toBe(5)
  })

  it('stop clears the run even when the cancelled event is dropped', async () => {
    const store = useScanStore()
    await store.init()
    await store.start()
    expect(store.scanning).toBe(true)
    await store.stop()
    expect(store.scanning).toBe(false)
  })

  it('window and menu bar pressing Scan share one scan', async () => {
    const store = useScanStore()
    await store.init()
    await Promise.all([store.start(), store.start()])
    expect(backend.starts).toBe(2)
    expect(store.run?.scan_id).toBe(backend.id)
  })

  it('a second hydrate waits for the read already in flight', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    backend.status = queuedRun(backend.id, ['vps-a'])
    mockCommands(async (cmd) => {
      if (cmd === 'scan_status') await gate
      return backend.handler(cmd)
    })
    const store = useScanStore()
    void store.hydrate()
    let joined = false
    const second = store.hydrate().then(() => (joined = true))
    await flush()
    expect(joined).toBe(false)
    expect(store.scanning).toBe(false)
    release()
    await second
    expect(store.scanning).toBe(true)
  })

  it('keeps an AppError from a rejected command', async () => {
    mockCommands((cmd) => {
      if (cmd === 'scan_start') {
        throw { code: { kind: 'nothing_to_scan' }, retryable: false }
      }
      return backend.handler(cmd)
    })
    const store = useScanStore()
    await store.init()
    await store.start()
    expect(store.error?.code).toEqual({ kind: 'nothing_to_scan' })
    expect(store.scanning).toBe(false)
  })
})
