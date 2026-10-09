import { beforeAll, describe, expect, it } from 'vitest'
import { createIntroEngine, litStarCount, logoAlpha, starGlow } from './engine'
import { JOURNEYS, buildTimeline, ease, framePicks, overlayOn, where } from './journeys'
import { coverPlacement } from './layout'
import { recordingContext } from './fake-canvas'
import type { MaskFn } from './sampling'
import { STAGE_H, STAGE_W, SLOTS } from './scene'
import type { IntroScene, StarIssue } from './scene'
import { buildLayout } from './stations'
import type { Layout } from './stations'
import { loadStarry } from './starry'
import { backStarLabels, duneLabels } from './labels'

const SCENE: IntroScene = {
  hosts: ['vps-sg-1', 'vps-sg-2', 'vps-hn-3', 'db-main', 'staging'],
  issues: { crit: 2, warn: 3, disk: 1 },
  dunes: [
    { name: 'vps-sg-2', pct: 87, level: 'warn' },
    { name: 'vps-sg-1', pct: 64, level: 'ok' },
    { name: 'vps-hn-3', pct: 52, level: 'crit' },
    { name: 'db-main', pct: 41, level: 'ok' },
    { name: 'legacy-shop', pct: null, level: 'offline' },
  ],
  stars: [
    { name: 'vps-sg-2', issue: { kind: 'disk', pct: 87 }, level: 'warn' },
    { name: 'vps-sg-1', issue: null, level: 'ok' },
    { name: 'vps-hn-3', issue: { kind: 'crit', count: 2 }, level: 'crit' },
    { name: 'db-main', issue: null, level: 'ok' },
    { name: 'legacy-shop', issue: null, level: 'offline' },
  ],
}

/** A block of painted pixels, whatever is drawn. */
const blockMask: MaskFn = () => {
  const alpha = new Uint8Array(STAGE_W * STAGE_H)
  for (let y = 100; y < 600; y++) alpha.fill(255, y * STAGE_W + 100, y * STAGE_W + 1200)
  return alpha
}

let layout: Layout
/** Checksums of the drawn commands, taken before the renderer was tuned; they must not move. */

beforeAll(async () => {
  layout = buildLayout(await loadStarry(), SCENE, blockMask)
}, 60_000)

function engineFor(journey: keyof typeof JOURNEYS, scene = SCENE) {
  const bg = recordingContext()
  const fg = recordingContext()
  const engine = createIntroEngine({
    layout,
    journey,
    scene,
    bg: bg.ctx,
    fg: fg.ctx,
    grain: {} as CanvasImageSource,
    logo: {} as CanvasImageSource,
  })
  return { engine, bg, fg }
}

describe('stations', () => {
  it('gives every particle a place in every station', () => {
    expect(layout.n).toBe(28448)
    for (const station of Object.values(layout.stations)) {
      expect(station.data.length).toBe(28448 * 9)
      let unplaced = 0
      for (let i = 0; i < layout.n; i++) if (!((station.data[i * 9 + 2] ?? 0) > 0)) unplaced++
      expect(unplaced).toBe(0)
    }
  })

  it('uses no particle twice for one target', () => {
    const counts = { mark: 4200, six: 4800, dunes: 5200 } as const
    for (const [name, count] of Object.entries(counts)) {
      const assigned = layout.stations[name as keyof typeof counts].assigned
      expect(assigned?.length).toBe(count)
      expect(new Set(assigned).size).toBe(count)
    }
  })
})

describe('renderAt', () => {
  it('draws the same picture for the same second', () => {
    const { engine, bg, fg } = engineFor('back')
    // The grain pattern is made on the first frame only; every other command repeats.
    const drawn = () => [
      bg.log.filter((l) => !l.startsWith('createPattern')).join('|'),
      fg.log.join('|'),
    ]
    engine.renderAt(4.4)
    const first = drawn()
    bg.log.length = 0
    fg.log.length = 0
    engine.renderAt(1.1)
    bg.log.length = 0
    fg.log.length = 0
    engine.renderAt(4.4)
    expect(drawn()).toEqual(first)
    expect(first[1]?.length).toBeGreaterThan(1000)
  })

  it('makes the grain pattern once per context', () => {
    const { engine, bg } = engineFor('daily')
    engine.renderAt(0.5)
    engine.renderAt(1)
    engine.renderAt(1.5)
    expect(bg.log.filter((l) => l.startsWith('createPattern'))).toHaveLength(1)
  })

  it('gives a second engine the same picture', () => {
    const a = engineFor('first')
    const b = engineFor('first')
    a.engine.renderAt(6)
    b.engine.renderAt(6)
    expect(a.fg.log.join('|')).toBe(b.fg.log.join('|'))
    expect(a.bg.log.join('|')).toBe(b.bg.log.join('|'))
  })

  it('lights stars only once the painting has settled, one per host', () => {
    const glows = (journey: 'first' | 'nohosts', t: number) => {
      const { engine, fg } = engineFor(journey)
      engine.renderAt(t)
      return fg.log.filter((l) => l.startsWith('createRadialGradient')).length
    }
    expect(glows('first', 3)).toBe(0)
    expect(glows('first', 8.5)).toBe(5)
    expect(glows('nohosts', 7)).toBe(0)
  })
})

