// The shapes the dust is sampled from: the logo mark, a big "6" and one dune per server.
import { hex } from './rng'
import type { Rgb } from './rng'
import { DUNE_BASE, DUNE_COLOR, DUNE_X, STAGE_W, duneHeight } from './scene'
import type { IntroScene } from './scene'

export const MARK_CX = STAGE_W / 2
export const MARK_CY = 318
export const MARK_SCALE = 8
/** Centres the logo tile on the stage. */
export const MARK_MX = MARK_CX - 2 * MARK_SCALE

const MARK_PATH = 'M5 4h3v16H5z M10 4h3v16h-3z M15 4h1a7 7 0 0 1 0 14h-1z'
const GROUND_COLOR = '#9DAEF2'

/** Where the app icon tile is drawn on the stage. */
export const LOGO_BOX = {
  x: MARK_CX - 20.6 * MARK_SCALE,
  y: MARK_CY - 20.6 * MARK_SCALE - (6 / 824) * 41.2 * MARK_SCALE,
  s: 41.2 * MARK_SCALE,
} as const

export function drawMark(ctx: CanvasRenderingContext2D): void {
  ctx.translate(MARK_MX - 12 * MARK_SCALE, MARK_CY - 12 * MARK_SCALE)
  ctx.scale(MARK_SCALE, MARK_SCALE)
  ctx.fill(new Path2D(MARK_PATH))
}

/** Two navy bars, then the D lit like the painting's moon: a warm core fading to amber. */
export function markColor(x: number, y: number): Rgb {
  const u = (x - (MARK_MX - 12 * MARK_SCALE)) / MARK_SCALE
  const v = (y - (MARK_CY - 12 * MARK_SCALE)) / MARK_SCALE
  if (u < 9) return hex('#8C9BD6')
  if (u < 14) return hex('#34469C')
  const t = Math.min(1, Math.sqrt(Math.pow(u - 17, 2) + Math.pow(v - 11, 2)) / 7.2)
  const a = [255, 241, 176] as const
  const b = [233, 162, 59] as const
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

export function drawSix(ctx: CanvasRenderingContext2D): void {
  ctx.font = '600 520px Geist, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('6', MARK_CX, 580)
}

export function sixColor(_x: number, y: number): Rgb {
  const u = (y - 200) / 380
  return u < 2 / 6 ? hex('#D2436A') : u < 5 / 6 ? hex('#B96C0B') : hex('#7E93EE')
}

type Dunes = IntroScene['dunes']

export function drawDunes(dunes: Dunes): (ctx: CanvasRenderingContext2D) => void {
  return (ctx) => {
    dunes.forEach((dune, h) => {
      const ht = duneHeight(dune.pct)
      const x0 = DUNE_X[h] ?? 0
      ctx.beginPath()
      ctx.moveTo(x0 - 170, DUNE_BASE)
      for (let u = -170; u <= 170; u += 6) {
        ctx.lineTo(x0 + u, DUNE_BASE - ht * Math.exp(-(u * u) / (2 * 62 * 62)))
      }
      ctx.closePath()
      ctx.fill()
    })
    ctx.fillRect(40, DUNE_BASE, STAGE_W - 80, 6)
  }
}

/** The ground line is pale; each dune takes its server's colour, split halfway between peaks. */
export function duneColor(dunes: Dunes): (x: number, y: number) => Rgb {
  return (x, y) => {
    let best = -1
    let bd = 1e9
    for (let h = 0; h < dunes.length; h++) {
      const dd = Math.abs(x - (DUNE_X[h] ?? 0))
      if (dd < bd) {
        bd = dd
        best = h
      }
    }
    const level = dunes[best]?.level
    return y > DUNE_BASE - 2 || level === undefined ? hex(GROUND_COLOR) : hex(DUNE_COLOR[level])
  }
}
