import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostSetup, SetupEvent, SetupResult } from './index'

const events: SetupEvent[] = []
vi.mock('./testing', () => ({
  emitSetupEvent: (e: SetupEvent) => {
    events.push(e)
    return Promise.resolve()
  },
}))

const { SetupMock, isSetupVariant } = await import('./dev-mock-setup')

beforeEach(() => {
  events.length = 0
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

function finishedOf(host: string) {
  const e = events.filter((x) => x.kind === 'host_finished' && x.host === host).at(-1)
  return e && e.kind === 'host_finished' ? e : null
}

async function run(
  mock: InstanceType<typeof SetupMock>,
  step: 'test' | 'discover',
  hosts: string[],
) {
  mock.handle('setup_start', { step, hosts })
  await vi.advanceTimersByTimeAsync(20_000)
}

describe('dev mock variants', () => {
  it('registers the failure variants', () => {
    for (const v of ['setup-failures', 'setup-empty-discover', 'setup-queued']) {
      expect(isSetupVariant(v)).toBe(true)
    }
    expect(isSetupVariant('nope')).toBe(false)
  })

  it('ends each login test of the failure variant in its own failure, with the key info', async () => {
    const mock = new SetupMock('setup-failures')
    const aliases = ['vps-sg-1', 'new-edge', 'old-box', 'ghost', 'slow-vpn', 'staging']
    await run(mock, 'test', aliases)
    expect(finishedOf('vps-sg-1')?.outcome.state).toBe('reached')
    expect(finishedOf('new-edge')?.outcome).toMatchObject({ state: 'host_key_unknown' })
    expect(finishedOf('old-box')?.outcome).toMatchObject({ state: 'host_key_changed' })
    expect(finishedOf('ghost')?.outcome).toEqual({ state: 'unreachable', cause: 'dns' })
    expect(finishedOf('slow-vpn')?.outcome.state).toBe('timeout')
    expect(finishedOf('staging')?.outcome.state).toBe('auth_failed')

    const infos = events.flatMap((e) => (e.kind === 'host_key' ? [e] : []))
    expect(infos.map((e) => [e.host, e.info.state])).toEqual([
      ['new-edge', 'unknown'],
      ['old-box', 'changed'],
    ])
    const changed = infos.find((e) => e.host === 'old-box')?.info
    expect(changed?.known).toHaveLength(1)
    // The key info comes before the host ends, as the card needs it when the chip turns.
    const at = (pred: (e: SetupEvent) => boolean) => events.findIndex(pred)
    expect(at((e) => e.kind === 'host_key' && e.host === 'new-edge')).toBeLessThan(
      at((e) => e.kind === 'host_finished' && e.host === 'new-edge'),
    )
    const result = mock.handle('setup_result', {}) as SetupResult
    const setup = result.hosts.find((h: HostSetup) => h.host === 'new-edge')
    expect(setup?.host_key?.offered).toMatch(/^ED25519 SHA256:/)
    expect(setup?.login).toBeNull()
  })

  it('finds nothing on any host in the empty-discover variant, and proposes nothing', async () => {
    const mock = new SetupMock('setup-empty-discover')
    await run(mock, 'test', ['vps-sg-1', 'db-main'])
    await run(mock, 'discover', ['vps-sg-1', 'db-main'])
    expect(events.filter((e) => e.kind === 'item')).toHaveLength(0)
    expect(finishedOf('vps-sg-1')?.items).toBe(0)
    const result = mock.handle('setup_result', {}) as SetupResult
    expect(result.proposal).toEqual({ projects: [], unassigned: [] })
    expect(result.hosts.every((h) => h.discovery?.vhosts.length === 0)).toBe(true)
  })

  it('keeps a host queued for seconds in the queued variant', async () => {
    const mock = new SetupMock('setup-queued')
    mock.handle('setup_start', { step: 'test', hosts: ['vps-sg-1', 'legacy-shop'] })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(finishedOf('vps-sg-1')).not.toBeNull()
    expect(events.some((e) => e.kind === 'host_started' && e.host === 'legacy-shop')).toBe(false)
    const status = mock.handle('setup_status', {}) as { hosts: Record<string, { state: string }> }
    expect(status.hosts['legacy-shop']?.state).toBe('queued')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(finishedOf('legacy-shop')?.outcome.state).toBe('reached')
  })
})
