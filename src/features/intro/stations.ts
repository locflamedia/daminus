// Where every dust particle rests in each picture. A station is a flat array, nine numbers
// per particle (x, y, size, trail length, angle, r, g, b, alpha); the storm stores a radius
// and an orbit angle in place of x and y.
import { PARTICLE_STRIDE, paintingStation, putParticle, tintsFor } from './painting'
import { createRng } from './rng'
import type { Rgb } from './rng'
import { keyOf, sampleTargets } from './sampling'
import type { MaskFn, Target } from './sampling'
import { BACK_STAR_INDEX, MOON, STAR_TINT, clampScene } from './scene'
import type { IntroScene } from './scene'
import {
  LOGO_BOX,
  MARK_CY,
  MARK_MX,
  MARK_SCALE,
  drawDunes,
  drawMark,
  drawSix,
  duneColor,
  markColor,
  sixColor,
} from './shapes'
import type { StarryData } from './starry'

export type StationName = 'storm' | 'mark' | 'six' | 'dunes' | 'paintFirst' | 'paintBack'

export interface Station {
  data: Float32Array
  /** The particle that takes each target, or null when every particle is a target. */
  assigned: Int32Array | null
}

export interface Layout {
  n: number
  /** 0..1 position of each particle in the sweep order; later ones leave later. */
  rank: Float32Array
  phase: Float32Array
  jit: Float32Array
  stations: Readonly<Record<StationName, Station>>
  logoBox: typeof LOGO_BOX
}

const AMBIENT: Rgb = [110, 120, 190]
const SEED = 7

/** Maps targets onto particles in sweep order; `prefer` pins the flagged targets to chosen particles. */
export function assignStation(
  targets: readonly Target[],
  size: number,
  ambientAlpha: number,
  alpha: number,
  order: readonly number[],
  home: Float32Array,
  jit: Float32Array,
  prefer: readonly number[] | null,
): Station {
  const n = order.length
  const data = new Float32Array(n * PARTICLE_STRIDE)
  const take = targets.length
  const used = new Uint8Array(n)
  const assigned = new Int32Array(take)
  let pi = 0
  prefer?.forEach((q) => {
    used[q] = 1
  })
  for (let k = 0; k < take; k++) {
    const t = targets[k]
    if (t === undefined) continue
    let p: number
    if (t.pinned && prefer && pi < prefer.length) {
      p = prefer[pi++] ?? 0
    } else {
      let oi = Math.floor((k * n) / take)
      p = order[oi] ?? 0
      while (used[p]) {
        oi = (oi + 1) % n
        p = order[oi] ?? 0
      }
    }
    used[p] = 2
    assigned[k] = p
    putParticle(data, p, t.x, t.y, size, 0, 0, t.color, alpha)
  }
  for (let q = 0; q < n; q++) {
    if (used[q] !== 2) {
      putParticle(
        data,
        q,
        (home[q * 2] ?? 0) + (jit[q] ?? 0) * 4,
        home[q * 2 + 1] ?? 0,
        1.4,
        0,
        0,
        AMBIENT,
        ambientAlpha,
      )
    }
  }
  return { data, assigned }
}

/** Where each cell's dot rests: its cell centre, nudged by a fixed pattern. */
function homePositions(cols: number, n: number, cell: number): Float32Array {
  const home = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    home[i * 2] = (i % cols) * cell + cell / 2 + (((i * 37) % 11) / 5 - 1) * cell * 0.4
    home[i * 2 + 1] =
      Math.floor(i / cols) * cell + cell / 2 + (((i * 53) % 13) / 6 - 1) * cell * 0.4
  }
  return home
}

function stormStation(n: number, rnd: () => number): Float32Array {
  const storm = new Float32Array(n * PARTICLE_STRIDE)
  const color: Rgb = [79, 92, 168]
  for (let i = 0; i < n; i++) {
    const r = 60 + Math.pow(rnd(), 0.7) * 760
    const th = rnd() * 6.283
    putParticle(storm, i, r, th, 1 + rnd() * 2.6, 0, 0, color, 0.4 + rnd() * 0.45)
  }
  return storm
}

