// Which journey a launch plays, from the launch kind, the `general.intro` setting and how many
// hosts the ssh config has (`null` when the list could not be read).
import type { IntroMode, LaunchKind } from '@/api'
import type { IntroJourney } from './scene'

export function chooseJourney(
  kind: LaunchKind,
  mode: IntroMode,
  hostCount: number | null,
): IntroJourney | null {
  if (mode === 'never') return null
  if (kind === 'first') return hostCount === 0 ? 'nohosts' : 'first'
  if (mode !== 'always') return null
  return kind === 'returning' ? 'back' : 'daily'
}

export interface DevIntro {
  journey: IntroJourney | null
  freezeAt: number | undefined
  reduce: boolean
}

const JOURNEYS: readonly string[] = ['first', 'back', 'daily', 'nohosts']

/** The development query switches: `introJourney`, `introT` (freeze, seconds), `introReduce`. */
export function devIntro(search: string): DevIntro {
  const q = new URLSearchParams(search)
  const j = q.get('introJourney')
  const t = q.get('introT')
  const seconds = t === null || t === '' ? Number.NaN : Number(t)
  return {
    journey: j !== null && JOURNEYS.includes(j) ? (j as IntroJourney) : null,
    freezeAt: Number.isFinite(seconds) ? seconds : undefined,
    reduce: q.get('introReduce') === '1',
  }
}
