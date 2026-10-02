import { describe, expect, it } from 'vitest'
import { checkManifest } from '@/lib/check-manifest'
import en from './en.json'
import { DEFAULT_LOCALE, LOCALES, localeFromTag } from './index'
import vi from './vi.json'

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
  en: leaves(en as Tree),
  vi: leaves(vi as Tree),
}

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

  it('word every error code the core can send', () => {
    const codes = [
      'ssh_auth',
      'ssh_host_key_unknown',
      'ssh_host_key_changed',
      'ssh_unreachable',
      'timeout',
      'scan_in_progress',
      'nothing_to_scan',
      'local_network_down',
      'config_invalid',
      'config_from_newer_version',
      'config_changed_on_disk',
      'store_busy',
      'io',
      'secret_access_denied',
      'provider_auth',
      'provider_rate_limit',
      'provider_unavailable',
      'schema_invalid',
      'internal',
    ]
    for (const locale of LOCALES) {
      for (const code of codes) expect(messages[locale].get(`error.${code}`), code).toBeTruthy()
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
