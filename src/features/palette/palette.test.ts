// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildGroups, dotOf, starryAsked, type PaletteInput } from './palette-model'
import { usePaletteStore } from './palette-store'
import { activateStarry, resetStarry, starryOn } from './starry'

const t = (key: string) => key

function input(over: Partial<PaletteInput> = {}): PaletteInput {
  return {
    projects: [
      { id: 'shop', level: 'crit', unreachable_hosts: [] },
      { id: 'blog', level: 'ok', unreachable_hosts: ['b'] },
    ],
    servers: [{ host: 'web-1', level: 'warn' }],
    domains: { shop: 'shop.example.com', blog: null },
    canScan: true,
    easterEggs: true,
    query: '',
    t,
    ...over,
  }
}

const ids = (groups: ReturnType<typeof buildGroups>) =>
  groups.flatMap((g) => g.items.map((i) => i.id))

describe('building the items', () => {
  it('lists projects, servers, pages and the scan command', () => {
    const groups = buildGroups(input())
    expect(groups.map((g) => g.id)).toEqual(['projects', 'servers', 'pages', 'commands'])
    expect(ids(groups)).toContain('project:shop')
    expect(ids(groups)).toContain('server:web-1')
    expect(ids(groups)).toContain('page:history')
    expect(ids(groups)).toContain('settings:about')
    expect(ids(groups)).toContain('scan')
  })

  it('leaves out the scan command when a scan is not allowed', () => {
    expect(ids(buildGroups(input({ canScan: false })))).not.toContain('scan')
  })

  it('lets a project match by its domain', () => {
    const shop = buildGroups(input())[0]?.items.find((i) => i.id === 'project:shop')
    expect(shop?.keywords).toEqual(['shop.example.com'])
  })

  it('maps levels to dots', () => {
    expect(dotOf('crit')).toBe('crit')
    expect(dotOf('ok', true)).toBe('unknown')
    expect(dotOf('ok')).toBe('ok')
  })
})

describe('the easter egg gate', () => {
  it('shows the row for the word when the setting is on', () => {
    const groups = buildGroups(input({ query: 'starry' }))
    expect(groups[0]?.items[0]?.id).toBe('starry')
  })

  it('shows no row when the setting is off', () => {
    expect(ids(buildGroups(input({ query: 'starry', easterEggs: false })))).not.toContain('starry')
    expect(starryAsked('starry', false)).toBe(false)
  })

  it('shows no row for other text', () => {
    expect(ids(buildGroups(input({ query: 'star' })))).not.toContain('starry')
  })

  it('stays on when asked again, and is gone after a reset', () => {
    activateStarry()
    activateStarry()
    expect(starryOn.value).toBe(true)
    resetStarry()
    expect(starryOn.value).toBe(false)
  })
})

describe('the palette store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('opens instant from the keyboard only', () => {
    const s = usePaletteStore()
    s.show(true)
    expect(s.open && s.instant).toBe(true)
    s.close()
    s.show()
    expect(s.open).toBe(true)
    expect(s.instant).toBe(false)
  })
})

describe('onTrayOpenProject', () => {
  beforeEach(() => vi.resetModules())

  it('passes the payload through when running in Tauri', async () => {
    const unlisten = vi.fn()
    const listen = vi.fn(async (_: string, cb: (e: { payload: unknown }) => void) => {
      cb({ payload: { project_id: 'shop' } })
      return unlisten
    })
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
    vi.doMock('@tauri-apps/api/event', () => ({ listen }))
    const { onTrayOpenProject } = await import('@/api/events')
    const seen: unknown[] = []
    await onTrayOpenProject((e) => seen.push(e))
    expect(listen.mock.calls[0]?.[0]).toBe('tray://open-project')
    expect(seen).toEqual([{ project_id: 'shop' }])
  })

  it('does nothing outside Tauri', async () => {
    const listen = vi.fn()
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => false }))
    vi.doMock('@tauri-apps/api/event', () => ({ listen }))
    const { onTrayOpenProject } = await import('@/api/events')
    const stop = await onTrayOpenProject(() => {})
    stop()
    expect(listen).not.toHaveBeenCalled()
  })
})
