// The browser parts of the intro: the rasteriser the layout is sampled with, the app icon
// and the font the big "6" is drawn in.
import iconUrl from '@/assets/app-icon.png'
import { STAGE_H, STAGE_W } from './scene'
import type { MaskFn } from './sampling'

export const canvasMask: MaskFn = (draw) => {
  const canvas = document.createElement('canvas')
  canvas.width = STAGE_W
  canvas.height = STAGE_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx === null) return new Uint8Array(STAGE_W * STAGE_H)
  draw(ctx)
  const rgba = ctx.getImageData(0, 0, STAGE_W, STAGE_H).data
  const alpha = new Uint8Array(STAGE_W * STAGE_H)
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3] ?? 0
  return alpha
}

/** Waits until the weight the "6" uses is ready; a font that fails to load only changes the glyph. */
export async function ensureFont(): Promise<void> {
  try {
    await document.fonts.load('600 520px Geist')
    await document.fonts.ready
  } catch {
    // The text still draws in the fallback face.
  }
}

/** The app icon tile, or null when it cannot be loaded (the dust alone still forms the mark). */
export function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = iconUrl
  })
}
