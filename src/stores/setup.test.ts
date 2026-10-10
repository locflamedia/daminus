// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  HostListing,
  HostOutcome,
  HostSetup,
  LoginReport,
  SetupEvent,
  SetupEventBody,
  SetupResult,
  SetupRun,
  SetupStep,
} from '@/api'
import { clearMocks, emitSetupEvent, mockCommands } from '@/api/testing'
import { useSetupStore } from './setup'

const STARTED_AT = '2026-10-07T10:00:00Z'

const login: LoginReport = {
  os: 'Linux',
  kernel: '6.8.0',
  arch: 'x86_64',
  distro: 'Ubuntu 24.04.1 LTS',
  user: 'deploy',
  uid: 1001,
  root: false,
  docker_group: true,
  adm_group: true,
  journal_group: false,
  docker: 'ok',
  gnu_find: true,
}

function listing(aliases: string[]): HostListing {
  const hosts = aliases.map((alias, i) => ({ alias, file: '~/.ssh/config', line: i + 1 }))
  return {
    list: { config_found: true, hosts, skipped: [] },
    entries: hosts.map((host) => ({ host, resolved: null })),
  }
}

function hostSetup(host: string, over: Partial<HostSetup> = {}): HostSetup {
  return {
    host,
    outcome: null,
    resolved: null,
    host_key: null,
    login: null,
    discovery: null,
    ...over,
  }
}

/** A tiny fake of the Rust side: one run at a time, a status and a result the test controls. */
class FakeBackend {
  status: SetupRun | null = null
  result: SetupResult = { hosts: [], proposal: null }
  starts: { step: SetupStep; hosts: string[]; paths: string[] }[] = []
  private n = 0
  current = ''

  handler = (cmd: string, args: Record<string, unknown>): unknown => {
    switch (cmd) {
      case 'hosts_list':
        return listing(['vps-a', 'vps-b', 'vps-c'])
      case 'ssh_environment':
        return { agent: 'keys', keys: 2 }
      case 'setup_status':
        return this.status && structuredClone(this.status)
      case 'setup_result':
        return structuredClone(this.result)
      case 'setup_stop': {
        const was = this.status !== null
        this.status = null
        return was
      }
      case 'setup_start': {
        const hosts = args.hosts as string[]
        this.starts.push({
          step: args.step as SetupStep,
          hosts,
          paths: (args.paths ?? []) as string[],
        })
        if (this.status) return { setup_id: this.status.setup_id, joined: true }
        this.current = `run-${(this.n += 1)}`
        this.status = {
          setup_id: this.current,
          step: args.step as SetupStep,
          started_at: STARTED_AT,
          next_seq: 0,
          hosts: Object.fromEntries(
            hosts.map((h) => [h, { state: 'queued', items: 0, dropped: 0 }]),
          ),
        }
        return { setup_id: this.current, joined: false }
      }
      default:
        throw new Error(`unexpected command ${cmd}`)
    }
  }

  /** Sends the next event, folded into the status first as Rust does. */
  async send(body: SetupEventBody, id = this.current) {
    const s = this.status
    const seq = s?.next_seq ?? 0
    if (s && id === s.setup_id) {
      s.next_seq = seq + 1
      if (body.kind === 'done' || body.kind === 'cancelled' || body.kind === 'failed') {
        this.status = null
      } else if ('host' in body) {
        const h = s.hosts[body.host]
        if (h && body.kind === 'host_started') s.hosts[body.host] = { ...h, state: 'connecting' }
        if (h && body.kind === 'host_running') s.hosts[body.host] = { ...h, state: 'running' }
        if (h && body.kind === 'host_finished') {
          s.hosts[body.host] = {
            state: 'finished',
            outcome: body.outcome,
            items: body.items,
            dropped: body.dropped,
          }
        }
      }
    }
    await emitSetupEvent({ setup_id: id, seq, ...body } as SetupEvent)
    await settle()
  }

  async reached(host: string, ms = 400) {
    this.result = {
      ...this.result,
      hosts: [
        ...this.result.hosts.filter((h) => h.host !== host),
        hostSetup(host, { outcome: { state: 'reached' }, login: { login, paths: [] } }),
      ],
    }
    await this.send({ kind: 'host_started', host })
    await this.send({ kind: 'host_running', host })
    await this.send({
      kind: 'host_finished',
      host,
      outcome: { state: 'reached' },
      ms,
      items: 1,
      dropped: 0,
    })
  }

  async finishRun() {
    await this.send({ kind: 'done' })
  }
}

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

