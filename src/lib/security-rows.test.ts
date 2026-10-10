import { describe, expect, it } from 'vitest'
import { secItem } from '@/testing/security-items'
import { securityRow, securityRowItems, securityRows, severityMix } from './security-rows'

const uploads = (path: string, total: number, extra = {}) =>
  secItem({
    check: 'sec.upload_php',
    target: path,
    level: { level: 'crit' },
    value: 1,
    data: { size: 100, mtime: 1_000, total },
    ...extra,
  })

describe('securityRows', () => {
  it('lists all nine checks in the board order, also when nothing was reported', () => {
    const rows = securityRows([], [], 12, 'en')
    expect(rows.map((r) => r.id)).toEqual([
      'sec.miner',
      'sec.preload',
      'sec.tmp_exec',
      'sec.upload_php',
      'sec.ports',
      'sec.recent_change',
      'url.http',
      'url.tls',
      'url.exposed',
    ])
    expect(rows.every((r) => r.state === 'none')).toBe(true)
  })

  it('marks the checks of a group switched off in Settings', () => {
    const rows = securityRows([], ['code_changes', 'uptime'], 12, 'en')
    expect(rows.filter((r) => r.state === 'off').map((r) => r.id)).toEqual([
      'sec.recent_change',
      'url.http',
      'url.tls',
    ])
  })

  it('says how far a miner check got when it could not see every process', () => {
    const miner = secItem({
      check: 'sec.miner',
      level: { level: 'unknown', reason: 'needs_perm' },
      data: { seen: 41, total: 212 },
      unknown: 'needs_perm',
    })
    const row = securityRow('sec.miner', [miner], [], 12, 'en')
    expect(row.state).toBe('needs_perm')
    expect(row.strong).toEqual({ key: 'seenOf', params: { seen: 41, total: 212 } })
    expect(row.value).toEqual({ key: 'needsPermission' })
  })

  it('keeps a found miner critical and carries the partial count with it', () => {
    const miner = secItem({
      check: 'sec.miner',
      target: 'xmrig',
      level: { level: 'crit' },
      value: 1,
      data: { seen: 41, total: 212 },
    })
    const row = securityRow('sec.miner', [miner], [], 12, 'en')
    expect(row.state).toBe('crit')
    expect(row.value).toEqual({
      key: 'minerFoundPartial',
      params: { name: 'xmrig', seen: 41, total: 212 },
    })
  })

  it('never writes none for an ok miner result that did not see every process', () => {
    const miner = secItem({
      check: 'sec.miner',
      level: { level: 'ok' },
      value: 0,
      data: { seen: 41, total: 212 },
    })
    const row = securityRow('sec.miner', [miner], [], 12, 'en')
    expect(row.state).toBe('needs_perm')
    expect(row.strong).toEqual({ key: 'seenOf', params: { seen: 41, total: 212 } })
    expect(row.value).toEqual({ key: 'needsPermission' })
  })

  it('writes none with the coverage only when the check saw every process', () => {
    const miner = secItem({ check: 'sec.miner', data: { seen: 212, total: 212 } })
    expect(securityRow('sec.miner', [miner], [], 12, 'en').value).toEqual({
      key: 'noneSeen',
      params: { seen: 212, total: 212 },
    })
  })

  it('counts the true total of uploaded PHP files, not the listed ones', () => {
    const list = [uploads('/srv/a/uploads/1.php', 137), uploads('/srv/a/uploads/2.php', 137)]
    const row = securityRow('sec.upload_php', list, [], 12, 'en')
    expect(row.value).toEqual({ key: 'files', params: { n: 137 } })
  })

  it('counts a found file whose fact has no value, only the folder total, as the check sends it', () => {
    const file = uploads('/var/www/shop/public/uploads/avatar.php', 1, { value: null })
    const clean = secItem({ check: 'sec.upload_php', target: '/srv/api', value: 0 })
    const row = securityRow('sec.upload_php', [clean, file], [], 12, 'en')
    expect(row.state).toBe('crit')
    expect(row.value).toEqual({ key: 'files', params: { n: 1 } })
  })

  it('counts the temp-folder total once per host, wherever the files sit', () => {
    const tmp = (path: string) =>
      secItem({
        check: 'sec.tmp_exec',
        target: path,
        level: { level: 'crit' },
        value: null,
        data: { size: 10, mtime: 1_000, total: 2 },
      })
    const row = securityRow('sec.tmp_exec', [tmp('/tmp/a/x'), tmp('/dev/shm/b/y')], [], 12, 'en')
    expect(row.value).toEqual({ key: 'files', params: { n: 2 } })
  })

  it('adds the totals of separate project folders', () => {
    const list = [uploads('/srv/a/uploads/1.php', 3), uploads('/srv/b/uploads/1.php', 4)]
    expect(securityRow('sec.upload_php', list, [], 12, 'en').value?.params).toEqual({ n: 7 })
  })

  it('shows an expected result as expected and not as a finding', () => {
    const exp = uploads('/srv/a/uploads/index.php', 1, {
      disposition: { kind: 'expected', rule: 'r1' },
    })
    const row = securityRow('sec.upload_php', [exp], [], 12, 'en')
    expect(row.state).toBe('expected')
    expect(row.expected).toBe(1)
  })

  it('keeps the active critical result ahead of an expected one', () => {
    const exp = uploads('/srv/a/uploads/index.php', 1, {
      disposition: { kind: 'expected', rule: 'r1' },
    })
    const live = uploads('/srv/a/uploads/x.php', 2)
    expect(securityRow('sec.upload_php', [exp, live], [], 12, 'en').state).toBe('crit')
  })

  it('reports the scan a stale result was last checked in', () => {
    const stale = secItem({
      check: 'sec.preload',
      disposition: { kind: 'stale', since_seq: 9 },
    })
    expect(securityRow('sec.preload', [stale], [], 12, 'en').staleSince).toBe(9)
  })

  it('names the served file of an exposed result and never a value', () => {
    const exposed = secItem({
      check: 'url.exposed',
      target: 'https://shop.test',
      level: { level: 'crit' },
      value: 1,
      data: { exposed: true, matched_keys: ['/.env:APP_KEY', '/.env:DB_PASSWORD'] },
    })
    expect(securityRow('url.exposed', [exposed], [], 12, 'en').value).toEqual({
      key: 'served',
      params: { file: '/.env' },
    })
  })

  it('chooses the certificate with the fewest days left for the chip', () => {
    const a = secItem({ check: 'url.tls', target: 'https://a.test', value: 60 })
    const b = secItem({
      check: 'url.tls',
      target: 'https://b.test',
      value: 12,
      level: { level: 'warn' },
    })
    const row = securityRow('url.tls', [a, b], [], 12, 'en')
    expect(row.state).toBe('warn')
    expect(row.tls?.key.target).toBe('https://b.test')
    expect(row.more).toBe(1)
  })

  it('counts the mix over the checks that answered', () => {
    const rows = securityRows(
      [
        uploads('/srv/a/uploads/1.php', 1),
        secItem({ check: 'sec.preload' }),
        secItem({
          check: 'sec.ports',
          level: { level: 'warn' },
          value: 1,
          target: '0.0.0.0:3306',
          data: { port: 3306 },
        }),
      ],
      [],
      12,
      'en',
    )
    expect(severityMix(rows)).toEqual({ crit: 1, warn: 1, info: 0, ok: 1 })
  })
})

describe('securityRowItems', () => {
  const onServer = (host: string) => ({
    ...secItem({ check: 'sec.miner', host, data: { seen: 80, total: 80 } }),
    owner: { kind: 'server' as const, host },
  })

  it('keeps the results of a shared host, so its clean checks do not read as never run', () => {
    const own = secItem({ check: 'sec.upload_php', project: 'shop', host: 'vps-1' })
    const other = secItem({ check: 'sec.upload_php', project: 'api', host: 'vps-1' })
    const items = securityRowItems([own, other, onServer('vps-1'), onServer('vps-9')], 'shop', [
      'vps-1',
    ])
    expect(items.map((i) => `${i.key.check}@${i.key.host}`)).toEqual([
      'sec.upload_php@vps-1',
      'sec.miner@vps-1',
    ])
    expect(securityRow('sec.miner', items, [], 12, 'en').state).toBe('ok')
  })
})
