// Pure layout for the part-to-whole and column charts: treemap rows, donut segments, the gauge
// arc, stacked shares, rounded bars and the issue columns of the scan history. The components
// only place what these functions return.
import { arcPath, polar, round1, type Point } from './chart-geometry'

// ---------------------------------------------------------------------------------------
// Treemap

export interface TreemapRect {
  /** Left edge as a share of the width, 0 to 1. */
  x: number
  /** Top edge as a share of the height. */
  y: number
  w: number
  h: number
  /** Which row the tile is in, from the top. */
  row: number
}

/** How many tiles go in each row when the caller does not say: two rows, the first the shorter. */
export function defaultRows(count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [1]
  const first = Math.max(1, Math.floor(count / 2))
  return [first, count - first]
}

/**
 * Slice-and-dice treemap in rows, as the Disk board draws it: tiles keep the order they are
 * given, a row takes a share of the height by the bytes in it (or by `heights`, one share
 * for each row), and a tile takes a share of the row's width by its own bytes. Values at or
 * under zero are left out; the result holds one rect per kept item, in input order.
 */
export function treemapRows<T extends { value: number }>(
  items: readonly T[],
  rows?: readonly number[],
  heights?: readonly number[],
): { item: T; rect: TreemapRect }[] {
  const kept = items.filter((item) => item.value > 0 && Number.isFinite(item.value))
  const total = kept.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return []

  const sizes = rows && rows.length > 0 ? [...rows] : defaultRows(kept.length)
  // Whatever the caller's counts miss goes in a last row; extra counts are ignored.
  const planned = sizes.reduce((sum, n) => sum + n, 0)
  if (planned < kept.length) sizes.push(kept.length - planned)

  const out: { item: T; rect: TreemapRect }[] = []
  let cursor = 0
  let top = 0
  sizes.forEach((count, row) => {
    const group = kept.slice(cursor, cursor + count)
    cursor += count
    if (group.length === 0) return
    const rowTotal = group.reduce((sum, item) => sum + item.value, 0)
    const h = heights?.[row] ?? rowTotal / total
    let left = 0
    for (const item of group) {
      const w = item.value / rowTotal
      out.push({ item, rect: { x: left, y: top, w, h, row } })
      left += w
    }
    top += h
  })
  return out
}

export interface DiskTile {
  value: number
  /** The rest of the folders, always last. */
  other?: boolean
  /** The folder grew since the last scan. */
  grow?: boolean
  /** By how much, to tell which of several growers grew fastest. */
  growth?: number
}

/**
 * The order of the Disk treemap: folders by size, largest first, the rest bucket last, and
 * the folder that grew fastest since the last scan pulled up to follow the largest, so the
 * change is seen first.
 */
export function orderTreemap<T extends DiskTile>(items: readonly T[]): T[] {
  const kept = items.filter((item) => item.value > 0 && Number.isFinite(item.value))
  const body = kept.filter((item) => !item.other).sort((a, b) => b.value - a.value)
  const rest = kept.filter((item) => item.other)
  let fastest: T | undefined
  for (const item of body) {
    if (item.grow && (!fastest || (item.growth ?? 0) > (fastest.growth ?? 0))) fastest = item
  }
  const from = fastest ? body.indexOf(fastest) : -1
  if (fastest && from > 1) {
    body.splice(from, 1)
    body.splice(1, 0, fastest)
  }
  return [...body, ...rest]
}

/** Row one holds this much of the height when there are two rows. */
const FIRST_ROW_SHARE = 2 / 3

/**
 * The Disk treemap: tiles in `orderTreemap` order, the first row taking half the tiles (rounded
 * down) and two thirds of the height, the second the rest; a tile's width follows its size
 * within its row.
 */