let backend: FakeBackend

beforeEach(() => {
  setActivePinia(createPinia())
  backend = new FakeBackend()
  mockCommands((cmd, args) => backend.handler(cmd, args))
})

afterEach(() => clearMocks())

async function ready() {
  const setup = useSetupStore()
  await setup.init()
  await setup.load()
  return setup
}

describe('the host list', () => {
  it('reads the hosts and the agent, and forgets ticks of hosts that are gone', async () => {
    const setup = await ready()
    expect(setup.entries.map((e) => e.host.alias)).toEqual(['vps-a', 'vps-b', 'vps-c'])
    expect(setup.agent).toBe('keys')
    expect(setup.configFound).toBe(true)
    setup.ticked = ['vps-a', 'old-host']
    await setup.reload()
    expect(setup.ticked).toEqual(['vps-a'])
  })

  it('keeps the hosts and says which line ssh refused when the config does not parse', async () => {
    const broken = listing(['vps-a', 'vps-b'])
    broken.config_error = {
      error: {
        code: { kind: 'ssh_config_invalid', path: '/u/.ssh/config', line: 6 },
        retryable: false,
      },
      excerpt: [{ number: 6, text: '  Port 99999' }],
    }
    mockCommands((cmd, args) => (cmd === 'hosts_list' ? broken : backend.handler(cmd, args)))
    const setup = await ready()
    expect(setup.entries.map((e) => e.host.alias)).toEqual(['vps-a', 'vps-b'])
    expect(setup.error).toBeNull()
    expect(setup.configError?.code).toEqual({
      kind: 'ssh_config_invalid',
      path: '/u/.ssh/config',
      line: 6,
    })
    expect(setup.configProblem?.excerpt).toEqual([{ number: 6, text: '  Port 99999' }])

    mockCommands(backend.handler)
    await setup.reload()
    expect(setup.configProblem).toBeNull()
  })
})

describe('a config ssh refuses', () => {
  function brokenListing() {
    const broken = listing(['vps-a', 'vps-b'])
    broken.config_error = {
      error: {
        code: { kind: 'ssh_config_invalid', path: '/u/.ssh/config', line: 6 },
        retryable: false,
      },
      excerpt: [],
    }
    return broken
  }

  it('tests nothing and reads Not checked, then tests the ticked hosts once it is fixed', async () => {
    let fixed = false
    mockCommands((cmd, args) =>
      cmd === 'hosts_list' && !fixed ? brokenListing() : backend.handler(cmd, args),
    )
    const setup = await ready()
    setup.tickAll(true)
    await settle()
    expect(backend.starts).toEqual([])
    expect(setup.chip('vps-a')).toBe('not_checked')

    fixed = true
    await setup.reload()
    await settle()
    expect(setup.configProblem).toBeNull()
    expect(backend.starts).toEqual([{ step: 'test', hosts: ['vps-a', 'vps-b'], paths: [] }])
    expect(setup.chip('vps-a')).toBe('queued')
  })

  it('does not test a host that was unticked while it waited', async () => {
    let fixed = false
    mockCommands((cmd, args) =>
      cmd === 'hosts_list' && !fixed ? brokenListing() : backend.handler(cmd, args),
    )
    const setup = await ready()
    setup.tickAll(true)
    setup.tick('vps-b', false)
    fixed = true
    await setup.reload()
    await settle()
    expect(backend.starts).toEqual([{ step: 'test', hosts: ['vps-a'], paths: [] }])
  })
})

