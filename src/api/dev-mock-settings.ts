// Development only: answers the settings commands in a plain browser. It keeps one copy of
// the file in memory and refuses what the core refuses (an unknown language), so the
// screens can be seen and used without the app.
import type { AppearanceSettings } from './bindings/AppearanceSettings'
import type { GeneralSettings } from './bindings/GeneralSettings'
import type { Settings } from './bindings/Settings'

const LANGUAGES = ['en', 'vi']

function initial(): Settings {
  return {
    version: 1,
    general: { language: 'en', ai_language: null, scan_on_open: false, intro: 'first_launch' },
    appearance: {
      theme: 'system',
      reduce_transparency: false,
      animate_charts: true,
      clear_sky: true,
      streak_badge: true,
      completion_chime: false,
      easter_eggs: true,
    },
    scan: {
      disabled_groups: ['code_changes'],
      skip_paths: ['node_modules', 'vendor'],
      large_file_mb: 50,
      connect_timeout_s: 10,
      hosts_at_once: null,
      thresholds: [],
    },
    ai: { provider: null, model: null, claude_code_acknowledged: false },
    data: { keep_scans: 20, forget_ai_after_days: 30 },
  }
}

let current = initial()

/** Back to the defaults, for a test that starts from a fresh file. */
export function resetSettingsMock(): void {
  current = initial()
}

function refusal(field: string) {
  return { code: { kind: 'schema_invalid' }, params: { detail: field }, retryable: false }
}

/** The answer for `cmd`, or `undefined` when it is not a settings command. */
export function settingsAnswer(cmd: string, args: Record<string, unknown>): unknown {
  if (cmd === 'settings_get') return structuredClone(current)
  if (cmd === 'settings_set_general') {
    const general = args.general as GeneralSettings
    if (!LANGUAGES.includes(general.language)) throw refusal('general.language')
    if (general.ai_language !== null && !LANGUAGES.includes(general.ai_language)) {
      throw refusal('general.ai_language')
    }
    current = { ...current, general: { ...general } }
    return structuredClone(current)
  }
  if (cmd === 'settings_set_appearance') {
    current = { ...current, appearance: { ...(args.appearance as AppearanceSettings) } }
    return structuredClone(current)
  }
  return undefined
}
