// Development only: a scripted stand-in for the setup commands, so the setup screens can be
// seen and used in a plain browser. It answers like the core does (the same shapes, the same
// events with the same order, the same checks on a project) with timers in place of servers.
// The production bundle never imports it.
import {
  FAILURE_HOSTS,
  QUEUED_HOSTS,
  SAMPLE_HOSTS,
  SAMPLE_RECORDS,
  SAMPLE_SKIPPED,
  SAVED_PROJECTS,
  discoveryOf,
  emptyListing,
  sampleListing,
  sampleProposal,
  sampleSetup,
  type SampleHost,
} from '@/testing/setup-fixture'
import type {
  HostListing,
  HostSetup,
  Project,
  ProjectIssue,
  SetupEventBody,
  SetupResult,
  SetupRun,
  SetupStep,
  SshEnvironment,
  UrlCheck,
} from './index'
import { emitSetupEvent } from './testing'

const VARIANTS = [
  'empty',
  'empty-noconfig',
  'empty-nousable',
  'setup',
  'setup-saved',
  'setup-failures',
  'setup-empty-discover',
  'setup-queued',
] as const

/**
 * `setup-failures`: logins that end host key unknown, host key changed, unreachable, timed out
 * and key rejected. `setup-empty-discover`: every host logs in but discover finds nothing.
 * `setup-queued`: the last host starts six seconds late, so its queued lane stays visible.
 */
export type SetupMockVariant = (typeof VARIANTS)[number]

export function isSetupVariant(variant: string): variant is SetupMockVariant {
  return (VARIANTS as readonly string[]).includes(variant)
}

const ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** `probe::url_warning`, on the text of the address only. */
function localWarning(url: string): 'loopback' | 'private_network' | 'link_local' | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host === 'localhost' || host.startsWith('127.') || host === '[::1]') return 'loopback'
  if (/^169\.254\./.test(host)) return 'link_local'
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return 'private_network'
  return null
}

function probeable(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== ''
  } catch {
    return false
  }
}

/** The core's `validate`, for the sample servers. */
export function mockValidate(
  projects: Project[],
  known: string[] | null,
  saved: string[],
): ProjectIssue[] {
  const out: ProjectIssue[] = []
  const ids = new Set<string>()
  const issue = (
    project: string,
    field: ProjectIssue['field'],
    code: ProjectIssue['code'],
    level: ProjectIssue['level'],
  ) => out.push({ project, field, level, code })
  for (const p of projects) {
    const id = p.id
    if (id === '') issue(id, { kind: 'id' }, { kind: 'empty' }, 'error')
    else if (!ALIAS.test(id)) issue(id, { kind: 'id' }, { kind: 'bad_id' }, 'error')
    else if (ids.has(id)) issue(id, { kind: 'id' }, { kind: 'duplicate_id' }, 'error')
    else if (saved.includes(id)) issue(id, { kind: 'id' }, { kind: 'replaces_existing' }, 'warning')
    ids.add(id)
    if (p.name.trim() === '') issue(id, { kind: 'name' }, { kind: 'empty' }, 'error')
    if (p.urls.every((u) => u.trim() === '') && p.components.length === 0) {
      issue(id, { kind: 'project' }, { kind: 'empty' }, 'error')
    }
    const seen = new Set<string>()
    p.urls.forEach((raw, index) => {
      const url = raw.trim()
      if (url === '') return
      const field = { kind: 'url', index } as const
      if (!probeable(url)) return issue(id, field, { kind: 'url_invalid' }, 'error')
      if (seen.has(url)) issue(id, field, { kind: 'url_duplicate' }, 'warning')
      seen.add(url)
      const warning = localWarning(url)
      if (warning) issue(id, field, { kind: 'url_local_only', warning }, 'warning')
    })
    p.components.forEach((c, index) => {
      const field = { kind: 'component', index } as const
      if (p.components.slice(0, index).some((o) => JSON.stringify(o) === JSON.stringify(c))) {
        issue(id, field, { kind: 'component_duplicate' }, 'warning')
      }
      if (known && !known.includes(c.host)) issue(id, field, { kind: 'unknown_host' }, 'warning')
    })
  }
  return out
}

