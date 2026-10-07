// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { watchFullscreen } from './window'

afterEach(() => {
  clearMocks()
  delete (globalThis as { isTauri?: boolean }).isTauri
})

describe('watchFullscreen', () => {
  it('reports nothing outside a Tauri window', async () => {
    const onChange = vi.fn()
    const stop = await watchFullscreen(onChange)
    stop()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports the current state, then again after a resize', async () => {
    ;(globalThis as { isTauri?: boolean }).isTauri = true
    let full = false
    mockWindows('main')
    mockIPC(
      (cmd) => {
        if (cmd === 'plugin:window|is_fullscreen') return full
        return null
      },
      { shouldMockEvents: true },
    )
    const seen: boolean[] = []
    const stop = await watchFullscreen((value) => seen.push(value))
    expect(seen).toEqual([false])

    full = true
    const { emit } = await import('@tauri-apps/api/event')
    await emit('tauri://resize', {})
    await vi.waitFor(() => expect(seen).toEqual([false, true]))
    stop()
  })

  it('keeps the layout usable when the window cannot be read', async () => {
    ;(globalThis as { isTauri?: boolean }).isTauri = true
    // No window metadata: reading the current window throws.
    const stop = await watchFullscreen(() => {})
    expect(typeof stop).toBe('function')
  })
})
