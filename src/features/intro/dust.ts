// Draws the dust: every particle moves from the previous station to the current one on its
// own delay, and the moving points are batched into one stroked path per colour and size.
import { PARTICLE_STRIDE } from './painting'
import { ease, where } from './journeys'
import type { Timeline } from './journeys'
import { STAGE_H, STAGE_W } from './scene'
import type { Layout, StationName } from './stations'

export interface DustFrame {
  station: StationName
  from: StationName
  /** Index of the segment the dust is travelling to or holding at. */
  segment: number
  /** True once the travel is over and the dust only rests. */
  held: boolean
  /** Travel progress, 0 at the segment's start, above 1 while holding. */
  p: number
  fadeIn: number
  fadeOut: number
}

interface Bucket {
  style: string
  width: number
  points: number[]
  stamp: number
}

/** `loopLength` fades the picture out over its last half second; the app passes none. */
export function frameState(timeline: Timeline, t: number, loopLength: number | null): DustFrame {
  const w = where(timeline, t)
  const fadeOut =
    loopLength !== null && t > loopLength - 0.5 ? Math.max(0, (loopLength - t) / 0.5) : 1
  return {
    station: w.seg.st,
    from: w.prev.st,
    segment: w.k,
    held: t >= w.seg.start + w.seg.len,
    p: (t - w.seg.start) / w.seg.len,
    fadeIn: Math.min(1, t / 0.4),
    fadeOut,
  }
}

const A = new Float32Array(9)
const B = new Float32Array(9)

function readParticle(layout: Layout, st: StationName, i: number, t: number, out: Float32Array) {
  const a = layout.stations[st].data
  const o = i * PARTICLE_STRIDE
  for (let j = 0; j < PARTICLE_STRIDE; j++) out[j] = a[o + j] ?? 0
  if (st === 'storm') {
    const r = a[o] ?? 0
    const th = (a[o + 1] ?? 0) + t * (1.4 - r / 760) * 0.6
    out[0] = STAGE_W / 2 + Math.cos(th) * r
    out[1] = STAGE_H / 2 + Math.sin(th) * r * 0.55
  }
}

const isPainting = (st: StationName): boolean => st === 'paintFirst' || st === 'paintBack'

export interface DustRenderer {
  draw(ctx: CanvasRenderingContext2D, timeline: Timeline, t: number, s: number, f: DustFrame): void
}

export function createDustRenderer(layout: Layout): DustRenderer {
  const buckets = new Map<number, Bucket>()
  let frameId = 0
  return {
    draw(ctx, timeline, t, s, f) {
      frameId += 1
      const seg = timeline.segments[f.segment]
      if (seg === undefined) return
      const painting = isPainting(f.station)
      const first = f.segment === 0
      if (painting) {
        ctx.save()
        ctx.scale(s, s)
        const shade = f.held ? 0.9 : 0.9 * Math.min(1, (t - seg.start) / seg.len)
        ctx.fillStyle = `rgba(28,36,76,${shade})`
        ctx.fillRect(0, 0, STAGE_W, STAGE_H)
        ctx.restore()
      }
      const active: Bucket[] = []
      for (let i = 0; i < layout.n; i++) {
        const delay = (layout.rank[i] ?? 0) * 0.35
        const p = first
          ? 1
          : ease(Math.min(1, Math.max(0, (t - seg.start - delay * seg.len) / (seg.len * 0.65))))
        readParticle(layout, f.from, i, t, A)
        readParticle(layout, f.station, i, t, B)
        let x = (A[0] ?? 0) + ((B[0] ?? 0) - (A[0] ?? 0)) * p
        let y = (A[1] ?? 0) + ((B[1] ?? 0) - (A[1] ?? 0)) * p
        const sw = Math.sin(Math.PI * p) * 26 * (layout.jit[i] ?? 0)
        x += sw * 0.7
        y -= Math.abs(sw) * 0.5
        const size = (A[2] ?? 0) + ((B[2] ?? 0) - (A[2] ?? 0)) * p
        const len = (A[3] ?? 0) + ((B[3] ?? 0) - (A[3] ?? 0)) * p
        const ang = (B[3] ?? 0) > 0 ? (B[4] ?? 0) : (A[4] ?? 0)
        const al = ((A[8] ?? 0) + ((B[8] ?? 0) - (A[8] ?? 0)) * p) * f.fadeIn * f.fadeOut
        if (painting && p >= 1) {
          const m = Math.sin(t * 1.7 + (layout.phase[i] ?? 0)) * 2
          x += Math.cos(ang) * m
          y += Math.sin(ang) * m
        }
        if (al < 0.02) continue
        const r8 = Math.round(((A[5] ?? 0) + ((B[5] ?? 0) - (A[5] ?? 0)) * p) / 8)
        const g8 = Math.round(((A[6] ?? 0) + ((B[6] ?? 0) - (A[6] ?? 0)) * p) / 8)
        const b8 = Math.round(((A[7] ?? 0) + ((B[7] ?? 0) - (A[7] ?? 0)) * p) / 8)
        const a10 = Math.round(al * 10)
        const s2 = Math.round(size * 2)
        const key = (((r8 * 33 + g8) * 33 + b8) * 11 + a10) * 128 + s2
        let bucket = buckets.get(key)
        if (bucket === undefined) {
          bucket = {
            style: `rgba(${r8 * 8},${g8 * 8},${b8 * 8},${a10 / 10})`,
            width: s2 / 2,
            points: [],
            stamp: 0,
          }
          buckets.set(key, bucket)
        }
        if (bucket.stamp !== frameId) {
          bucket.stamp = frameId
          bucket.points.length = 0
          active.push(bucket)
        }
        const dx = Math.cos(ang) * Math.max(0.01, len)
        const dy = Math.sin(ang) * Math.max(0.01, len)
        bucket.points.push(x - dx, y - dy, x + dx, y + dy)
      }
      ctx.save()
      ctx.scale(s, s)
      ctx.lineCap = 'round'
      for (const bucket of active) {
        ctx.strokeStyle = bucket.style
        ctx.lineWidth = bucket.width
        ctx.beginPath()
        const pts = bucket.points
        for (let q = 0; q < pts.length; q += 4) {
          ctx.moveTo(pts[q] ?? 0, pts[q + 1] ?? 0)
          ctx.lineTo(pts[q + 2] ?? 0, pts[q + 3] ?? 0)
        }
        ctx.stroke()
      }
      ctx.restore()
    },
  }
}