function urlAnswer(url: string): UrlCheck {
  if (!probeable(url)) return { status: null, ms: null, tls_days: null, failure: 'invalid' }
  const host = new URL(url).hostname
  if (host.startsWith('admin.')) return { status: null, ms: null, tls_days: null, failure: 'dns' }
  if (host.startsWith('api.')) return { status: 200, ms: 88, tls_days: 12, failure: null }
  if (host === 'slow.example') return { status: null, ms: null, tls_days: null, failure: 'timeout' }
  const https = url.trim().startsWith('https')
  return { status: 200, ms: 142, tls_days: https ? 61 : null, failure: null }
}

export class SetupMock {
  private projects: Project[]
  private listing: HostListing
  private env: SshEnvironment
  private hosts: SampleHost[]
  private status: SetupRun | null = null
  private results = new Map<string, HostSetup>()
  private finished: string[] = []
  private n = 0
  private timers: ReturnType<typeof setTimeout>[] = []
  /** Milliseconds are divided by this, to see a flow quickly. */
  private speed: number
  /** What discover prints per host; none at all in the nothing-found variant. */
  private records: typeof SAMPLE_RECORDS

  constructor(variant: SetupMockVariant, speed = 1) {
    this.speed = speed
    this.hosts =
      variant === 'setup-failures'
        ? FAILURE_HOSTS
        : variant === 'setup-queued'
          ? QUEUED_HOSTS
          : SAMPLE_HOSTS
    this.records = variant === 'setup-empty-discover' ? {} : SAMPLE_RECORDS
    this.projects = variant === 'setup-saved' ? structuredClone(SAVED_PROJECTS) : []
    this.listing =
      variant === 'empty-noconfig'
        ? emptyListing('no_config')
        : variant === 'empty-nousable'
          ? emptyListing('no_usable_hosts')
          : sampleListing(this.hosts, SAMPLE_SKIPPED)
    this.env =
      variant === 'empty-noconfig'
        ? { agent: 'empty', keys: 0, termius_installed: true }
        : { agent: 'keys', keys: 2, termius_installed: false }
  }

  savedProjects(): Project[] {
    return this.projects
  }

  handle = (cmd: string, args: Record<string, unknown>): unknown => {
    switch (cmd) {
      case 'hosts_list':
        return structuredClone(this.listing)
      case 'ssh_environment':
        return this.env
      case 'setup_status':
        return this.status && structuredClone(this.status)
      case 'setup_result':
        return this.result()
      case 'setup_stop':
        return this.stop()
      case 'setup_start':
        return this.start(args.step as SetupStep, args.hosts as string[])
      case 'projects_list':
        return structuredClone(this.projects)
      case 'projects_validate':
        return this.validate(args.projects as Project[])
      case 'projects_save':
        return this.save(args.projects as Project[])
      case 'projects_remove': {
        const before = this.projects.length
        this.projects = this.projects.filter((p) => p.id !== args.id)
        return this.projects.length < before
      }
      case 'url_check':
        return urlAnswer(String(args.url))
      default:
        return undefined
    }
  }