describe('the login test', () => {
  it('starts when a host is ticked and follows the chip through its states', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    expect(backend.starts).toEqual([{ step: 'test', hosts: ['vps-a'], paths: [] }])
    expect(setup.chip('vps-a')).toBe('queued')

    await backend.send({ kind: 'host_started', host: 'vps-a' })
    expect(setup.chip('vps-a')).toBe('connecting')
    await backend.send({ kind: 'agent_wait', host: 'vps-a' })
    expect(setup.chip('vps-a')).toBe('agent_wait')
    await backend.send({ kind: 'host_running', host: 'vps-a' })
    expect(setup.chip('vps-a')).toBe('testing')

    await backend.reached('vps-a')
    await backend.finishRun()
    expect(setup.chip('vps-a')).toBe('reached')
    expect(setup.answers['vps-a']?.ms).toBe(400)
    expect(setup.logins['vps-a']?.login?.login?.user).toBe('deploy')
    expect(setup.ready).toEqual(['vps-a'])
    expect(setup.scanning).toBe(false)
  })

  it('tests a host ticked during a run after that run, in its own run', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    setup.tick('vps-b', true)
    await settle()
    expect(backend.starts).toHaveLength(1)
    expect(setup.chip('vps-b')).toBe('queued')

    await backend.reached('vps-a')
    await backend.finishRun()
    expect(backend.starts.map((s) => s.hosts)).toEqual([['vps-a'], ['vps-b']])
    await backend.reached('vps-b')
    await backend.finishRun()
    expect(setup.ready).toEqual(['vps-a', 'vps-b'])
  })

  it('keeps the answer of a host that was tested before when another run forgets it', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    await backend.reached('vps-a')
    await backend.finishRun()
    // The core's next run starts from the hosts it is given.
    backend.result = { hosts: [], proposal: null }
    setup.tick('vps-b', true)
    await settle()
    await backend.reached('vps-b')
    await backend.finishRun()
    expect(setup.chip('vps-a')).toBe('reached')
    expect(setup.logins['vps-a']?.login?.login?.user).toBe('deploy')
  })

  it('does not test a host that already answered', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    await backend.reached('vps-a')
    await backend.finishRun()
    setup.tick('vps-a', false)
    setup.tick('vps-a', true)
    await settle()
    expect(backend.starts).toHaveLength(1)
  })

  it('keeps a failed host ticked, and tests it again on Retry', async () => {
    const setup = await ready()
    setup.tick('vps-c', true)
    await settle()
    const outcome: HostOutcome = { state: 'auth_failed' }
    await backend.send({ kind: 'host_started', host: 'vps-c' })
    await backend.send({
      kind: 'host_finished',
      host: 'vps-c',
      outcome,
      ms: 900,
      items: 0,
      dropped: 0,
    })
    await backend.finishRun()
    expect(setup.chip('vps-c')).toBe('key_rejected')
    expect(setup.isTicked('vps-c')).toBe(true)
    expect(setup.failedHosts).toEqual(['vps-c'])
    expect(setup.ready).toEqual([])

    setup.retest('vps-c')
    await settle()
    expect(backend.starts).toHaveLength(2)
    expect(setup.chip('vps-c')).toBe('queued')
    await backend.send({ kind: 'host_started', host: 'vps-c' })
    expect(setup.chip('vps-c')).toBe('connecting')
  })

  it('Skip host unticks it and drops it from the queue', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    setup.tick('vps-b', true)
    setup.skip('vps-b')
    expect(setup.ticked).toEqual(['vps-a'])
    expect(setup.queue).toEqual([])
  })

  it('keeps the host key the run found, for the host key step', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    await backend.send({ kind: 'host_started', host: 'vps-a' })
    await backend.send({
      kind: 'host_key',
      host: 'vps-a',
      info: { state: 'unknown', offered: 'ED25519 SHA256:abc', known: [] },
    })
    expect(setup.answers['vps-a']?.hostKey?.offered).toBe('ED25519 SHA256:abc')
  })
})

describe('events that arrive out of order', () => {
  it('drop the events of a run that already ended', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    const id = backend.current
    await backend.reached('vps-a')
    await backend.finishRun()
    await backend.send({ kind: 'host_started', host: 'vps-a' }, id)
    expect(setup.chip('vps-a')).toBe('reached')
  })

  it('read the status again when a seq is missing', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    // One event the webview never saw: seq 0 is folded into the status only.
    backend.status!.next_seq = 1
    backend.status!.hosts['vps-a'] = { state: 'connecting', items: 0, dropped: 0 }
    await backend.send({ kind: 'host_running', host: 'vps-a' }) // seq 1, run has next_seq 0 here
    expect(setup.run?.hosts['vps-a']?.state).toBe('running')
  })
})

