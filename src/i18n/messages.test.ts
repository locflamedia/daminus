import { describe, expect, it } from 'vitest'
import type { AppError } from '@/api'
import { checkManifest } from '@/lib/check-manifest'
import type { TestChip } from '@/lib/host-test'
import { DEFAULT_LOCALE, LOCALES, localeFromTag } from './index'
import { messages as bundled, withParts } from './messages'

type Tree = { [key: string]: string | Tree }

/** Every leaf as `a.b.c` -> message. */
function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of leaves(value, path)) out.set(k, v)
  }
  return out
}

/** The `{name}` placeholders of a message. */
function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? ''))].sort()
}

const messages: Record<(typeof LOCALES)[number], Map<string, string>> = {
  en: leaves(bundled.en),
  vi: leaves(bundled.vi),
}

describe('message parts', () => {
  it('refuse a key that the shared messages or another part already hold', () => {
    expect(() => withParts({ a: 'x' }, { './parts/one.en.json': { a: 'y' } })).toThrow(
      /already taken/,
    )
    expect(() =>
      withParts({}, { './parts/one.en.json': { b: 'x' }, './parts/two.en.json': { b: 'y' } }),
    ).toThrow(/already taken/)
    expect(withParts({ a: 'x' }, { './parts/one.en.json': { b: 'y' } })).toEqual({ a: 'x', b: 'y' })
  })
})

describe('locale files', () => {
  it('have the same keys in English and Vietnamese', () => {
    const enKeys = [...messages.en.keys()].sort()
    const viKeys = [...messages.vi.keys()].sort()
    expect(viKeys).toEqual(enKeys)
  })

  it('use the same placeholders for the same key', () => {
    for (const [key, message] of messages.en) {
      expect(placeholders(messages.vi.get(key) ?? ''), key).toEqual(placeholders(message))
    }
  })

  it('have no empty message', () => {
    for (const locale of LOCALES) {
      for (const [key, message] of messages[locale]) {
        expect(message.trim(), `${locale}:${key}`).not.toBe('')
      }
    }
  })

  it('avoid the characters vue-i18n reads as syntax, except the plural bar and placeholders', () => {
    for (const locale of LOCALES) {
      for (const [key, message] of messages[locale]) {
        expect(message, `${locale}:${key}`).not.toMatch(/[@$]/)
        expect(message.replace(/\{\w+\}/g, ''), `${locale}:${key}`).not.toMatch(/[{}]/)
      }
    }
  })

  it('name and describe every check in the manifest', () => {
    for (const check of checkManifest.checks) {
      for (const locale of LOCALES) {
        expect(
          messages[locale].get(`checks.${check.id}.name`),
          `${locale}:${check.id}`,
        ).toBeTruthy()
        expect(
          messages[locale].get(`checks.${check.id}.desc`),
          `${locale}:${check.id}`,
        ).toBeTruthy()
      }
    }
  })

  it('have a sentence for every check an issue can lead with', () => {
    for (const check of checkManifest.checks) {
      for (const locale of LOCALES) {
        expect(messages[locale].get(`issue.${check.id}`), `${locale}:${check.id}`).toBeTruthy()
      }
    }
  })

  it('word every login chip, with its tooltip, in both languages', () => {
    // A Record over the type: a new chip cannot reach the screen without its words.
    const chips: Record<TestChip, true> = {
      not_checked: true,
      untested: true,
      queued: true,
      connecting: true,
      agent_wait: true,
      testing: true,
      reached: true,
      host_key_unknown: true,
      host_key_changed: true,
      key_rejected: true,
      unreachable: true,
      timed_out: true,
    }
    for (const locale of LOCALES) {
      for (const chip of Object.keys(chips)) {
        expect(messages[locale].get(`setupPick.tip.${chip}`), `${locale}:tip.${chip}`).toBeTruthy()
      }
    }
  })

  it('word every error code the core can send', () => {
    // A Record over the generated type: the build fails when the core gains a code that is
    // missing here, so a new code cannot reach the UI without a sentence in both languages.
    const known: Record<AppError['code']['kind'], true> = {
      ssh_auth: true,
      ssh_host_key_unknown: true,
      ssh_host_key_changed: true,
      ssh_unreachable: true,
      timeout: true,
      scan_in_progress: true,
      nothing_to_scan: true,
      local_network_down: true,
      scan_not_found: true,
      config_invalid: true,
      ssh_config_invalid: true,
      config_from_newer_version: true,
      config_changed_on_disk: true,
      store_busy: true,
      io: true,
      secret_access_denied: true,
      provider_auth: true,
      provider_rate_limit: true,
      provider_unavailable: true,
      schema_invalid: true,
      cancelled: true,
      claude_cli_not_found: true,
      claude_cli_not_logged_in: true,
      claude_cli_quota: true,
      internal: true,
    }
    for (const locale of LOCALES) {
      for (const code of Object.keys(known)) {
        expect(messages[locale].get(`error.${code}`), code).toBeTruthy()
      }
    }
  })
})

describe('localeFromTag', () => {
  it('keeps Vietnamese and falls back to English', () => {
    expect(localeFromTag('vi')).toBe('vi')
    expect(localeFromTag('vi-VN')).toBe('vi')
    expect(localeFromTag('en-GB')).toBe(DEFAULT_LOCALE)
    expect(localeFromTag('fr')).toBe(DEFAULT_LOCALE)
    expect(localeFromTag(undefined)).toBe(DEFAULT_LOCALE)
  })
})
