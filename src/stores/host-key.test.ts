// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostKeyInfo } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { useHostKeyStore } from './host-key'

const OFFERED = 'ED25519 SHA256:Lm7rC1pQe9Vx3Ns0Kd8Tg2Yh5Bw6Fj4Zu7Ha1Mo2Pa'
const RECORDED = 'ED25519 SHA256:q3F8vN2kLx7Tq0Ybe1WmZc4R9sPdH6uJt5Ao8Gk9Xk'

/** Answers each look with the next info of `script`, then the last one again. */
function lookups(script: (HostKeyInfo | null)[]) {
  const seen: string[] = []
  mockCommands((cmd, args) => {
    if (cmd !== 'host_key_check') return null
    seen.push(String(args.host))
    return script[Math.min(seen.length - 1, script.length - 1)]
  })
  return seen
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => clearMocks())

describe('host key store', () => {
  it('shows the key the scan carried, then adds what the lookup found', async () => {
    lookups([{ state: 'changed', offered: OFFERED, known: [RECORDED] }])
    const store = useHostKeyStore()
    const opening = store.open('db-main', { state: 'changed', offered: OFFERED, known: [] })
    expect(store.alias).toBe('db-main')
    expect(store.reading).toBe(true)
    expect(store.face).toBe('changed')
    expect(store.info?.known).toEqual([])
    await opening
    expect(store.reading).toBe(false)
    expect(store.info?.known).toEqual([RECORDED])
  })

  it('says unavailable when nothing is known and the lookup cannot read the key', async () => {
    lookups([null])
    const store = useHostKeyStore()
    await store.open('db-main')
    expect(store.face).toBe('unavailable')
    expect(store.isOpen).toBe(true)
  })

  it('reports what Retry found: still unknown, then accepted', async () => {
    const unknown: HostKeyInfo = { state: 'unknown', offered: OFFERED, known: [] }
    lookups([unknown, unknown, { state: 'known', offered: OFFERED, known: [OFFERED] }])
    const store = useHostKeyStore()
    await store.open('db-main')
    expect(await store.retry()).toBe('still_unknown')
    expect(store.result).toBe('still_unknown')
    expect(store.face).toBe('unknown')
    expect(await store.retry()).toBe('accepted')
    expect(store.face).toBe('unknown')
    expect(store.retrying).toBe(false)
  })

  it('opens the changed face when the key changed since the person looked', async () => {
    const unknown: HostKeyInfo = { state: 'unknown', offered: OFFERED, known: [] }
    lookups([unknown, { state: 'changed', offered: OFFERED, known: [RECORDED] }])
    const store = useHostKeyStore()
    await store.open('db-main')
    expect(await store.retry()).toBe('changed')
    expect(store.face).toBe('changed')
  })

  it('forgets everything on close, and ignores a lookup that comes back late', async () => {
    lookups([{ state: 'unknown', offered: OFFERED, known: [] }])
    const store = useHostKeyStore()
    const opening = store.open('db-main')
    store.close()
    await opening
    expect(store.alias).toBeNull()
    expect(store.info).toBeNull()
    expect(await store.retry()).toBeNull()
  })

  it('calls Rust with the alias of the host it was opened for', async () => {
    const seen = lookups([null])
    const store = useHostKeyStore()
    await store.open('legacy-shop')
    await store.retry()
    expect(seen).toEqual(['legacy-shop', 'legacy-shop'])
  })
})