describe('discover', () => {
  async function twoReady() {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    await backend.reached('vps-a')
    await backend.finishRun()
    return setup
  }

  it('runs on the hosts that answered, collects records, and reads the suggestions as hosts finish', async () => {
    const setup = await twoReady()
    await setup.startDiscover()
    expect(backend.starts.at(-1)).toMatchObject({ step: 'discover', hosts: ['vps-a'] })
    expect(setup.discovering).toEqual(['vps-a'])

    await backend.send({ kind: 'host_started', host: 'vps-a' })
    await backend.send({ kind: 'host_running', host: 'vps-a' })
    await backend.send({
      kind: 'item',
      host: 'vps-a',
      item: { rec: 'env', path: '/srv/shop/.env', readable: true },
    })
    expect(setup.liveItems['vps-a']).toHaveLength(1)
    expect(setup.run?.hosts['vps-a']?.items).toBe(1)

    backend.result = {
      hosts: backend.result.hosts,
      proposal: { projects: [], unassigned: [] },
    }
    await backend.send({
      kind: 'host_finished',
      host: 'vps-a',
      outcome: { state: 'reached' },
      ms: 1800,
      items: 3,
      dropped: 2,
    })
    expect(setup.lanes['vps-a']).toEqual({
      outcome: { state: 'reached' },
      ms: 1800,
      items: 3,
      dropped: 2,
    })
    expect(setup.result?.proposal).toEqual({ projects: [], unassigned: [] })
    await backend.finishRun()
    expect(setup.lastEnd).toBe('done')
  })

  it('does nothing without a host to ask', async () => {
    const setup = await ready()
    await setup.startDiscover()
    expect(backend.starts).toEqual([])
  })

  it('forgets what it knew about the lane when it reads that host again', async () => {
    const setup = await twoReady()
    await setup.startDiscover()
    await backend.send({ kind: 'host_started', host: 'vps-a' })
    await backend.send({
      kind: 'host_finished',
      host: 'vps-a',
      outcome: { state: 'reached' },
      ms: 10,
      items: 0,
      dropped: 0,
    })
    await backend.finishRun()
    expect(setup.lanes['vps-a']).toBeDefined()
    await setup.readAgain('vps-a')
    expect(setup.lanes['vps-a']).toBeUndefined()
    expect(backend.starts.at(-1)).toMatchObject({ step: 'discover', hosts: ['vps-a'] })
  })

  it('shows a run that failed and keeps what the other hosts found', async () => {
    const setup = await twoReady()
    await setup.startDiscover()
    await backend.send({
      kind: 'failed',
      error: { code: { kind: 'internal' }, params: {}, retryable: false },
    })
    expect(setup.lastEnd).toBe('failed')
    expect(setup.runError?.code.kind).toBe('internal')
    expect(setup.scanning).toBe(false)
  })
})

describe('starting over', () => {
  it('forgets the ticks, answers and results', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    await backend.reached('vps-a')
    await backend.finishRun()
    setup.reset()
    expect(setup.ticked).toEqual([])
    expect(setup.chip('vps-a')).toBe('untested')
    expect(setup.result).toBeNull()
  })
})

describe('discover while a login test is running', () => {
  it('waits for the test run to end and then starts, instead of stalling', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    await backend.reached('vps-a')
    // vps-b is being tested when the user asks for discover on vps-a.
    setup.tick('vps-b', true)
    await settle()
    expect(backend.status?.step).toBe('test')
    await setup.startDiscover(['vps-a'])
    expect(setup.pendingDiscover).toEqual(['vps-a'])
    expect(backend.starts.some((s) => s.step === 'discover')).toBe(false)

    await backend.reached('vps-b')
    await backend.finishRun()
    expect(backend.starts.at(-1)).toMatchObject({ step: 'discover', hosts: ['vps-a'] })
    expect(setup.pendingDiscover).toBeNull()
    expect(backend.status?.step).toBe('discover')
  })

  it('does not start the waiting discover after the user stops', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    await setup.startDiscover(['vps-a'])
    await setup.stop()
    expect(setup.pendingDiscover).toBeNull()
  })

  it('puts every host of tick-all into one run', async () => {
    const setup = await ready()
    setup.tickAll(true)
    await settle()
    expect(backend.starts).toHaveLength(1)
    expect(backend.starts[0]?.hosts).toEqual(['vps-a', 'vps-b', 'vps-c'])
  })
})

describe('discover when the core joins a run that has already ended', () => {
  it('asks again once instead of parking with nothing to wake it', async () => {
    const setup = await ready()
    setup.tick('vps-a', true)
    await settle()
    await backend.reached('vps-a')
    await backend.finishRun()
    // The first answer says "joined" although the run is gone by the time the status is read.
    const inner = backend.handler
    let first = true
    mockCommands((cmd, args) => {
      if (cmd === 'setup_start' && args.step === 'discover' && first) {
        first = false
        backend.starts.push({ step: 'discover', hosts: args.hosts as string[], paths: [] })
        return { setup_id: 'gone', joined: true }
      }
      return inner(cmd, args)
    })
    await setup.startDiscover(['vps-a'])
    expect(setup.pendingDiscover).toBeNull()
    expect(backend.status?.step).toBe('discover')
  })
})