/** The mark: the particles of the D's arc are the ones nearest the moon, ordered by angle. */
function markStation(
  mask: MaskFn,
  rnd: () => number,
  order: readonly number[],
  home: Float32Array,
  jit: Float32Array,
): Station {
  const n = order.length
  const sampled = sampleTargets(mask, drawMark, 4200, rnd, markColor)
  const arcX = MARK_MX + 3 * MARK_SCALE
  const logoT = sampled.map((t) => ({ ...t, pinned: t.x > arcX }))
  const nearMoon = (q: number): number =>
    Math.pow((home[q * 2] ?? 0) - MOON[0], 2) + Math.pow((home[q * 2 + 1] ?? 0) - MOON[1], 2)
  const moon = Array.from({ length: n }, (_, i) => i)
  const moonKey = Float64Array.from(moon, nearMoon)
  moon.sort((a, b) => (moonKey[a] ?? 0) - (moonKey[b] ?? 0))
  const arcT = logoT.filter((t) => t.pinned)
  const pref = moon.slice(0, arcT.length)
  const angM = (q: number): number =>
    Math.atan2((home[q * 2 + 1] ?? 0) - MOON[1], (home[q * 2] ?? 0) - MOON[0])
  pref.sort((a, b) => angM(a) - angM(b))
  const angT = (t: Target): number => Math.atan2(t.y - MARK_CY, t.x - (MARK_MX + 4 * MARK_SCALE))
  arcT.sort((a, b) => angT(a) - angT(b))
  const targets = logoT.filter((t) => !t.pinned).concat(arcT)
  return assignStation(targets, 3.4, 0.06, 1, order, home, jit, pref)
}

/** The back picture's tints come from the scene's levels; the first launch has none. */
function paintingStations(data: StarryData, home: Float32Array, scene: IntroScene) {
  const tints = tintsFor(
    BACK_STAR_INDEX,
    scene.stars.map((s) => ({ color: STAR_TINT[s.level] })),
  )
  return {
    paintBack: paintingStation(data, home, tints),
    paintFirst: paintingStation(data, home, []),
  }
}

/** Builds every station for the painting `data` and the app's `scene`. Same input, same layout. */
export function buildLayout(data: StarryData, sceneIn: IntroScene, mask: MaskFn): Layout {
  const scene = clampScene(sceneIn)
  const n = data.cols * data.rows
  const rnd = createRng(SEED)
  const home = homePositions(data.cols, n, data.cell)
  const keys = Float64Array.from({ length: n }, (_, i) =>
    keyOf(home[i * 2] ?? 0, home[i * 2 + 1] ?? 0),
  )
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (keys[a] ?? 0) - (keys[b] ?? 0),
  )
  const rank = new Float32Array(n)
  order.forEach((p, k) => {
    rank[p] = k / n
  })
  const phase = new Float32Array(n)
  const jit = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    phase[i] = rnd() * 6.283
    jit[i] = rnd() * 2 - 1
  }
  const storm = stormStation(n, rnd)
  const mark = markStation(mask, rnd, order, home, jit)
  const six = assignStation(
    sampleTargets(mask, drawSix, 4800, rnd, sixColor),
    3.6,
    0.06,
    1,
    order,
    home,
    jit,
    null,
  )
  const dunes = assignStation(
    sampleTargets(mask, drawDunes(scene.dunes), 5200, rnd, duneColor(scene.dunes)),
    3.2,
    0.06,
    1,
    order,
    home,
    jit,
    null,
  )
  const painted = paintingStations(data, home, scene)
  const whole = (arr: Float32Array): Station => ({ data: arr, assigned: null })
  return {
    n,
    rank,
    phase,
    jit,
    logoBox: LOGO_BOX,
    stations: {
      storm: whole(storm),
      mark,
      six,
      dunes,
      paintBack: whole(painted.paintBack),
      paintFirst: whole(painted.paintFirst),
    },
  }
}
