// The rules every small delight moment obeys: its own setting is on, nothing is critical
// (they stay quiet when things are wrong) and, for the ones that move, Reduce Motion is off.

export interface GateInput {
  /** The Appearance switch of this moment. */
  setting: boolean
  /** Any project is critical in the latest report. */
  hasCritical: boolean
  reduceMotion: boolean
}

/** A moment that moves: needs its switch, a calm report and no Reduce Motion. */
export function shouldPlay({ setting, hasCritical, reduceMotion }: GateInput): boolean {
  return setting && !hasCritical && !reduceMotion
}

/** A moment that has a still final state (the streak badge): Reduce Motion only drops the motion. */
export function shouldShow({ setting, hasCritical }: Omit<GateInput, 'reduceMotion'>): boolean {
  return setting && !hasCritical
}

/** A sound is not motion: it needs its switch and a calm report. */
export function shouldChime(input: Omit<GateInput, 'reduceMotion'>): boolean {
  return shouldShow(input)
}

export type DelightDev = 'sky' | 'streak' | 'complete' | 'lines'
const DEV: readonly string[] = ['sky', 'streak', 'complete', 'lines']

/** The development switch `?delight=sky|streak|complete|lines`; `&delightHold=1` freezes the end state. */
export function devDelight(
  search: string,
  dev: boolean,
): { kind: DelightDev | null; hold: boolean } {
  if (!dev) return { kind: null, hold: false }
  const q = new URLSearchParams(search)
  const kind = q.get('delight')
  return {
    kind: kind !== null && DEV.includes(kind) ? (kind as DelightDev) : null,
    hold: q.get('delightHold') === '1',
  }
}

export function currentDev(): { kind: DelightDev | null; hold: boolean } {
  return devDelight(typeof location === 'undefined' ? '' : location.search, import.meta.env.DEV)
}
