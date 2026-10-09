import type { IntroJourney } from './scene'
import type { StationName } from './stations'

/** `[station, seconds to travel there, seconds to hold]`. */
type Step = readonly [StationName, number, number]

export const JOURNEYS: Readonly<Record<IntroJourney, readonly Step[]>> = {
  first: [
    ['storm', 0.9, 0.4],
    ['mark', 0.8, 1.4],
    ['paintFirst', 1.4, 3.6],
  ],
  back: [
    ['mark', 0.7, 1.2],
    ['six', 0.7, 1.0],
    ['dunes', 0.7, 1.0],
    ['paintBack', 1.3, 3.2],
  ],
  daily: [['mark', 0.7, 0.8]],
  nohosts: [
    ['storm', 0.9, 0.4],
    ['mark', 0.8, 1.4],
    ['paintFirst', 1.4, 2.1],
  ],
}

/** The names the storyboard shows for a station. */
export const STATION_NAMES: Readonly<Record<StationName, string>> = {
  storm: 'Storm',
  mark: 'Mark',
  six: 'Six',
  dunes: 'Dunes',
  paintFirst: 'Starry Night',
  paintBack: 'Starry Night',
}

export interface Segment {
  st: StationName
  /** Second the dust starts to travel to this station. */
  start: number
  /** Seconds of travel. */
  len: number
  /** Second this station is left for the next. */
  end: number
}

export interface Timeline {
  segments: readonly Segment[]
  /** Seconds from the first frame to the last. */
  duration: number
}

export function buildTimeline(journey: IntroJourney): Timeline {
  let t = 0
  const segments = JOURNEYS[journey].map(([st, len, hold]) => {
    const seg: Segment = { st, start: t, len, end: t + len + hold }
    t += len + hold
    return seg
  })
  return { segments, duration: t }
}

export interface Where {
  k: number
  seg: Segment
  prev: Segment
}

/** The segment `t` falls in, and the one before it (itself for the first). */
export function where(timeline: Timeline, t: number): Where {
  const segs = timeline.segments
  for (let k = segs.length - 1; k >= 0; k--) {
    const seg = segs[k]
    if (seg !== undefined && t >= seg.start)
      return { k, seg, prev: segs[Math.max(0, k - 1)] ?? seg }
  }
  const first = segs[0]
  if (first === undefined) throw new Error('a journey has at least one station')
  return { k: 0, seg: first, prev: first }
}

/** Cubic ease in and out. */
export function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
}

/** Whether the text layer of `key` is showing while the dust is in segment `st` at progress `p`. */
export function overlayOn(key: StationName, st: StationName, p: number): boolean {
  let on = key === st && (st === 'storm' || p > 0.75)
  if (key === 'mark' && st === 'six' && p < 0.3) on = true
  return on
}

/** The storyboard's pick: one moment per station, just after its travel ends (4 at most). */
export function framePicks(timeline: Timeline): { t: number; name: string }[] {
  return timeline.segments
    .map((seg) => ({
      t: seg.start + seg.len + Math.min(0.6, (seg.end - seg.start - seg.len) * 0.6),
      name: STATION_NAMES[seg.st],
    }))
    .slice(0, 4)
}
