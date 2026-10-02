// The named colours of the charts, each a token (so light and dark switch with the theme).
// A chart takes a key, never a colour, so nothing in the data decides how it looks.
export type ChartColor =
  | 'accent'
  | 'accent-70'
  | 'lilac'
  | 'lilac-soft'
  | 'blush'
  | 'blush-soft'
  | 'grey'
  | 'grey-soft'
  | 'amber'
  | 'rose'
  | 'ok'
  | 'bar-old'
  | 'issue-crit'
  | 'issue-warn'
  | 'issue-info'
  | 'strip-ok'
  | 'strip-warn'
  | 'strip-crit'
  | 'strip-none'
  | 'heat-ok'
  | 'heat-warn'
  | 'heat-crit'
  | 'heat-none'
  | 'ink-4'

export const COLOR_VAR: Record<ChartColor, string> = {
  accent: 'var(--accent)',
  'accent-70': 'var(--chart-accent-70)',
  lilac: 'var(--chart-lilac)',
  'lilac-soft': 'var(--chart-lilac-soft)',
  blush: 'var(--chart-blush)',
  'blush-soft': 'var(--wash-3)',
  grey: 'var(--chart-grey)',
  'grey-soft': 'var(--chart-grey-soft)',
  amber: 'var(--chart-amber)',
  rose: 'var(--crit-solid)',
  ok: 'var(--ok-solid)',
  'bar-old': 'var(--chart-bar-old)',
  'issue-crit': 'var(--crit-solid)',
  'issue-warn': 'var(--chart-issue-warn)',
  'issue-info': 'var(--chart-issue-info)',
  'strip-ok': 'var(--strip-ok)',
  'strip-warn': 'var(--strip-warn)',
  'strip-crit': 'var(--strip-crit)',
  'strip-none': 'var(--strip-none)',
  'heat-ok': 'var(--heat-ok)',
  'heat-warn': 'var(--heat-warn)',
  'heat-crit': 'var(--heat-crit)',
  'heat-none': 'var(--heat-none)',
  'ink-4': 'var(--ink-4)',
}

/** The fixed ramp of a stacked bar: accent, accent 70, lilac, blush, grey for "other". */
export const STACK_RAMP: ChartColor[] = ['accent', 'accent-70', 'lilac-soft', 'blush-soft']
export const STACK_OTHER: ChartColor = 'grey-soft'
