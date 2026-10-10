// What the empty app shows, decided from what the setup store knows about this Mac: the
// ssh config (missing, present with nothing usable, or with hosts) and the ssh-agent (holding
// keys, empty, or not there). Pure, so every combination can be tested without a window.
//
// The first screen (first launch, a config with hosts and an agent with keys) is replaced by the
// second (the no-config help) when the config has no usable host or the agent holds no
// key. When only one of the two is missing, only that row and its step are drawn.
import type { AgentState, EmptyReason, HostEntry, SkippedHost, SkipReason } from '@/api'
import { keyName } from '@/lib/host-test'

export type EmptyScreen = 'app' | 'help'
export type ConfigState = 'missing' | 'unusable' | 'ok'

/** Which words head the help screen. */
export type HelpHeadline = 'noConfig' | 'noUsableHosts' | 'agent'

export interface EmptyInput {
  configFound: boolean
  emptyReason: EmptyReason | null
  /** Hosts the config lists (the usable ones). */
  hosts: number
  skipped: readonly SkippedHost[]
  /** `null` while the agent has not been asked (or asking failed). */
  agent: AgentState | null
  keys: number
}

export function configState(
  input: Pick<EmptyInput, 'configFound' | 'emptyReason' | 'hosts'>,
): ConfigState {
  if (input.emptyReason === 'no_config' || !input.configFound) return 'missing'
  if (input.emptyReason === 'no_usable_hosts' || input.hosts === 0) return 'unusable'
  return 'ok'
}

/** An agent that was not asked is not blamed. */
export function agentOk(agent: AgentState | null): boolean {
  return agent === null || agent === 'keys'
}

/** The first screen when nothing is missing; the help screen when the config or the agent is. */
export function emptyScreen(input: EmptyInput): EmptyScreen {
  return configState(input) === 'ok' && agentOk(input.agent) ? 'app' : 'help'
}

/** The rows and the headline the help screen drew when it first appeared. */
export interface HelpShown {
  config: boolean
  agent: boolean
  headline: HelpHeadline
}

function headlineOf(input: EmptyInput): HelpHeadline {
  const config = configState(input)
  if (config === 'missing') return 'noConfig'
  if (config === 'unusable') return 'noUsableHosts'
  return 'agent'
}

/**
 * What the help screen shows now, kept from what it showed before: a row that was missing stays
 * on screen once Check again finds it, turning green, so the person sees it work. Only the
 * headline follows the config while the config is still the problem.
 */
export function shownRows(input: EmptyInput, before: HelpShown | null): HelpShown {
  const needsConfig = configState(input) !== 'ok'
  const needsAgent = !agentOk(input.agent)
  const live = headlineOf(input)
  return {
    config: needsConfig || (before?.config ?? false),
    agent: needsAgent || (before?.agent ?? false),
    headline: before && !needsConfig ? before.headline : live,
  }
}

export interface LeftOutRow {
  /** What the file called it: a pattern, a `Match` line or an alias. */
  name: string
  reason: SkipReason
  /** `file:line`. */
  where: string
}

export interface HelpView {
  headline: HelpHeadline
  config: ConfigState
  agent: AgentState
  keys: number
  hosts: number
  /** The `skipped` entries, when the config is there and nothing in it is usable. */
  leftOut: LeftOutRow[]
  /** How many entries the config had, all of them left out. */
  entries: number
  rows: { config: boolean; agent: boolean }
  steps: {
    /** Save the key as a file, then load it into the agent. */
    key: boolean
    agent: boolean
    /** Describe a server: first Host block, or one with a HostName when the file has none usable. */
    block: 'describe' | 'add' | null
  }
  /** How many steps are drawn, numbered from 1 in the order above. */
  stepCount: number
  /** Import turns live once the config has a usable host and the agent has a key. */
  canImport: boolean
}

export function helpView(input: EmptyInput, shown: HelpShown): HelpView {
  const config = configState(input)
  const agent: AgentState = input.agent ?? 'keys'
  const block = shown.config ? (shown.headline === 'noUsableHosts' ? 'add' : 'describe') : null
  const steps = { key: shown.agent, agent: shown.agent, block } as const
  return {
    headline: shown.headline,
    config,
    agent,
    keys: input.keys,
    hosts: input.hosts,
    leftOut: config === 'unusable' ? input.skipped.map(leftOut) : [],
    entries: input.skipped.length + input.hosts,
    rows: { config: shown.config, agent: shown.agent },
    steps,
    stepCount: (steps.key ? 1 : 0) + (steps.agent ? 1 : 0) + (steps.block ? 1 : 0),
    canImport: config === 'ok' && agent === 'keys',
  }
}

function leftOut(s: SkippedHost): LeftOutRow {
  return { name: s.pattern, reason: s.reason, where: `${s.file}:${s.line}` }
}

// --- the first screen: the read-only preview of the config ----------------------------------

export interface PreviewRow {
  alias: string
  hostName: string
  user: string | null
  /** The key file's name, or `null` when the config names none (the agent decides). */
  key: string | null
}

export function previewRows(entries: readonly HostEntry[]): PreviewRow[] {
  return entries.map((e) => ({
    alias: e.host.alias,
    hostName: e.resolved?.hostname ?? e.host.alias,
    user: e.resolved?.user ?? null,
    key: keyName(e.resolved?.identity_files ?? []),
  }))
}

export type PreviewSkipKind = 'gitRemote' | 'noHostName' | 'invalidAlias'

export interface PreviewSkip {
  name: string
  kind: PreviewSkipKind
}

/** Git forges are the usual `Host` blocks with a user and a key but no server behind them. */
const GIT_REMOTE = /^(www\.)?(github|gitlab|bitbucket|codeberg)\./i

/**
 * The left-out entries worth a line on the first screen: hosts that were named but cannot be
 * used. Patterns and `Match` blocks are normal in a config and say nothing here.
 */
export function previewSkips(skipped: readonly SkippedHost[]): PreviewSkip[] {
  const out: PreviewSkip[] = []
  for (const s of skipped) {
    if (s.reason === 'no_host_name') {
      out.push({ name: s.pattern, kind: GIT_REMOTE.test(s.pattern) ? 'gitRemote' : 'noHostName' })
    } else if (s.reason === 'invalid_alias') {
      out.push({ name: s.pattern, kind: 'invalidAlias' })
    }
  }
  return out
}
