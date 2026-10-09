// The intro as a pure function of time: `renderAt(t)` paints the backdrop layer and the dust
// layer for second `t` and nothing else, so the same `t` always gives the same picture.
import { drawBackdrop } from './backdrop'
import { createDustRenderer, frameState } from './dust'
import type { DustFrame } from './dust'
import { buildTimeline, overlayOn } from './journeys'
import type { Timeline } from './journeys'
import { FIRST_STAR_INDEX, SLOTS, STAGE_H, STAGE_W, STARS } from './scene'
import type { IntroJourney, IntroScene } from './scene'
import type { Layout, StationName } from './stations'

/** The dust layer is drawn at twice the stage size. */
export const FG_SCALE = 2

const GLOW_RADIUS = 46

export interface EngineOptions {
  layout: Layout
  journey: IntroJourney
  scene: IntroScene
  bg: CanvasRenderingContext2D
  fg: CanvasRenderingContext2D
  grain: CanvasImageSource
  /** The app icon tile, or null while it has not loaded. */
  logo: CanvasImageSource | null
  /** Seconds after which the storyboard loops; the app leaves it out. */
  loopLength?: number
}

export interface IntroEngine {
  timeline: Timeline
  duration: number
  /** Number of stars that light up on the first launch's painting. */
  litStars: number
  renderAt(t: number): DustFrame
  /** The stations whose text layer is visible at `t`. */
  overlaysAt(t: number): StationName[]
}

const OVERLAYS: readonly StationName[] = [
  'storm',
  'mark',
  'six',
  'dunes',
  'paintBack',
  'paintFirst',
]

/** Stars that light on the first-launch painting: one per host, none when nothing was found. */
export function litStarCount(journey: IntroJourney, scene: IntroScene): number {
  return journey === 'nohosts' ? 0 : Math.min(SLOTS, scene.hosts.length)
}

/** How far the logo has appeared (0..1): it fades in once the mark has formed, out as the D flies off. */
export function logoAlpha(f: DustFrame, t: number, seg: { start: number; len: number }): number {
  const first = f.segment === 0
  if (f.station === 'mark' && (f.held || first)) {
    return Math.min(1, (t - (first ? 0 : seg.start + seg.len)) / 0.35)
  }
  if (f.from === 'mark' && f.station !== 'mark') {
    return Math.max(0, 1 - (t - seg.start) / (seg.len * 0.3))
  }
  return 0
}

/** How far star number `h` has lit, `since` seconds after the painting settled. */
export function starGlow(since: number, h: number): number {
  return Math.min(1, Math.max(0, (since - h * 0.35) / 0.4))
}

function drawLogo(ctx: CanvasRenderingContext2D, o: EngineOptions, alpha: number): void {
  if (alpha <= 0 || o.logo === null) return
  const box = o.layout.logoBox
  ctx.globalAlpha = alpha
  ctx.shadowColor = 'rgba(14,27,77,.28)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 14
  ctx.drawImage(o.logo, box.x, box.y, box.s, box.s)
  ctx.shadowColor = 'transparent'
  ctx.globalAlpha = 1
}

function drawGlows(ctx: CanvasRenderingContext2D, since: number, lit: number): void {
  for (let h = 0; h < lit; h++) {
    const star = STARS[FIRST_STAR_INDEX[h] ?? 0] ?? [0, 0]
    const on = starGlow(since, h)
    if (!on) continue
    const gr = ctx.createRadialGradient(star[0], star[1], 0, star[0], star[1], GLOW_RADIUS)
    gr.addColorStop(0, `rgba(255,236,160,${0.75 * on})`)
    gr.addColorStop(1, 'rgba(255,236,160,0)')
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.arc(star[0], star[1], GLOW_RADIUS, 0, 6.283)
    ctx.fill()
  }
}

export function createIntroEngine(o: EngineOptions): IntroEngine {
  const timeline = buildTimeline(o.journey)
  const dust = createDustRenderer(o.layout)
  const litStars = litStarCount(o.journey, o.scene)
  const loopLength = o.loopLength ?? null

  const renderAt = (t: number): DustFrame => {
    drawBackdrop(o.bg, t, 1, o.grain)
    o.fg.clearRect(0, 0, STAGE_W * FG_SCALE, STAGE_H * FG_SCALE)
    const f = frameState(timeline, t, loopLength)
    const seg = timeline.segments[f.segment]
    dust.draw(o.fg, timeline, t, FG_SCALE, f)
    if (seg === undefined) return f
    o.fg.save()
    o.fg.scale(FG_SCALE, FG_SCALE)
    drawLogo(o.fg, o, logoAlpha(f, t, seg) * f.fadeIn * f.fadeOut)
    if (f.station === 'paintFirst' && f.held) drawGlows(o.fg, t - seg.start - seg.len, litStars)
    o.fg.restore()
    return f
  }

  const overlaysAt = (t: number): StationName[] => {
    const f = frameState(timeline, t, null)
    return OVERLAYS.filter((key) => overlayOn(key, f.station, f.p))
  }

  return { timeline, duration: timeline.duration, litStars, renderAt, overlaysAt }
}