export function diskTreemap<T extends DiskTile>(
  items: readonly T[],
): { item: T; rect: TreemapRect }[] {
  const ordered = orderTreemap(items)
  const rows = defaultRows(ordered.length)
  const heights = rows.length === 2 ? [FIRST_ROW_SHARE, 1 - FIRST_ROW_SHARE] : undefined
  return treemapRows(ordered, rows, heights)
}

export type TileForm = 'full' | 'name' | 'none'

/** Under this width (px) a treemap tile shows nothing and keeps its tooltip. */
export const TILE_MIN_WIDTH = 40
/** Height (px) the name line and the size line need, with the tile's padding. */
export const TILE_FULL_HEIGHT = 62
/** Space (px) a tile's padding takes from its width, both sides. */
export const TILE_PAD_X = 24

/**
 * What a treemap tile of `width` by `height` px shows. Under 40 px wide, nothing; too narrow or
 * too short for the size beside the name (`amount` is the width the size needs), the name
 * alone, cut with an ellipsis; otherwise both. What is left out stays in the tile's tooltip
 * and in the list under the chart.
 */
export function tileForm(width: number, height: number, amount: number): TileForm {
  if (width < TILE_MIN_WIDTH) return 'none'
  if (height < TILE_FULL_HEIGHT || amount > width - TILE_PAD_X) return 'name'
  return 'full'
}

// ---------------------------------------------------------------------------------------
// Donut and gauge

export interface DonutPart {
  value: number
}

export interface DonutSegment<T> {
  part: T
  /** The arc path, ready for a stroke with round caps. */
  d: string
  /** Share of the whole, 0 to 1. */
  share: number
}

export interface DonutOptions {
  cx?: number
  cy?: number
  r?: number
  /** Gap left between neighbours, in degrees. */
  gap?: number
  /** Degrees the round cap eats at each end, so the caps do not overlap the gap. */
  cap?: number
  /** The whole the parts are shares of; defaults to their sum. */
  total?: number
}

/**
 * Segments of the disk donut: 6 degrees apart, from 12 o'clock, in the order given (largest
 * first, as the board says). A segment too short for its caps still draws a dot.
 */
export function donutSegments<T extends DonutPart>(
  parts: readonly T[],
  options: DonutOptions = {},
): DonutSegment<T>[] {
  const { cx = 85, cy = 85, r = 64, gap = 6, cap = 9 } = options
  const kept = parts.filter((p) => p.value > 0)
  const total = options.total ?? kept.reduce((sum, p) => sum + p.value, 0)
  if (total <= 0) return []
  let used = 0
  return kept.map((part) => {
    const sweep = (360 * part.value) / total
    const a0 = used + gap / 2 + cap
    let a1 = used + sweep - gap / 2 - cap
    if (a1 < a0) a1 = a0 + 0.1
    used += sweep
    return { part, d: arcPath(cx, cy, r, a0, a1), share: part.value / total }
  })
}

export const GAUGE = {
  cx: 70,
  cy: 70,
  r: 52,
  /** The arc runs from -135 to +135 degrees: 270 in all, open at the bottom. */
  from: -135,
  sweep: 270,
} as const

/** Clamps to 0..100; anything that is not a number reads as 0. */
export function clampPercent(pct: number): number {
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0
}

export interface GaugeGeometry {
  /** The whole 270 degree arc; the value is drawn as a dash of it (see `dashOffset`). */
  track: string
  /** Fraction of the arc not filled, for `stroke-dashoffset` on a path with `pathLength="1"`. */
  dashOffset: number
  /** Where the knob sits when the arc is full, and the angle to turn it back to the value. */
  knobStart: Point
  knobAngle: number
}

/**
 * The gauge as one full arc plus a dash offset, so a change of value is a transition of one
 * number (the knob turns with it as a rotation about the centre).
 */
export function gaugeGeometry(pct: number): GaugeGeometry {
  const p = clampPercent(pct)
  return {
    track: arcPath(GAUGE.cx, GAUGE.cy, GAUGE.r, GAUGE.from, GAUGE.from + GAUGE.sweep),
    dashOffset: Math.round((1 - p / 100) * 1000) / 1000,
    knobStart: polar(GAUGE.cx, GAUGE.cy, GAUGE.r, GAUGE.from),
    knobAngle: (p / 100) * GAUGE.sweep,
  }
}

