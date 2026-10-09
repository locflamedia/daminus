import { createRng } from './rng'
import { STAGE_H, STAGE_W } from './scene'

type Blob = readonly [x: number, y: number, rgb: string, alpha: number]

const BLOBS: readonly Blob[] = [
  [0.18, 0.25, '169,185,245', 0.9],
  [0.78, 0.3, '210,194,244', 0.9],
  [0.55, 0.95, '244,201,220', 0.85],
  [0.05, 0.9, '233,237,254', 0.7],
]

/** A square of faint grey noise, tiled over the backdrop as film grain. */
export function createGrain(canvas: HTMLCanvasElement): HTMLCanvasElement {
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx === null) return canvas
  const image = ctx.createImageData(256, 256)
  const rnd = createRng(11)
  for (let i = 0; i < image.data.length; i += 4) {
    const v = rnd() * 255
    image.data[i] = v
    image.data[i + 1] = v
    image.data[i + 2] = v
    image.data[i + 3] = 9
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Drifting soft blobs on a pale base, with film grain over them, drawn at scale `s`. */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  t: number,
  s: number,
  grain: CanvasImageSource,
): void {
  ctx.save()
  ctx.scale(s, s)
  ctx.fillStyle = '#EDEFFB'
  ctx.fillRect(0, 0, STAGE_W, STAGE_H)
  BLOBS.forEach((b, i) => {
    const bx = (b[0] + 0.06 * Math.sin(t * 0.25 + i * 1.7)) * STAGE_W
    const by = (b[1] + 0.07 * Math.cos(t * 0.21 + i)) * STAGE_H
    const r = STAGE_W * 0.55
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r)
    g.addColorStop(0, `rgba(${b[2]},${b[3]})`)
    g.addColorStop(1, `rgba(${b[2]},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, STAGE_W, STAGE_H)
  })
  const pattern = ctx.createPattern(grain, 'repeat')
  if (pattern !== null) {
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, STAGE_W, STAGE_H)
  }
  ctx.restore()
}
