import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setI18nLocale } from '@/i18n'
import type { Change } from '@/lib/overview-changes'
import type { Upcoming } from '@/lib/overview-coming-up'
import { changeRow, upcomingRow } from './overview-list-text'

beforeEach(() => setI18nLocale('en'))
afterEach(() => setI18nLocale('en'))

const base = { id: 'x', owner: 'tiemtra', check: '', target: '' }

describe('changeRow', () => {
  it('writes growth as owner, what grew and the signed size', () => {
    const row = changeRow({
      ...base,
      kind: 'grew',
      tone: 'warn',
      check: 'disk.path',
      target: '/srv/web',
      bytes: 440 * 1024 * 1024,
    })
    expect(row).toMatchObject({ glyph: '▲', text: 'tiemtra · /srv/web', value: '+440 MB' })
  })

  it('writes a table that grew inside its database owner', () => {
    const row = changeRow({
      ...base,
      kind: 'table',
      tone: 'warn',
      check: 'db.size',
      target: 'orders',
      bytes: 1024,
    })
    expect(row.text).toBe('tiemtra · orders table')
  })

  it('writes an image move with both tags, and no owner', () => {
    const row = changeRow({
      ...base,
      kind: 'image',
      tone: 'info',
      target: 'tiemtra-api',
      from: '1.4.2',
      to: '1.5.0',
    })
    expect(row).toMatchObject({ glyph: '↻', text: 'tiemtra-api image', value: '1.4.2 → 1.5.0' })
  })

  it('writes a new critical result with the issue sentence and a rose bang', () => {
    const change: Change = {
      ...base,
      kind: 'new',
      tone: 'crit',
      owner: 'kho-hang',
      check: 'url.exposed',
      target: 'https://khohang.vn/.env',
      issue: {
        key: { host: '@local', check: 'url.exposed', target: 'https://khohang.vn/.env' },
        severity: { level: 'crit' },
        params: { target: 'https://khohang.vn/.env' },
      },
    }
    expect(changeRow(change)).toMatchObject({
      glyph: '!',
      text: 'kho-hang · https://khohang.vn/.env serves a private file',
      value: 'new',
    })
  })

  it('writes host and certificate news', () => {
    expect(
      changeRow({
        ...base,
        kind: 'renewed',
        tone: 'ok',
        check: 'url.tls',
        target: 'https://api.tiemtra.vn',
        days: 74,
      }),
    ).toMatchObject({
      text: 'api.tiemtra.vn TLS renewed',
      value: '74 d',
    })
    expect(changeRow({ ...base, kind: 'online', tone: 'ok', owner: 'legacy-shop' })).toMatchObject({
      text: 'legacy-shop back online',
      value: 'up',
    })
  })

  it('follows the language', () => {
    setI18nLocale('vi')
    expect(changeRow({ ...base, kind: 'offline', tone: 'warn', owner: 'db-main' }).text).toBe(
      'db-main không phản hồi',
    )
  })

  it('names why a host stopped being scanned when the network was fine', () => {
    const gone = { ...base, kind: 'offline' as const, tone: 'warn' as const, owner: 'db-main' }
    expect(changeRow({ ...gone, cause: 'key_refused' }).text).toBe('db-main · Key refused')
    expect(changeRow({ ...gone, cause: 'unreachable' }).text).toBe('db-main is not answering')
    setI18nLocale('vi')
    expect(changeRow({ ...gone, cause: 'not_in_config' }).text).toBe(
      'db-main · Không có trong ~/.ssh/config',
    )
  })
})

describe('upcomingRow', () => {
  const row = (partial: Partial<Upcoming>): Upcoming => ({
    id: 'u',
    kind: 'disk',
    tone: 'warn',
    subject: 'vps-sg-2',
    days: 9,
    ...partial,
  })

  it('names why a quiet host could not be scanned', () => {
    expect(
      upcomingRow(row({ kind: 'quiet', tone: 'neutral', cause: 'host_key_changed' })).text,
    ).toBe('vps-sg-2 · Host key changed')
    expect(upcomingRow(row({ kind: 'quiet', tone: 'neutral', cause: 'unreachable' })).text).toBe(
      'vps-sg-2 unreachable',
    )
  })

  it('words each kind and its distance', () => {
    expect(upcomingRow(row({}))).toMatchObject({
      text: 'vps-sg-2 disk reaches 90%',
      value: 'in ≈ 9 days',
    })
    expect(upcomingRow(row({ kind: 'review', subject: 'booking', days: 3 }))).toMatchObject({
      text: 'Expected rule review · booking',
      value: 'in 3 days',
    })
    expect(upcomingRow(row({ kind: 'review', days: 0 })).value).toBe('today')
    expect(upcomingRow(row({ kind: 'quiet', subject: 'legacy-shop', days: 3 }))).toMatchObject({
      text: 'legacy-shop unreachable',
      value: 'for 3 days',
    })
    expect(upcomingRow(row({ kind: 'tls', subject: 'api.tiemtra.vn', days: 74 })).value).toBe(
      '74 days',
    )
  })

  it('says a day in the singular, and nothing for an unknown distance', () => {
    expect(upcomingRow(row({ kind: 'quiet', days: 1 })).value).toBe('for 1 day')
    expect(upcomingRow(row({ kind: 'quiet', days: null })).value).toBe('')
  })
})
