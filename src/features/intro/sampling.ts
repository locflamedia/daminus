import { STAGE_H, STAGE_W } from './scene'
import type { Rgb } from './rng'

/**
 * Rasterises what `draw` paints onto an empty stage-sized canvas and returns its alpha plane
 * (`STAGE_W * STAGE_H` bytes). The only part of the layout that needs a canvas.
 */
export type MaskFn = (draw: (ctx: CanvasRenderingContext2D) => void) => Uint8Array

/** A point a dust particle will settle on. */
export interface Target {
  x: number
  y: number
  color: Rgb
  /** Pinned to a chosen particle (the logo's arc, which becomes the moon). */
  pinned: boolean
}

/** Orders points in rows 40 px tall, alternating direction, so neighbours fly together. */
export function keyOf(x: number, y: number): number {
  const row = Math.floor(y / 40)
  return row * 4000 + (row % 2 ? STAGE_W - x : x)
}

/** `count` points drawn at random from the painted pixels, sorted by `keyOf`. */
export function sampleTargets(
  mask: MaskFn,
  draw: (ctx: CanvasRenderingContext2D) => void,
  count: number,
  rnd: () => number,
  colorAt: (x: number, y: number) => Rgb,
): Target[] {
  const alpha = mask(draw)
  const points: [number, number][] = []
  for (let y = 0; y < STAGE_H; y += 3) {
    for (let x = 0; x < STAGE_W; x += 3) {
      if ((alpha[y * STAGE_W + x] ?? 0) > 128) {
        points.push([x + (rnd() - 0.5) * 2, y + (rnd() - 0.5) * 2])
      }
    }
  }
  if (points.length === 0) return []
  const out: Target[] = []
  for (let k = 0; k < count; k++) {
    const p = points[Math.floor(rnd() * points.length)] ?? [0, 0]
    out.push({ x: p[0], y: p[1], color: colorAt(p[0], p[1]), pinned: false })
  }
  return out.sort((a, b) => keyOf(a.x, a.y) - keyOf(b.x, b.y))
}
