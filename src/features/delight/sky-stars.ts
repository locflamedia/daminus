// Where the painting's own stars sit in the sky crop (`assets/delight/starry-sky.jpg`, the
// full 1920 px painting scaled to 1440 px wide, its top 705 rows). Centres are those of
// the intro's star list, as fractions of the crop, so a glow lands on the real star at any size.
export const SKY_ASPECT = 1440 / 705

/** Centres in the 1920 x 1520 painting that fall inside the crop (its top 940 rows). */
const CENTRES: readonly (readonly [number, number])[] = [
  [204, 69],
  [445, 52],
  [661, 59],
  [790, 98],
  [1167, 132],
  [454, 263],
  [1355, 353],
  [625, 496],
]

export interface SkyStar {
  /** 0 to 1 across the crop. */
  x: number
  /** 0 to 1 down the crop. */
  y: number
  /** Twinkle delay, 70 ms apart. */
  delayMs: number
}

export const SKY_STARS: readonly SkyStar[] = CENTRES.map(([x, y], i) => ({
  x: x / 1920,
  y: y / 940,
  delayMs: i * 70,
}))

/** How long the sky stays, fade included. */
export const SKY_MS = 1800
