// The sampled painting: one dot per 6 px cell, read from the 1889 original. The file is a
// separate chunk (about 600 KB) that loads only when an intro is about to play.

export interface StarryData {
  /** Cell size in stage pixels. */
  cell: number
  cols: number
  rows: number
  /** Brightness per dot, 0..1, `cols * rows` entries. */
  z: readonly number[]
  /** Four numbers per dot: red, green, blue, brush angle in radians. */
  c: readonly number[]
  peaks: readonly (readonly number[])[]
}

/** True when the data has the arrays the intro reads, at the length its grid promises. */
export function isStarryData(value: unknown): value is StarryData {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<StarryData>
  if (typeof v.cell !== 'number' || typeof v.cols !== 'number' || typeof v.rows !== 'number') {
    return false
  }
  const n = v.cols * v.rows
  return Array.isArray(v.z) && Array.isArray(v.c) && v.z.length === n && v.c.length === n * 4
}

let pending: Promise<StarryData> | null = null

/** Loads the painting data once; later calls share the same promise. */
export function loadStarry(): Promise<StarryData> {
  pending ??= import('@/assets/intro/starry.json').then((m) => {
    const data: unknown = m.default
    if (!isStarryData(data)) throw new Error('the painting data is malformed')
    return data
  })
  return pending
}