describe('journeys', () => {
  const span = (journey: keyof typeof JOURNEYS) =>
    buildTimeline(journey).segments.map((s) => [s.st, s.start, s.len, s.end])

  it('runs the first launch as the board does', () => {
    expect(span('first')).toEqual([
      ['storm', 0, 0.9, 1.3],
      ['mark', 1.3, 0.8, 3.5],
      ['paintFirst', 3.5, 1.4, 8.5],
    ])
    expect(buildTimeline('first').duration).toBeCloseTo(8.5)
  })

  it('runs the returning journey as the board does', () => {
    expect(span('back').map((s) => [s[0], Math.round((s[1] as number) * 10) / 10])).toEqual([
      ['mark', 0],
      ['six', 1.9],
      ['dunes', 3.6],
      ['paintBack', 5.3],
    ])
    expect(buildTimeline('back').duration).toBeCloseTo(9.8)
  })

  it('shows the mark alone every day, and skips the stars when no host was found', () => {
    expect(buildTimeline('daily').duration).toBeCloseTo(1.5)
    expect(buildTimeline('daily').segments.map((s) => s.st)).toEqual(['mark'])
    expect(buildTimeline('nohosts').duration).toBeCloseTo(7)
    expect(litStarCount('nohosts', SCENE)).toBe(0)
    expect(litStarCount('first', SCENE)).toBe(5)
  })

  it('finds the segment of a second', () => {
    const tl = buildTimeline('back')
    expect(where(tl, -1).k).toBe(0)
    expect(where(tl, 1.9).seg.st).toBe('six')
    expect(where(tl, 1.9).prev.st).toBe('mark')
    expect(where(tl, 99).seg.st).toBe('paintBack')
  })

  it('picks storyboard frames just after each travel', () => {
    const picks = framePicks(buildTimeline('first'))
    expect(picks.map((p) => p.name)).toEqual(['Storm', 'Mark', 'Starry Night'])
    expect(picks[0]?.t).toBeCloseTo(0.9 + 0.24)
    expect(picks[2]?.t).toBeCloseTo(3.5 + 1.4 + 0.6)
  })

  it('shows each text layer by the board rules', () => {
    expect(overlayOn('storm', 'storm', 0)).toBe(true)
    expect(overlayOn('mark', 'mark', 0.7)).toBe(false)
    expect(overlayOn('mark', 'mark', 0.8)).toBe(true)
    expect(overlayOn('mark', 'six', 0.2)).toBe(true)
    expect(overlayOn('mark', 'six', 0.4)).toBe(false)
    expect(overlayOn('six', 'six', 0.8)).toBe(true)
    expect(engineFor('first').engine.overlaysAt(8)).toEqual(['paintFirst'])
  })

  it('eases in and out and ends at 1', () => {
    expect(ease(0)).toBe(0)
    expect(ease(0.5)).toBe(0.5)
    expect(ease(1)).toBe(1)
  })

  it('shows the logo once the mark has formed and dissolves it as the D leaves', () => {
    const f = (
      st: 'mark' | 'paintFirst',
      from: 'storm' | 'mark',
      segment: number,
      held: boolean,
    ) => ({
      station: st,
      from,
      segment,
      held,
      p: 0,
      fadeIn: 1,
      fadeOut: 1,
    })
    expect(logoAlpha(f('mark', 'storm', 1, false), 2, { start: 1.3, len: 0.8 })).toBe(0)
    expect(logoAlpha(f('mark', 'storm', 1, true), 2.275, { start: 1.3, len: 0.8 })).toBeCloseTo(0.5)
    expect(logoAlpha(f('paintFirst', 'mark', 2, false), 3.5, { start: 3.5, len: 1.4 })).toBe(1)
    expect(
      logoAlpha(f('paintFirst', 'mark', 2, false), 3.5 + 1.4 * 0.3, { start: 3.5, len: 1.4 }),
    ).toBeCloseTo(0)
  })

  it('lights star h from h * 0.35 s over 0.4 s', () => {
    expect(starGlow(0, 0)).toBe(0)
    expect(starGlow(0.2, 0)).toBeCloseTo(0.5)
    expect(starGlow(0.35, 1)).toBe(0)
    expect(starGlow(5, 4)).toBe(1)
  })
})

const say = (i: StarIssue): string =>
  i.kind === 'disk' ? `disk ${i.pct}%` : `${i.count} ${i.kind === 'crit' ? 'critical' : 'warning'}`

describe('labels', () => {
  it('draws one label per slot and no more than five', () => {
    const many = {
      ...SCENE,
      dunes: [...SCENE.dunes, ...SCENE.dunes],
      stars: [...SCENE.stars, ...SCENE.stars],
    }
    expect(duneLabels(many)).toHaveLength(SLOTS)
    expect(backStarLabels(many, say)).toHaveLength(SLOTS)
    expect(duneLabels({ ...SCENE, dunes: SCENE.dunes.slice(0, 2) })).toHaveLength(2)
  })

  it('places a dune label 30 px above its peak', () => {
    const [first, , , , last] = duneLabels(SCENE)
    expect(first?.x).toBe(210)
    expect(first?.y).toBeCloseTo(279.4)
    expect(last?.pct).toBeNull()
  })

  it('names a star and what is wrong with it', () => {
    expect(backStarLabels(SCENE, say).map((s) => s.text)).toEqual([
      'vps-sg-2 · disk 87%',
      'vps-sg-1',
      'vps-hn-3 · 2 critical',
      'db-main',
      'legacy-shop',
    ])
  })
})

describe('coverPlacement', () => {
  it('scales to cover and centres', () => {
    expect(coverPlacement(1344, 760)).toEqual({ scale: 1, x: 0, y: 0 })
    const wide = coverPlacement(2688, 760)
    expect(wide.scale).toBe(2)
    expect(wide.y).toBe((760 - 1520) / 2)
    const tall = coverPlacement(672, 1520)
    expect(tall.scale).toBe(2)
    expect(tall.x).toBe((672 - 2688) / 2)
  })
})