  private ms(n: number): number {
    return Math.max(0, n / this.speed)
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, this.ms(ms)))
  }

  private validate(projects: Project[]): ProjectIssue[] {
    const known = this.listing.list.config_found
      ? this.listing.list.hosts.map((h) => h.alias)
      : null
    return mockValidate(
      projects,
      known,
      this.projects.map((p) => p.id),
    )
  }

  private save(projects: Project[]) {
    const issues = this.validate(projects)
    if (issues.some((i) => i.level === 'error')) return { status: 'rejected', issues }
    for (const p of projects) {
      const at = this.projects.findIndex((x) => x.id === p.id)
      if (at === -1) this.projects.push(p)
      else this.projects[at] = { ...p, color: p.color ?? this.projects[at]?.color }
    }
    return { status: 'saved', issues, projects: this.projects.length }
  }

  private result(): SetupResult {
    const hosts = [...this.results.values()]
    const done = this.finished.filter((h) => this.results.get(h)?.discovery)
    const found = done.filter((h) => (this.records[h] ?? []).length > 0)
    return {
      hosts: structuredClone(hosts),
      proposal:
        done.length === 0
          ? null
          : found.length === 0
            ? { projects: [], unassigned: [] }
            : sampleProposal(found),
    }
  }

  private stop(): boolean {
    if (!this.status) return false
    this.timers.forEach(clearTimeout)
    this.timers = []
    this.status = null
    return true
  }

  private send(body: SetupEventBody) {
    const s = this.status
    if (!s) return
    const seq = s.next_seq
    s.next_seq = seq + 1
    if ('host' in body) {
      const p = s.hosts[body.host]
      if (p) {
        if (body.kind === 'host_started') s.hosts[body.host] = { ...p, state: 'connecting' }
        else if (body.kind === 'agent_wait') s.hosts[body.host] = { ...p, state: 'agent_wait' }
        else if (body.kind === 'host_running') s.hosts[body.host] = { ...p, state: 'running' }
        else if (body.kind === 'item') s.hosts[body.host] = { ...p, items: p.items + 1 }
        else if (body.kind === 'host_finished') {
          s.hosts[body.host] = {
            state: 'finished',
            outcome: body.outcome,
            items: body.items,
            dropped: body.dropped,
          }
        }
      }
    }
    if (body.kind === 'done' || body.kind === 'cancelled' || body.kind === 'failed') {
      this.status = null
    }
    void emitSetupEvent({ setup_id: s.setup_id, seq, ...body })
  }

  private start(step: SetupStep, aliases: string[]) {
    if (this.status) return { setup_id: this.status.setup_id, joined: true }
    const id = `mock-${(this.n += 1)}`
    this.status = {
      setup_id: id,
      step,
      started_at: new Date().toISOString(),
      next_seq: 0,
      hosts: Object.fromEntries(aliases.map((h) => [h, { state: 'queued', items: 0, dropped: 0 }])),
    }
    const hosts = aliases
      .map((a) => this.hosts.find((h) => h.alias === a))
      .filter((h): h is SampleHost => h !== undefined)
    let last = 0
    for (const host of hosts) {
      last = Math.max(last, step === 'test' ? this.scriptTest(host) : this.scriptDiscover(host))
    }
    this.later(last + 60, () => this.send({ kind: 'done' }))
    return { setup_id: id, joined: false }
  }

  /** The login test of one host; returns when it ends. */
  private scriptTest(host: SampleHost): number {
    const alias = host.alias
    const at = host.delay
    this.later(at, () => this.send({ kind: 'host_started', host: alias }))
    if (alias === 'vps-sg-2')
      this.later(at + 40, () => this.send({ kind: 'agent_wait', host: alias }))
    const running = at + (alias === 'vps-sg-2' ? 900 : 200)
    const ok = host.outcome.state === 'reached'
    if (ok) {
      this.later(running, () => this.send({ kind: 'host_running', host: alias }))
    }
    const end = running + (ok ? host.ms : 400)
    const { hostKey } = host
    if (hostKey)
      this.later(end - 20, () => this.send({ kind: 'host_key', host: alias, info: hostKey }))
    this.later(end, () => {
      this.results.set(alias, sampleSetup(host))
      this.send({
        kind: 'host_finished',
        host: alias,
        outcome: host.outcome,
        ms: host.ms,
        items: ok ? 1 + (host.folders?.length ?? 0) : 0,
        dropped: 0,
      })
    })
    return end
  }

  /** Discover on one host: its records one by one; returns when it ends. */
  private scriptDiscover(host: SampleHost): number {
    const alias = host.alias
    const records = this.records[alias] ?? []
    this.later(host.delay / 2, () => this.send({ kind: 'host_started', host: alias }))
    const first = host.delay / 2 + 250
    this.later(first, () => this.send({ kind: 'host_running', host: alias }))
    records.forEach((item, i) => {
      this.later(first + 300 + i * 260, () => this.send({ kind: 'item', host: alias, item }))
    })
    const end = first + 300 + records.length * 260 + 200
    this.later(end, () => {
      const prior = this.results.get(alias) ?? sampleSetup(host)
      this.results.set(alias, { ...prior, discovery: discoveryOf(records) })
      this.finished.push(alias)
      this.send({
        kind: 'host_finished',
        host: alias,
        outcome: { state: 'reached' },
        ms: Math.round(end - host.delay / 2),
        items: records.length,
        dropped: alias === 'vps-hn-3' && records.length > 0 ? 2 : 0,
      })
    })
    return end
  }
}
