import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { rangeOf } from './viewport'

describe('rangeOf', () => {
  it('is wide from 1280, medium from 1080 and narrow below', () => {
    expect(rangeOf(1920)).toBe('wide')
    expect(rangeOf(1280)).toBe('wide')
    expect(rangeOf(1279)).toBe('medium')
    expect(rangeOf(1080)).toBe('medium')
    expect(rangeOf(1079)).toBe('narrow')
    expect(rangeOf(900)).toBe('narrow')
  })
})

describe('window size', () => {
  it('opens at 1280 and cannot shrink below 900 x 640, the narrowest the layout is drawn for', () => {
    const conf = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../src-tauri/tauri.conf.json', import.meta.url)),
        'utf8',
      ),
    ) as { app: { windows: { width: number; minWidth: number; minHeight: number }[] } }
    const win = conf.app.windows[0]
    expect(win?.width).toBe(1280)
    expect(win?.minWidth).toBe(900)
    expect(win?.minHeight).toBe(640)
  })
})
