// The text laid over the painting: where each label sits and what it says, from the scene.
import {
  BACK_LABELS,
  DUNE_COLOR,
  DUNE_VALUE_COLOR,
  FIRST_LABELS,
  FIRST_STAR_DOT,
  SLOTS,
  duneLabelAt,
} from './scene'
import type { IntroScene } from './scene'

export interface DuneLabel {
  x: number
  y: number
  name: string
  /** A percentage, or null for "offline". */
  pct: number | null
  dot: string
  valueColor: string
}

export interface StarLabel {
  x: number
  y: number
  text: string
  dot: string
}

export function duneLabels(scene: IntroScene): DuneLabel[] {
  return scene.dunes.slice(0, SLOTS).map((d, slot) => {
    const [x, y] = duneLabelAt(slot, d.pct)
    const offline = d.level === 'offline' || d.pct === null
    return {
      x,
      y,
      name: d.name,
      pct: offline ? null : Math.round(d.pct ?? 0),
      dot: DUNE_COLOR[d.level],
      valueColor: DUNE_VALUE_COLOR[d.level],
    }
  })
}

/** Returning: the star's name, then what is wrong with it. */
export function backStarLabels(scene: IntroScene): StarLabel[] {
  return scene.stars.slice(0, SLOTS).map((s, slot) => {
    const [x, y] = BACK_LABELS[slot] ?? [0, 0]
    return {
      x,
      y,
      text: s.label === '' ? s.name : `${s.name} · ${s.label}`,
      dot: DUNE_COLOR[s.level],
    }
  })
}

/** First launch: one label per host, in plain yellow. */
export function firstStarLabels(scene: IntroScene): StarLabel[] {
  return scene.hosts.slice(0, SLOTS).map((name, slot) => {
    const [x, y] = FIRST_LABELS[slot] ?? [0, 0]
    return { x, y, text: name, dot: FIRST_STAR_DOT }
  })
}
