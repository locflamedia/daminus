import { describe, expect, it } from 'vitest'
import type { HostEntry, LoginResult } from '@/api'
import type { TestChip } from './host-test'
import {
  type HostRowModel,
  type RowSources,
  buildRows,
  cardKind,
  filterRows,
  formatLatency,
  headerStatus,
  groupNames,
  knownGroups,
  latencyOf,
  netReason,
  permissionKey,
  segmentCounts,
  selectState,
  skipReasonKey,
  testCounts,
  testProgress,
} from './host-rows'

function entry(alias: string, over: Partial<NonNullable<HostEntry['resolved']>> = {}): HostEntry {
  return {
    host: { alias, file: '~/.ssh/config', line: 1 },
    resolved: {
      hostname: `${alias}.example`,
      user: 'deploy',
      port: 22,
      identity_files: ['~/.ssh/id_ed25519'],
      proxy_command: false,
      known_hosts_files: [],
      ...over,
    },
  }
}

const REACHED: LoginResult = {
  login: {
    os: 'Linux',
    kernel: '6.8',
    arch: 'x86_64',
    distro: 'Ubuntu 20.04.6 LTS',
    user: 'deploy',
    uid: 1001,
    root: false,
    docker_group: true,
    adm_group: false,
    journal_group: true,
    docker: 'ok',
    gnu_find: true,
  },
  paths: [],
}

function sources(over: Partial<Record<string, TestChip>> = {}, ticked: string[] = []): RowSources {
  return {
    isTicked: (a) => ticked.includes(a),
    chip: (a) => over[a] ?? 'queued',
    login: (a) => (over[a] === 'reached' ? REACHED : null),
    ms: () => 410,
  }
}

describe('buildRows', () => {
  it('shows a direct route, the user, the key name and no port for 22', () => {
    const [row] = buildRows([entry('a')], sources())
    expect(row).toMatchObject({
      alias: 'a',
      address: 'a.example',
      user: 'deploy',
      port: null,
      route: { kind: 'direct' },
      key: 'id_ed25519',
    })
  })

  it('keeps a port other than 22 and names the jump host of a proxy', () => {
    const [row] = buildRows([entry('a', { port: 2222, proxy_jump: 'bastion' })], sources())
    expect(row?.port).toBe(2222)
    expect(row?.route).toEqual({ kind: 'jump', via: 'bastion' })
  })

  it('has no user, address or key when the config could not be resolved', () => {
    const [row] = buildRows([{ host: entry('a').host, resolved: null }], sources())
    expect(row).toMatchObject({ address: '', user: null, key: null, identityFiles: [] })
  })

  it('waits for the login before it names the system, then shortens it and flags end of life', () => {
    const [waiting] = buildRows([entry('a')], sources())
    expect(waiting?.system).toEqual({ state: 'waiting' })
    const [reached] = buildRows([entry('a')], sources({ a: 'reached' }))
    expect(reached?.system).toEqual({ state: 'known', name: 'Ubuntu 20.04', eol: true })
    expect(reached?.ms).toBe(410)
  })

  it('says the system is unknown when the login failed', () => {
    const [row] = buildRows([entry('a')], sources({ a: 'key_rejected' }))
    expect(row?.system).toEqual({ state: 'unknown' })
    expect(row?.ms).toBeNull()
  })

  it('falls back to the kernel name when the host has no os-release', () => {
    const bare: LoginResult = {
      ...REACHED,
      login: REACHED.login ? { ...REACHED.login, distro: '' } : null,
    }
    const [row] = buildRows([entry('a')], {
      ...sources({ a: 'reached' }),
      login: () => bare,
    })
    expect(row?.system).toEqual({ state: 'known', name: 'Linux', eol: false })
  })
})

describe('filter, counts and selection', () => {
  const rows: HostRowModel[] = buildRows(
    [entry('vps-sg-1'), entry('db-main'), entry('staging')],
    sources({ 'vps-sg-1': 'reached', 'db-main': 'testing', staging: 'unreachable' }, [
      'vps-sg-1',
      'staging',
    ]),
  )

  it('matches the alias or the address, ignoring case', () => {
    expect(filterRows(rows, 'SG', 'all').map((r) => r.alias)).toEqual(['vps-sg-1'])
    expect(filterRows(rows, 'main.example', 'all').map((r) => r.alias)).toEqual(['db-main'])
    expect(filterRows(rows, '  ', 'all')).toHaveLength(3)
  })

  it('keeps ready or failed rows by segment, with the query', () => {
    expect(filterRows(rows, '', 'ready').map((r) => r.alias)).toEqual(['vps-sg-1'])
    expect(filterRows(rows, '', 'failed').map((r) => r.alias)).toEqual(['staging'])
    expect(filterRows(rows, 'db', 'failed')).toEqual([])
  })

  it('counts every row by segment', () => {
    expect(segmentCounts(rows)).toEqual({ all: 3, ready: 1, failed: 1 })
  })

  it('reports none, some or all ticked', () => {
    expect(selectState(rows)).toBe('some')
    expect(selectState(rows.map((r) => ({ ...r, ticked: true })))).toBe('all')
    expect(selectState(rows.map((r) => ({ ...r, ticked: false })))).toBe('none')
    expect(selectState([])).toBe('none')
  })
})

