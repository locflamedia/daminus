// Development only: answers the settings commands in a plain browser. It keeps one copy of
// the file in memory and refuses what the core refuses (an unknown language), so the
// screens can be seen and used without the app.
import type { AppearanceSettings } from './bindings/AppearanceSettings'
import type { AiSettings } from './bindings/AiSettings'
import type { DataSettings } from './bindings/DataSettings'
import { aiSettingsRefusal } from './dev-mock-ai'
import { dataAnswer } from './dev-mock-data'
import type { GeneralSettings } from './bindings/GeneralSettings'
import type { ScanSettings } from './bindings/ScanSettings'
import type { Settings } from './bindings/Settings'

const LANGUAGES = ['en', 'vi']
const CONNECT_TIMEOUTS = [5, 10, 30]

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
      skip_paths: [
        'node_modules',
        'vendor',
        'storage/framework/cache',
        '.next/cache',
        '/proc',
        '/var/lib/docker/overlay2',
      ],
      large_file_mb: 50,
      connect_timeout_s: 10,
      hosts_at_once: null,
      thresholds: [],
    },
    ai: { provider: null, model: null, claude_code_acknowledged: false, base_url: null },
    data: { keep_scans: 20, forget_ai_after_days: 30 },
  }
}

let current = initial()
let excluded: string[] = []

/** Back to the defaults, for a test that starts from a fresh file. */
export function resetSettingsMock(): void {
  current = initial()
  excluded = []
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
  if (cmd === 'settings_set_scan') {
    const scan = args.scan as ScanSettings
    if (!CONNECT_TIMEOUTS.includes(scan.connect_timeout_s)) throw refusal('scan.connect_timeout_s')
    if (scan.skip_paths.some((p) => p === '' || p.startsWith('-'))) throw refusal('scan.skip_paths')
    current = { ...current, scan: structuredClone(scan) }
    return structuredClone(current)
  }
  if (cmd === 'settings_set_data') {
    const data = args.data as DataSettings
    if (data.keep_scans === 0) throw refusal('data.keep_scans')
    if (data.forget_ai_after_days === 0) throw refusal('data.forget_ai_after_days')
    current = { ...current, data: { ...data } }
    return structuredClone(current)
  }
  if (cmd === 'ai_settings_set') {
    const ai = args.ai as AiSettings
    const refused = aiSettingsRefusal(ai)
    if (refused) throw refusal(refused)
    current = { ...current, ai: { ...ai } }
    return structuredClone(current)
  }
  if (cmd === 'settings_reset') {
    current = initial()
    return structuredClone(current)
  }
  if (cmd === 'hosts_excluded') return [...excluded]
  if (cmd === 'hosts_set_include') {
    const host = String(args.host)
    excluded = args.include ? excluded.filter((h) => h !== host) : [...new Set([...excluded, host])]
    return [...excluded]
  }
  return dataAnswer(cmd)
}
