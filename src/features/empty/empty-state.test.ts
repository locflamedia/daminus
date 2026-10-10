import { describe, expect, it } from 'vitest'
import type { AgentState, HostEntry, SkippedHost } from '@/api'
import {
  agentOk,
  configState,
  emptyScreen,
  helpView,
  previewRows,
  previewSkips,
  shownRows,
  type EmptyInput,
} from './empty-state'

const SKIPPED: SkippedHost[] = [
  { pattern: '*', reason: 'wildcard', file: '~/.ssh/config', line: 1 },
  { pattern: 'Match host *.corp', reason: 'match', file: '~/.ssh/config', line: 6 },
  { pattern: 'bastion', reason: 'no_host_name', file: 'config.d/jump', line: 2 },
  { pattern: 'my server', reason: 'invalid_alias', file: '~/.ssh/config', line: 19 },
]

function input(over: Partial<EmptyInput> = {}): EmptyInput {
  return {
    configFound: true,
    emptyReason: null,
    hosts: 3,
    skipped: [],
    agent: 'keys',
    keys: 2,
    ...over,
  }
}

const NO_CONFIG = { configFound: false, emptyReason: 'no_config', hosts: 0 } as const
const NO_USABLE = {
  configFound: true,
  emptyReason: 'no_usable_hosts',
  hosts: 0,
  skipped: SKIPPED,
} as const

describe('configState', () => {
  it('tells a missing file from a file with nothing usable from a file with hosts', () => {
    expect(configState(input(NO_CONFIG))).toBe('missing')
    expect(configState(input(NO_USABLE))).toBe('unusable')
    expect(configState(input())).toBe('ok')
  })

  it('does not trust a config with no host even when no reason came with it', () => {
    expect(configState(input({ hosts: 0 }))).toBe('unusable')
    expect(configState(input({ configFound: false, hosts: 0 }))).toBe('missing')
  })
})

describe('emptyScreen', () => {
  const configs = {
    ok: {},
    missing: NO_CONFIG,
    unusable: NO_USABLE,
  } as const
  const agents: AgentState[] = ['keys', 'empty', 'unavailable']

  for (const [config, over] of Object.entries(configs)) {
    for (const agent of agents) {
      const help = config !== 'ok' || agent !== 'keys'
      it(`config ${config} and agent ${agent} show the ${help ? 'help' : 'first'} screen`, () => {
        expect(emptyScreen(input({ ...over, agent }))).toBe(help ? 'help' : 'app')
      })
    }
  }

  it('does not blame an agent it could not ask', () => {
    expect(agentOk(null)).toBe(true)
    expect(emptyScreen(input({ agent: null }))).toBe('app')
  })
})