// ---------------------------------------------------------------------------------------
// Stacked bar

/** Widths in percent of the whole, summing to 100; non-positive values get no width. */
export function stackShares(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0)
  if (total <= 0) return values.map(() => 0)
  return values.map((v) => (Math.max(0, v) / total) * 100)
}

// ---------------------------------------------------------------------------------------
// Rounded bars (scan duration)

export interface BarBox {
  x0: number
  x1: number
  /** Top of the full-height track. */
  top: number
  /** Baseline, where bars start. */
  base: number
  /** Bar width. */
  width: number
}

export const BAR_BOX: BarBox = { x0: 8, x1: 372, top: 16, base: 160, width: 14 }

export interface Bar {
  x: number
  y: number
  w: number
  h: number
  /** Full radius: the bar is a pill, and never rounder than it is tall. */
  r: number
}

export interface BarLayout {
  bars: Bar[]
  /** Dashed line at the mean. */
  avgY: number
  max: number
}

/**
 * Pill bars on a faint full-height track. The scale tops out a little above the tallest bar
 * (`headroom`) so the tallest does not touch the track's top.
 */
export function barLayout(
  values: readonly number[],
  box: BarBox = BAR_BOX,
  headroom = 0.06,
): BarLayout {
  const n = values.length
  const peak = Math.max(0, ...values.filter((v) => Number.isFinite(v)))
  const max = peak > 0 ? peak * (1 + headroom) : 1
  const height = box.base - box.top
  const gap = n > 1 ? (box.x1 - box.x0 - box.width * n) / (n - 1) : 0
  const bars = values.map((v, i) => {
    const h = (Math.max(0, v) / max) * height
    return {
      x: round1(box.x0 + i * (box.width + gap)),
      y: round1(box.base - h),
      w: box.width,
      h: round1(h),
      r: Math.min(box.width / 2, h / 2),
    }
  })
  const mean = n > 0 ? values.reduce((sum, v) => sum + v, 0) / n : 0
  return { bars, avgY: round1(box.base - (mean / max) * height), max }
}

// ---------------------------------------------------------------------------------------
// Issues per scan

export interface IssueCounts {
  crit: number
  warn: number
  info: number
}

export type IssueTone = 'crit' | 'warn' | 'info'

export interface IssueSegment {
  tone: IssueTone
  count: number
  /** Height in px. */
  height: number
}

export interface IssueColumnSpec {
  /** Height of one issue, in px. */
  unit: number
  /** Height of the whole column. */
  height: number
  /** Gap between stacked segments. */
  gap: number
}

export const ISSUE_COLUMN: IssueColumnSpec = { unit: 16, height: 120, gap: 2 }

/**
 * Stacked segments of one scan, bottom to top: critical, warning, info. One issue is 16 px;
 * when the busiest scan would not fit the 120 px column the unit shrinks for all of them, so
 * heights stay comparable between scans.
 */
export function issueColumns(
  scans: readonly IssueCounts[],
  { unit, height, gap } = ISSUE_COLUMN,
): IssueSegment[][] {
  let fit = unit
  for (const s of scans) {
    const parts = [s.crit, s.warn, s.info].filter((n) => n > 0)
    const total = parts.reduce((sum, n) => sum + n, 0)
    if (total > 0) fit = Math.min(fit, (height - gap * (parts.length - 1)) / total)
  }
  return scans.map((s) => {
    const tones: [IssueTone, number][] = [
      ['crit', s.crit],
      ['warn', s.warn],
      ['info', s.info],
    ]
    return tones
      .filter(([, count]) => count > 0)
      .map(([tone, count]) => ({ tone, count, height: round1(count * fit) }))
  })
}