describe('footer and header counts', () => {
  const make = (chips: TestChip[]) =>
    buildRows(
      chips.map((_, i) => entry(`h${i}`)),
      sources(
        Object.fromEntries(chips.map((c, i) => [`h${i}`, c])),
        chips.map((_, i) => `h${i}`),
      ),
    )

  it('counts ready, failed and testing among the ticked, queued ones as testing', () => {
    const counts = testCounts(make(['reached', 'reached', 'unreachable', 'testing', 'queued']))
    expect(counts).toEqual({ ticked: 5, ready: 2, failed: 1, testing: 2, tested: 3 })
    expect(testProgress(counts)).toBeCloseTo(0.6)
  })

  it('has no progress when nothing is ticked', () => {
    expect(testProgress(testCounts([]))).toBe(0)
  })

  it('says how many tests are pending, then that all ended, and nothing when idle', () => {
    expect(headerStatus(testCounts(make(['reached', 'testing'])))).toEqual({
      kind: 'testing',
      pending: 1,
      total: 2,
    })
    expect(headerStatus(testCounts(make(['reached', 'timed_out'])))).toEqual({
      kind: 'done',
      total: 2,
    })
    expect(headerStatus(testCounts([]))).toEqual({ kind: 'idle' })
  })
})

describe('latency, cards and words', () => {
  it('draws three bars under a second, two above, and calls two seconds slow', () => {
    expect(latencyOf(380)).toEqual({ bars: 3, slow: false })
    expect(latencyOf(1120)).toEqual({ bars: 2, slow: false })
    expect(latencyOf(2640)).toEqual({ bars: 2, slow: true })
  })

  it('writes the wall time in seconds with two decimals, in the language', () => {
    expect(formatLatency(380, 'en')).toBe('0.38 s')
    expect(formatLatency(1120, 'en')).toBe('1.12 s')
    expect(formatLatency(410, 'vi')).toBe('0,41 s')
  })

  it('opens a card for each failure and none otherwise', () => {
    expect(cardKind('key_rejected')).toBe('key_rejected')
    expect(cardKind('host_key_unknown')).toBe('host_key_unknown')
    expect(cardKind('reached')).toBeNull()
    expect(cardKind('testing')).toBeNull()
  })

  it('names the network reason, other causes being the general one', () => {
    expect(netReason('dns')).toBe('dns')
    expect(netReason('connect_timeout')).toBe('other')
    expect(netReason(undefined)).toBe('other')
  })

  it('keys a permission row by its kind and answer', () => {
    expect(
      permissionKey({
        kind: 'docker',
        answer: 'no_permission',
        tone: 'warn',
        fix: null,
        missing: true,
      }),
    ).toBe('answer.docker.no_permission')
  })

  it('lists only the groups the login script asks about', () => {
    expect(knownGroups(REACHED.login!)).toEqual(['docker', 'systemd-journal'])
  })

  it('leads the groups line with the user, and is empty when no known group applies', () => {
    expect(groupNames(REACHED.login!)).toEqual(['deploy', 'docker', 'systemd-journal'])
    const none = { ...REACHED.login!, docker_group: false, adm_group: false, journal_group: false }
    expect(groupNames(none)).toEqual([])
  })

  it('keys the docker row by group membership', () => {
    expect(
      permissionKey({
        kind: 'docker',
        answer: 'ok',
        tone: 'ok',
        fix: null,
        missing: false,
        inGroup: true,
      }),
    ).toBe('answer.docker.ok_group')
  })

  it('maps each skip reason to a message key', () => {
    expect(skipReasonKey('wildcard')).toBe('wildcard')
    expect(skipReasonKey('no_host_name')).toBe('noHostName')
    expect(skipReasonKey('match')).toBe('match')
    expect(skipReasonKey('invalid_alias')).toBe('invalidAlias')
  })
})
