// What the app feeds the intro, and the fixed layout the painting's stars and dunes sit in.

export type Level = 'crit' | 'warn' | 'ok' | 'offline'

/** What is wrong with a server, as the star's label says it. */
export type StarIssue =
  { kind: 'disk'; pct: number } | { kind: 'crit'; count: number } | { kind: 'warn'; count: number }

export interface IntroScene {
  /** First launch: the host aliases read from the ssh config (the first 5 are drawn). */
  hosts: readonly string[]
  issues: { crit: number; warn: number; disk: number }
  /** Returning: one dune per server (the first 5 are drawn). */
  dunes: readonly { name: string; pct: number | null; level: Level }[]
  /** Returning: one star per server (the first 5 are drawn). */
  stars: readonly { name: string; issue: StarIssue | null; level: Level }[]
}

export type IntroJourney = 'first' | 'back' | 'daily' | 'nohosts'

/** How many stars and dunes the painting has room for. */
export const SLOTS = 5

export const STAGE_W = 1344
export const STAGE_H = 760

/** The painting's stars, in the order the board lists them. */
export const STARS: readonly (readonly [number, number])[] = [
  [318, 78],
  [938, 130],
  [436, 240],
  [175, 398],
  [60, 372],
  [475, 455],
]
export const MOON: readonly [number, number] = [1215, 80]

/** Returning: slot -> index into STARS. */
export const BACK_STAR_INDEX: readonly number[] = [0, 1, 5, 2, 3]
/** First launch: slot -> index into STARS (the glow order). */
export const FIRST_STAR_INDEX: readonly number[] = [0, 1, 2, 3, 5]

/** Label anchors (centre x, top y) per slot. */
export const BACK_LABELS: readonly (readonly [number, number])[] = [
  [318, 112],
  [938, 164],
  [475, 499],
  [436, 270],
  [175, 430],
]
export const FIRST_LABELS: readonly (readonly [number, number])[] = [
  [318, 110],
  [938, 162],
  [436, 272],
  [175, 430],
  [475, 499],
]

export const DUNE_X: readonly number[] = [210, 440, 672, 904, 1134]
export const DUNE_BASE = 640
export const DUNE_MAX_HEIGHT = 380

export const DUNE_COLOR: Readonly<Record<Level, string>> = {
  crit: '#D2436A',
  warn: '#B96C0B',
  ok: '#4F6BED',
  offline: '#A3A7B9',
}
export const STAR_TINT: Readonly<Record<Level, string>> = {
  warn: '#F08A24',
  ok: '#8FA2FF',
  crit: '#FF4F82',
  offline: '#8E91A3',
}
/** The dune label's value colour. */
export const DUNE_VALUE_COLOR: Readonly<Record<Level, string>> = {
  crit: '#5F6478',
  warn: '#8F5207',
  ok: '#5F6478',
  offline: '#5F6478',
}
export const FIRST_STAR_DOT = '#F2C94C'

/** The scene with at most `SLOTS` entries in each list, copied. */
export function clampScene(scene: IntroScene): IntroScene {
  return {
    hosts: scene.hosts.slice(0, SLOTS),
    issues: { ...scene.issues },
    dunes: scene.dunes.slice(0, SLOTS).map((d) => ({ ...d })),
    stars: scene.stars
      .slice(0, SLOTS)
      .map((s) => ({ ...s, issue: s.issue === null ? null : { ...s.issue } })),
  }
}

/** A server without a reading, or offline, gets a low dune of this height (percent). */
const NO_READING_PCT = 6

/** The height of a dune in stage pixels. */
export function duneHeight(pct: number | null): number {
  return (Math.min(100, Math.max(0, pct ?? NO_READING_PCT)) / 100) * DUNE_MAX_HEIGHT
}

/** Where a dune's label sits (centre x, top y). */
export function duneLabelAt(slot: number, pct: number | null): readonly [number, number] {
  return [DUNE_X[slot] ?? 0, DUNE_BASE - duneHeight(pct) - 30]
}
