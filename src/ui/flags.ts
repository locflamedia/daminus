// Flag artwork for the language select: 20 x 15 drawings, the same ones the canvas draws as
// inline SVG (English is the UK flag). They are brand artwork like the project marks, so their
// colours are fixed and never follow the theme.
export type FlagCode = 'gb' | 'vn' | 'jp' | 'kr' | 'cn' | 'fr'

export interface FlagShape {
  /** Painted back to front. `d` is a path, `points` a polygon. */
  parts: Array<
    | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
    | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }
    | { kind: 'path'; d: string; fill?: string; stroke?: string; width?: number }
    | { kind: 'poly'; points: string; fill: string }
  >
}

const WHITE = '#ffffff'
const RED = '#c8102e'
const BANNER_RED = '#de2910'
const GOLD = '#ffde00'

/** A five-pointed star as the canvas lists its points, so every vertex is exact. */
const starPoly = (points: string): FlagShape['parts'][number] => ({
  kind: 'poly',
  points,
  fill: GOLD,
})

export const FLAGS: Record<FlagCode, FlagShape> = {
  gb: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: '#012169' },
      { kind: 'path', d: 'M0 0l20 15M20 0L0 15', stroke: WHITE, width: 3 },
      { kind: 'path', d: 'M0 0l20 15M20 0L0 15', stroke: RED, width: 1.1 },
      { kind: 'path', d: 'M10 0v15M0 7.5h20', stroke: WHITE, width: 5 },
      { kind: 'path', d: 'M10 0v15M0 7.5h20', stroke: RED, width: 3 },
    ],
  },
  vn: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: '#da251d' },
      {
        kind: 'poly',
        points:
          '10.00,3.20 11.08,6.31 14.37,6.38 11.75,8.37 12.70,11.52 10.00,9.64 7.30,11.52 8.25,8.37 5.63,6.38 8.92,6.31',
        fill: '#ffcd00',
      },
    ],
  },
  jp: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: WHITE },
      { kind: 'circle', cx: 10, cy: 7.5, r: 4.4, fill: '#bc002d' },
    ],
  },
  kr: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: WHITE },
      { kind: 'circle', cx: 10, cy: 7.5, r: 3.6, fill: '#0047a0' },
      {
        kind: 'path',
        d: 'M6.4 7.5a3.6 3.6 0 0 1 7.2 0a1.8 1.8 0 0 1-3.6 0a1.8 1.8 0 0 0-3.6 0z',
        fill: '#cd2e3a',
      },
      {
        kind: 'path',
        d: 'M2.2 2.6l1.6-1.2M2.8 3.4l1.6-1.2M3.4 4.2l1.6-1.2M15 1.4l1.6 1.2M15.6 .6l1.6 1.2M16.2 13.6l1.6-1.2M15.6 12.8l1.6-1.2M2.2 12.4l1.6 1.2M2.8 11.6l1.6 1.2',
        stroke: '#1b1d2a',
        width: 0.55,
      },
    ],
  },
  cn: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: BANNER_RED },
      starPoly(
        '4.60,1.60 5.26,3.49 7.26,3.53 5.67,4.75 6.25,6.67 4.60,5.52 2.95,6.67 3.53,4.75 1.94,3.53 3.94,3.49',
      ),
      starPoly(
        '8.60,1.10 8.79,1.64 9.36,1.65 8.90,2.00 9.07,2.55 8.60,2.22 8.13,2.55 8.30,2.00 7.84,1.65 8.41,1.64',
      ),
      starPoly(
        '10.00,2.80 10.19,3.34 10.76,3.35 10.30,3.70 10.47,4.25 10.00,3.92 9.53,4.25 9.70,3.70 9.24,3.35 9.81,3.34',
      ),
      starPoly(
        '10.00,5.10 10.19,5.64 10.76,5.65 10.30,6.00 10.47,6.55 10.00,6.22 9.53,6.55 9.70,6.00 9.24,5.65 9.81,5.64',
      ),
      starPoly(
        '8.60,6.80 8.79,7.34 9.36,7.35 8.90,7.70 9.07,8.25 8.60,7.92 8.13,8.25 8.30,7.70 7.84,7.35 8.41,7.34',
      ),
    ],
  },
  fr: {
    parts: [
      { kind: 'rect', x: 0, y: 0, w: 20, h: 15, fill: WHITE },
      { kind: 'rect', x: 0, y: 0, w: 6.67, h: 15, fill: '#002395' },
      { kind: 'rect', x: 13.33, y: 0, w: 6.67, h: 15, fill: '#ed2939' },
    ],
  },
}

export function isFlagCode(value: string): value is FlagCode {
  return value in FLAGS
}
