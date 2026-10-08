// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScanRun } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { useScanPanelStore } from './scan-panel'
import { useScanStore } from './scan'

const idle = { facts: 0, dropped: 0 }

function run(hosts: ScanRun['hosts']): ScanRun {
  return { scan_id: 's1', started_at: '2026-09-26T06:00:00Z', next_seq: 3, hosts }
}

const calls: Array<{ cmd: string; args: Record<string, unknown> }> = []

beforeEach(() => {
  calls.length = 0
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    if (cmd === 'scan_start') return { scan_id: 's2', joined: false }
    return null
  })
  setActivePinia(createPinia())
})
afterEach(() => clearMocks())

describe('scan panel store', () => {
  it('opens when a scan is started from the Overview and asks for the whole scan (no scope)', async () => {
    const panel = useScanPanelStore()
    await panel.start()
    expect(panel.open).toBe(true)
    expect(calls.find((c) => c.cmd === 'scan_start')?.args.scope).toBeNull()
  })

  it('passes the scope of a retry, one host and no project', async () => {
    const panel = useScanPanelStore()
    await panel.start({ projects: [], hosts: ['legacy-shop'] })
    expect(calls.find((c) => c.cmd === 'scan_start')?.args.scope).toEqual({
      projects: [],
      hosts: ['legacy-shop'],
    })
  })

  it('keeps the scan running when the panel is tucked away, and ⌘B brings it back', () => {
    const scan = useScanStore()
    const panel = useScanPanelStore()
    scan.run = run({ a: { ...idle, state: 'running' } })
    panel.show()
    panel.toggle()
    expect(panel.open).toBe(false)
    expect(scan.scanning).toBe(true)
    panel.toggle()
    expect(panel.open).toBe(true)
  })

  it('has nothing to bring back when no scan runs', () => {
    const panel = useScanPanelStore()
    panel.toggle()
    expect(panel.open).toBe(false)
  })

  it('closes itself when the scan ends with every host read', async () => {
    const scan = useScanStore()
    const panel = useScanPanelStore()
    scan.run = run({ a: { ...idle, state: 'finished', outcome: { state: 'reached' } } })
    panel.show()
    await flushPromises()
    scan.run = null
    await flushPromises()
    expect(panel.open).toBe(false)
    expect(panel.finished).toBeNull()
  })

  it('stays open after a scan with a failed host, listing it for a retry', async () => {
    const scan = useScanStore()
    const panel = useScanPanelStore()
    scan.run = run({
      a: { ...idle, state: 'finished', outcome: { state: 'reached' } },
      b: { ...idle, state: 'finished', outcome: { state: 'timeout' } },
    })
    panel.show()
    await flushPromises()
    scan.run = null
    await flushPromises()
    expect(panel.open).toBe(true)
    expect(panel.failedHosts).toEqual(['b'])
    expect(panel.run?.hosts.b).toBeDefined()
    expect(panel.endedAt).not.toBeNull()
  })

  it('forgets the last run when a new scan starts', async () => {
    const scan = useScanStore()
    const panel = useScanPanelStore()
    scan.run = run({ b: { ...idle, state: 'finished', outcome: { state: 'timeout' } } })
    await flushPromises()
    scan.run = null
    await flushPromises()
    expect(panel.finished).not.toBeNull()
    scan.run = run({ b: { ...idle, state: 'queued' } })
    await flushPromises()
    expect(panel.finished).toBeNull()
    expect(panel.run?.hosts.b?.state).toBe('queued')
  })
})