describe('helpView', () => {
  const view = (
    over: Partial<EmptyInput>,
    before = null as ReturnType<typeof shownRows> | null,
  ) => {
    const i = input(over)
    return helpView(i, shownRows(i, before))
  }

  it('cause A with an empty agent: both rows and all three steps, the no-config headline', () => {
    const v = view({ ...NO_CONFIG, agent: 'empty', keys: 0 })
    expect(v.headline).toBe('noConfig')
    expect(v.rows).toEqual({ config: true, agent: true })
    expect(v.steps).toEqual({ key: true, agent: true, block: 'describe' })
    expect(v.stepCount).toBe(3)
    expect(v.leftOut).toEqual([])
    expect(v.canImport).toBe(false)
  })

  it('cause B says no host is usable, lists what was left out and asks for a Host block with a HostName', () => {
    const v = view({ ...NO_USABLE, agent: 'empty', keys: 0 })
    expect(v.headline).toBe('noUsableHosts')
    expect(v.config).toBe('unusable')
    expect(v.entries).toBe(4)
    expect(v.leftOut).toEqual([
      { name: '*', reason: 'wildcard', where: '~/.ssh/config:1' },
      { name: 'Match host *.corp', reason: 'match', where: '~/.ssh/config:6' },
      { name: 'bastion', reason: 'no_host_name', where: 'config.d/jump:2' },
      { name: 'my server', reason: 'invalid_alias', where: '~/.ssh/config:19' },
    ])
    expect(v.steps).toEqual({ key: true, agent: true, block: 'add' })
  })

  it('only the config is missing: its row and its step, not the agent ones', () => {
    const v = view(NO_CONFIG)
    expect(v.rows).toEqual({ config: true, agent: false })
    expect(v.steps).toEqual({ key: false, agent: false, block: 'describe' })
    expect(v.stepCount).toBe(1)
  })

  it('only the agent is empty: its row and its two steps, not the Host block', () => {
    const v = view({ agent: 'empty', keys: 0 })
    expect(v.headline).toBe('agent')
    expect(v.rows).toEqual({ config: false, agent: true })
    expect(v.steps).toEqual({ key: true, agent: true, block: null })
    expect(v.stepCount).toBe(2)
  })

  it('draws the agent row and steps when no agent runs at all', () => {
    const v = view({ agent: 'unavailable', keys: 0 })
    expect(v.agent).toBe('unavailable')
    expect(v.rows.agent).toBe(true)
  })

  it('turns Import on only when the config has a host and the agent a key', () => {
    expect(view({ ...NO_CONFIG, agent: 'empty' }).canImport).toBe(false)
    expect(view({ agent: 'empty' }).canImport).toBe(false)
    expect(view(NO_CONFIG).canImport).toBe(false)
    expect(view({ hosts: 1 }).canImport).toBe(true)
  })

  it('keeps a row that was missing once Check again finds it, now green', () => {
    const before = shownRows(input({ ...NO_CONFIG, agent: 'empty' }), null)
    const found = input({ hosts: 1, agent: 'keys', keys: 1 })
    const v = helpView(found, shownRows(found, before))
    expect(v.rows).toEqual({ config: true, agent: true })
    expect(v.config).toBe('ok')
    expect(v.agent).toBe('keys')
    // Both rows green: the headline says it is ready, and every step reads Done.
    expect(v.headline).toBe('ready')
    expect(v.done).toEqual({ key: true, agent: true, block: true })
    expect(v.stepsLeft).toBe(0)
    expect(v.canImport).toBe(true)
  })

  it('names the step left once the key is loaded and the config is still missing', () => {
    const before = shownRows(input({ ...NO_CONFIG, agent: 'empty', termiusInstalled: true }), null)
    const keyed = input({ ...NO_CONFIG, agent: 'keys', keys: 1, termiusInstalled: true })
    const v = helpView(keyed, shownRows(keyed, before))
    expect(v.headline).toBe('keyLoaded')
    expect(v.rows.agent).toBe(true)
    expect(v.done).toEqual({ key: true, agent: true, block: false })
    expect(v.stepsLeft).toBe(1)
    expect(v.canImport).toBe(false)
  })

  it('marks nothing done while every row is still missing', () => {
    const v = view({ ...NO_CONFIG, agent: 'empty', keys: 0, termiusInstalled: true })
    expect(v.done).toEqual({ key: false, agent: false, block: false })
    expect(v.stepsLeft).toBe(3)
  })

  it('moves the headline from cause A to cause B while the config is still the problem', () => {
    const before = shownRows(input(NO_CONFIG), null)
    const next = input(NO_USABLE)
    expect(shownRows(next, before).headline).toBe('noUsableHosts')
  })
})

describe('previewRows', () => {
  const entry = (alias: string, resolved: HostEntry['resolved']): HostEntry => ({
    host: { alias, file: '~/.ssh/config', line: 1 },
    resolved,
  })

  it('reads the name, address, user and key file name of each host', () => {
    const rows = previewRows([
      entry('vps-sg-1', {
        hostname: '203.0.113.14',
        user: 'root',
        port: 22,
        identity_files: ['~/.ssh/id_ed25519'],
        proxy_command: false,
        known_hosts_files: [],
      }),
    ])
    expect(rows).toEqual([
      { alias: 'vps-sg-1', hostName: '203.0.113.14', user: 'root', key: 'id_ed25519' },
    ])
  })

  it('falls back to the alias, no user and no key when ssh resolved nothing', () => {
    expect(previewRows([entry('lab', null)])).toEqual([
      { alias: 'lab', hostName: 'lab', user: null, key: null },
    ])
  })
})

describe('previewSkips', () => {
  it('explains a git forge as a git remote, and leaves patterns and Match blocks out', () => {
    expect(
      previewSkips([
        { pattern: 'github.com', reason: 'no_host_name', file: 'f', line: 3 },
        { pattern: '*', reason: 'wildcard', file: 'f', line: 1 },
        { pattern: 'Match host x', reason: 'match', file: 'f', line: 2 },
        { pattern: 'bastion', reason: 'no_host_name', file: 'f', line: 4 },
        { pattern: 'my server', reason: 'invalid_alias', file: 'f', line: 5 },
      ]),
    ).toEqual([
      { name: 'github.com', kind: 'gitRemote' },
      { name: 'bastion', kind: 'noHostName' },
      { name: 'my server', kind: 'invalidAlias' },
    ])
  })
})
