import { hex } from './rng'
import type { Rgb } from './rng'
import { STARS } from './scene'
import type { StarryData } from './starry'

export const PARTICLE_STRIDE = 9

/** A tint: the star's centre and the colour the paint around it is pulled toward. */
export type Tint = readonly [x: number, y: number, color: string]

/** The painting at full bleed in its own colours, with an optional pull toward each star's tint. */
export function paintingStation(
  data: StarryData,
  home: Float32Array,
  tints: readonly Tint[],
): Float32Array {
  const n = data.cols * data.rows
  const arr = new Float32Array(n * PARTICLE_STRIDE)
  const pulls = tints.map((t) => ({ x: t[0], y: t[1], color: hex(t[2]) }))
  for (let q = 0; q < n; q++) {
    const o = q * 4
    let col: Rgb = [data.c[o] ?? 0, data.c[o + 1] ?? 0, data.c[o + 2] ?? 0]
    const hx = home[q * 2] ?? 0
    const hy = home[q * 2 + 1] ?? 0
    for (const pull of pulls) {
      const d2 = (hx - pull.x) * (hx - pull.x) + (hy - pull.y) * (hy - pull.y)
      if (d2 < 1500) {
        const k = Math.pow(1 - d2 / 1500, 0.8)
        col = [
          col[0] + (pull.color[0] - col[0]) * k,
          col[1] + (pull.color[1] - col[1]) * k,
          col[2] + (pull.color[2] - col[2]) * k,
        ]
      }
    }
    const dia =
      data.cell *
      (0.32 + 1.45 * Math.pow(data.z[q] ?? 0, 1.25)) *
      (0.7 + (0.6 * (((q * 2654435761) >>> 0) % 1000)) / 1000)
    putParticle(arr, q, hx, hy, dia, 0, data.c[o + 3] ?? 0, col, 1)
  }
  return arr
}

/** Writes one particle: position, size, trail length, angle, colour, alpha. */
export function putParticle(
  arr: Float32Array,
  i: number,
  x: number,
  y: number,
  size: number,
  len: number,
  angle: number,
  color: Rgb,
  alpha: number,
): void {
  const o = i * PARTICLE_STRIDE
  arr[o] = x
  arr[o + 1] = y
  arr[o + 2] = size
  arr[o + 3] = len
  arr[o + 4] = angle
  arr[o + 5] = color[0]
  arr[o + 6] = color[1]
  arr[o + 7] = color[2]
  arr[o + 8] = alpha
}

/** The star centres of the painting, as the tint list wants them. */
export function tintsFor(
  slotToStar: readonly number[],
  entries: readonly { color: string }[],
): Tint[] {
  return entries.map((e, slot) => {
    const star = STARS[slotToStar[slot] ?? 0] ?? [0, 0]
    return [star[0], star[1], e.color] as const
  })
}
