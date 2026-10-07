import { describe, expect, it } from 'vitest'
import { secItem } from '@/testing/security-items'
import { doFirst } from './security-first'
import {
  criticalFindings,
  cutList,
  foldedFindings,
  folderOf,
  securityFindings,
} from './security-findings'
import { NGINX_DENY_DOTFILES, scpCommand, shellQuote } from './security-commands'

const ctx = { roots: [{ host: 'vps-1', path: '/var/www/shop' }], seq: 12 }

const php = (n: number, total: number, extra = {}) =>
  secItem({
    check: 'sec.upload_php',
    target: `/var/www/shop/public/uploads/f${n}.php`,
    level: { level: 'crit' },
    value: 1,
    data: { size: 3100, mtime: 1_000 + n, total },
    delta: { kind: 'still', scans_open: 3 },
    ...extra,
  })

const exposed = secItem({
  check: 'url.exposed',
  target: 'https://shop.test',
  level: { level: 'crit' },
  value: 1,
  data: { exposed: true, matched_keys: ['/.env:APP_KEY', '/.env:DB_PASSWORD', '/.git/HEAD:ref'] },
  delta: { kind: 'new' },
})

describe('securityFindings', () => {
  it('gives one card per uploads folder, newest file first, titled with the true total', () => {
    const found = securityFindings([php(1, 137), php(2, 137), php(3, 137)], ctx)
    expect(found).toHaveLength(1)
    const f = found[0]!
    expect(f.title).toEqual({ key: 'uploadPhp', params: { n: 137 } })
    expect(f.evidence.kind === 'files' && f.evidence.files.map((x) => x.mtime)).toEqual([
      1003, 1002, 1001,
    ])
    expect(cutList(f.evidence)).toEqual({ listed: 3, total: 137 })
  })

  it('does not call a complete list cut', () => {
    const f = securityFindings([php(1, 1)], ctx)[0]!
    expect(cutList(f.evidence)).toBeNull()
  })

  it('splits findings of different project folders', () => {
    const other = php(9, 5, { host: 'vps-1', target: '/srv/other/uploads/x.php' })
    expect(securityFindings([php(1, 1), other], ctx)).toHaveLength(2)
    expect(folderOf(php(1, 1), ctx.roots)).toBe('/var/www/shop')
  })

  it('reads the first scan of a finding from how long it has been open', () => {
    const f = securityFindings([php(1, 1)], ctx)[0]!
    expect(f.firstSeq).toBe(10)
    expect(f.isNew).toBe(false)
    expect(securityFindings([exposed], ctx)[0]?.isNew).toBe(true)
  })

  it('keeps only key names of an exposed file, per file', () => {
    const f = securityFindings([exposed], ctx)[0]!
    expect(f.title).toEqual({ key: 'exposed', params: { file: '.env + .git' } })
    expect(f.evidence).toEqual({
      kind: 'exposed',
      url: 'https://shop.test',
      files: [
        { path: '/.env', keys: ['APP_KEY', 'DB_PASSWORD'] },
        { path: '/.git/HEAD', keys: ['ref'] },
      ],
    })
  })

  it('leaves clean results out and sorts critical before warnings', () => {
    const warn = secItem({
      check: 'sec.ports',
      target: '0.0.0.0:3306',
      level: { level: 'warn' },
      value: 1,
      data: { port: 3306, proc: 'mysqld' },
    })
    const clean = secItem({ check: 'sec.preload' })
    const all = securityFindings([warn, clean, exposed], ctx)
    expect(all.map((f) => f.check)).toEqual(['url.exposed', 'sec.ports'])
    expect(all[1]?.title).toEqual({ key: 'port3306' })
    expect(criticalFindings(all)).toHaveLength(1)
    expect(foldedFindings(all)).toHaveLength(1)
  })

  it('folds an expected critical finding instead of making it a card', () => {
    const exp = php(1, 1, { disposition: { kind: 'expected', rule: 'r1' } })
    const all = securityFindings([exp], ctx)
    expect(all[0]?.standing).toBe('expected')
    expect(all[0]?.ruleId).toBe('r1')
    expect(criticalFindings(all)).toHaveLength(0)
    expect(foldedFindings(all)).toHaveLength(1)
  })

  it('titles a certificate finding by its flag', () => {
    const tls = secItem({
      check: 'url.tls',
      target: 'https://api.shop.test',
      level: { level: 'crit' },
      value: -5,
      unit: 'days',
      data: { expired: true, untrusted: true },
    })
    expect(securityFindings([tls], ctx)[0]?.title).toEqual({
      key: 'tlsExpired',
      params: { host: 'api.shop.test' },
    })
  })
})

describe('doFirst', () => {
  it('is empty while nothing is critical', () => {
    expect(doFirst(securityFindings([secItem({ check: 'sec.preload' })], ctx))).toBeNull()
  })

  it('puts the uploaded PHP file ahead of the served .env and names what follows', () => {
    const step = doFirst(securityFindings([exposed, php(1, 1)], ctx))
    expect(step?.check).toBe('sec.upload_php')
    expect(step?.after).toEqual(['url.exposed'])
    expect(step?.file).toBe('f1.php')
    expect(step?.command).toContain('deny all')
  })

  it('puts a miner ahead of everything', () => {
    const miner = secItem({
      check: 'sec.miner',
      target: 'xmrig',
      level: { level: 'crit' },
      value: 1,
    })
    expect(doFirst(securityFindings([php(1, 1), exposed, miner], ctx))?.check).toBe('sec.miner')
  })

  it('ignores an expected finding', () => {
    const exp = php(1, 1, { disposition: { kind: 'expected', rule: 'r1' } })
    expect(doFirst(securityFindings([exp], ctx))).toBeNull()
  })
})

describe('commands', () => {
  it('quotes a path so it stays one word', () => {
    expect(shellQuote("a b'c")).toBe(`'a b'\\''c'`)
    expect(scpCommand('vps-1', '/var/www/a b.php')).toBe(`scp 'vps-1:/var/www/a b.php' .`)
  })

  it('refuses a host that is not a plain alias and a path with hidden characters', () => {
    expect(scpCommand('@local', '/a.php')).toBeNull()
    expect(scpCommand('x; reboot', '/a.php')).toBeNull()
    expect(scpCommand('vps-1', '/a‮.php')).toBeNull()
    expect(scpCommand('vps-1', 'relative.php')).toBeNull()
  })

  it('keeps well-known open in the dotfile rule', () => {
    expect(NGINX_DENY_DOTFILES).toContain('well-known')
  })
})
