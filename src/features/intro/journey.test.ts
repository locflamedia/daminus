import { describe, expect, it } from 'vitest'
import type { IntroMode, LaunchKind } from '@/api'
import { chooseJourney, devIntro } from './journey'

describe('chooseJourney', () => {
  const table: [LaunchKind, IntroMode, number | null, string | null][] = [
    ['first', 'first_launch', 3, 'first'],
    ['first', 'always', 3, 'first'],
    ['first', 'never', 3, null],
    ['first', 'first_launch', 0, 'nohosts'],
    ['first', 'always', 0, 'nohosts'],
    ['first', 'never', 0, null],
    ['first', 'first_launch', null, 'first'],
    ['returning', 'first_launch', 4, null],
    ['returning', 'always', 4, 'back'],
    ['returning', 'always', 0, 'back'],
    ['returning', 'never', 4, null],
    ['daily', 'first_launch', 4, null],
    ['daily', 'always', 4, 'daily'],
    ['daily', 'never', 4, null],
  ]
  it.each(table)('%s + %s + %s hosts -> %s', (kind, mode, hosts, expected) => {
    expect(chooseJourney(kind, mode, hosts)).toBe(expected)
  })
})

describe('devIntro', () => {
  it('reads the three switches', () => {
    expect(devIntro('?mock&introJourney=back&introT=2.5&introReduce=1')).toEqual({
      journey: 'back',
      freezeAt: 2.5,
      reduce: true,
    })
  })
  it('ignores what it does not know', () => {
    expect(devIntro('?introJourney=nope&introT=x')).toEqual({
      journey: null,
      freezeAt: undefined,
      reduce: false,
    })
  })
})
