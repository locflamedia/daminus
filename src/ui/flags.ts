// Flag artwork for the language select: 20 x 15 drawings of the flags the board shows. They
// are brand artwork like the project marks, so their colours are fixed and never follow the
// theme. Stars are computed, not typed, so every point is exact.
export type FlagCode = 'gb' | 'vn' | 'jp' | 'kr' | 'cn' | 'fr'

export interface FlagShape {
  /** Painted back to front. `d` is a path or polygon points; `kind` says which. */
  parts: Array<
    | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
    | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }
    | { kind: 'path'; d: string; fill?: string; stroke?: string; width?: number }
    | { kind: 'poly'; points: string; fill: string }
  >
}

/** Points of a five-pointed star, `rotation` in degrees (0 points straight up). */
export function star(cx: number, cy: number, outer: number, rotation = 0): string {
  const inner = outer * 0.382
  const points: string[] = []
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = ((rotation + i * 36 - 90) * Math.PI) / 180
    points.push(
      `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`,
    )
  }
  return points.join(' ')
}

const WHITE = '#ffffff'
const RED = '#c8102e'

/** The Taegeuk's four trigrams: three bars each, in the corners around the centre. */
function trigram(cx: number, cy: number, angle: number): FlagShape['parts'] {
  const bars: FlagShape['parts'] = []
  const rad = (angle * Math.PI) / 180
  for (const offset of [-1, 0, 1]) {
    // Bars sit across the diagonal axis; `offset` steps them along it.
    const along = offset * 1.1
    const x = cx + Math.cos(rad) * along
    const y = cy + Math.sin(rad) * along
    const dx = -Math.sin(rad) * 1.4
    const dy = Math.cos(rad) * 1.4
    bars.push({
      kind: 'path',
      d: `M${(x - dx).toFixed(2)} ${(y - dy).toFixed(2)}L${(x + dx).toFixed(2)} ${(y + dy).toFixed(2)}`,
      stroke: '#111111',
      width: 0.6,
    })
  }
  return bars
}

export const FLAGS: Record<FlagCode, FlagShape> = {
  gb: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: '#012169' },
      { kind: 'path', d: 'M0 0L20 15M20 0L0 15', stroke: WHITE, width: 3 },
      { kind: 'path', d: 'M0 0L20 15M20 0L0 15', stroke: RED, width: 1 },
      { kind: 'path', d: 'M10 0V15M0 7.5H20', stroke: WHITE, width: 5 },
      { kind: 'path', d: 'M10 0V15M0 7.5H20', stroke: RED, width: 3 },
    ],
  },
  vn: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: '#da251d' },
      { kind: 'poly', points: star(10, 8, 4.6), fill: '#ffff00' },
    ],
  },
  jp: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: WHITE },
      { kind: 'circle', cx: 10, cy: 7.5, r: 4.2, fill: '#bc002d' },
    ],
  },
  kr: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: WHITE },
      { kind: 'path', d: 'M6.6 7.5a3.4 3.4 0 0 1 6.8 0z', fill: '#cd2e3a' },
      { kind: 'path', d: 'M13.4 7.5a3.4 3.4 0 0 1-6.8 0z', fill: '#0047a0' },
      ...trigram(3.6, 3.2, 35),
      ...trigram(16.4, 3.2, -35),
      ...trigram(3.6, 11.8, -35),
      ...trigram(16.4, 11.8, 35),
    ],
  },
  cn: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: '#de2910' },
      { kind: 'poly', points: star(4, 4, 2.6), fill: '#ffde00' },
      { kind: 'poly', points: star(8, 1.7, 0.9, 20), fill: '#ffde00' },
      { kind: 'poly', points: star(9.6, 3.6, 0.9, 40), fill: '#ffde00' },
      { kind: 'poly', points: star(9.6, 6, 0.9, 20), fill: '#ffde00' },
      { kind: 'poly', points: star(8, 7.7, 0.9, 0), fill: '#ffde00' },
    ],
  },
  fr: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 6.67, h: 15, fill: '#0055a4' },
      { kind: 'rect', x: 6.67, y: 0, w: 6.66, h: 15, fill: WHITE },
      { kind: 'rect', x: 13.33, y: 0, w: 6.67, h: 15, fill: '#ef4135' },
    ],
  },
}

export function isFlagCode(value: string): value is FlagCode {
  return value in FLAGS
}
