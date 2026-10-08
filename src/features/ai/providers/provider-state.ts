// What a provider tile and a custom endpoint say, worked out from what the core answered.
// Pure functions: the screens and the tests share them.
import type { AiProviderEntry } from '@/api/bindings/AiProviderEntry'
import type { AiProvidersView } from '@/api/bindings/AiProvidersView'

export type Dot = 'ok' | 'accent' | 'off'
export type TileStatus =
  'connected' | 'keySaved' | 'addKey' | 'local' | 'noKey' | 'baseUrlKey' | 'cli'

/** The Claude Code profile is the one that goes through the CLI, not an HTTP adapter. */
export function isClaudeCode(entry: Pick<AiProviderEntry, 'profile'>): boolean {
  return entry.profile.kind === 'claude_cli'
}

/** The endpoint is the user's to give (a compatible server): the profile has none. */
export function needsBaseUrl(entry: AiProviderEntry): boolean {
  return entry.profile.kind === 'genai_adapter' && entry.profile.base_url === ''
}

/** Whether the provider can be used at all (a key where one is needed; Claude Code: accepted, found, signed in). */
export function isReady(entry: AiProviderEntry, view: AiProvidersView): boolean {
  if (isClaudeCode(entry)) {
    return view.claude_code_ack && view.claude_code.found && view.claude_code.logged_in
  }
  return !entry.profile.needs_key || entry.key_set
}

/** The active provider of the settings, once it is also usable: the one the dot calls connected. */
export function isActive(entry: AiProviderEntry, view: AiProvidersView): boolean {
  if (view.provider !== entry.profile.id) return false
  return !isClaudeCode(entry) || view.claude_code_ack
}

/** The dot colour and the one line under the name, by the board's rules. */
export function tileStatus(entry: AiProviderEntry, view: AiProvidersView): [Dot, TileStatus] {
  const active = isActive(entry, view)
  if (isClaudeCode(entry)) {
    return active && isReady(entry, view) ? ['ok', 'connected'] : ['off', 'cli']
  }
  if (entry.profile.needs_key) {
    if (!entry.key_set) return ['off', needsBaseUrl(entry) ? 'baseUrlKey' : 'addKey']
    return active ? ['ok', 'connected'] : ['accent', 'keySaved']
  }
  return active ? ['ok', 'local'] : ['off', 'noKey']
}

export type BaseUrlProblem = 'scheme' | 'invalid' | 'credentials'

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]']

/** The rule `ai_settings_set` applies: https, or http only to this Mac, and no login in the URL. */
export function checkBaseUrl(raw: string): BaseUrlProblem | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return 'invalid'
  }
  if (url.username || url.password) return 'credentials'
  if (url.protocol === 'https:') return null
  if (url.protocol === 'http:' && LOOPBACK.includes(url.hostname)) return null
  return 'scheme'
}

/** The host a test calls, for "Calling api.anthropic.com…". */
export function endpointHost(entry: AiProviderEntry, baseUrl: string | null): string {
  try {
    return new URL(baseUrl || entry.profile.base_url).host
  } catch {
    return entry.profile.name
  }
}

/** The letter of the tile: no vendor logo ships, so the row's own monogram stands in. */
export function markOf(entry: AiProviderEntry): string {
  return entry.profile.id === 'custom' ? '</>' : entry.profile.name.slice(0, 1).toUpperCase()
}
