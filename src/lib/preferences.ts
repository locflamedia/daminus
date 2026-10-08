// What the Settings › General and › Appearance sections keep (`settings.json`), as the webview
// uses it before the core has answered, and the two switches that act on the whole window.
import type { AppearanceSettings, GeneralSettings } from '@/api'

export const DEFAULT_GENERAL: GeneralSettings = {
  language: 'en',
  ai_language: null,
  scan_on_open: false,
  intro: 'first_launch',
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'system',
  reduce_transparency: false,
  animate_charts: true,
  clear_sky: true,
  streak_badge: true,
  completion_chime: false,
  easter_eggs: true,
}

/** The on/off choices of Appearance (everything but the theme). */
export type AppearanceFlag = Exclude<keyof AppearanceSettings, 'theme'>

/**
 * Reduce transparency and Animate charts reach the stylesheets as attributes on the root
 * element (`styles/preferences.css`), so no component has to ask.
 */
export function applyAppearance(
  appearance: AppearanceSettings,
  root: HTMLElement = document.documentElement,
): void {
  if (appearance.reduce_transparency) root.dataset.transparency = 'reduced'
  else delete root.dataset.transparency
  if (appearance.animate_charts) delete root.dataset.charts
  else root.dataset.charts = 'still'
}

const FLAGS: readonly AppearanceFlag[] = [
  'reduce_transparency',
  'animate_charts',
  'clear_sky',
  'streak_badge',
  'completion_chime',
  'easter_eggs',
]

/** The flags of a saved copy that are booleans; any other field keeps its default. */
export function readFlags(raw: unknown): Partial<Record<AppearanceFlag, boolean>> {
  const out: Partial<Record<AppearanceFlag, boolean>> = {}
  if (typeof raw !== 'object' || raw === null) return out
  const record = raw as Record<string, unknown>
  for (const flag of FLAGS) {
    const value = record[flag]
    if (typeof value === 'boolean') out[flag] = value
  }
  return out
}
