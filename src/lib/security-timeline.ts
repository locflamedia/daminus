// "How it unfolded": one line per scan for the last scans of a project, naming what turned up
// first in it. The order of events is the best clue after a compromise. Each line comes from the
// report of that scan (what was new, what was open), so it needs no extra data from the core.
import type { Item } from '@/api'
import { baseName } from './security-format'
import { dataOf, num, valueOf } from './security-data'
import { isSecurityCheck, type Msg, SECURITY_CHECKS } from './security-rows'

export type TimelineTone = 'ok' | 'warn' | 'crit' | 'info'

export interface TimelineScan {
  seq: number
  at: string
  /** The project's results of the nine checks as that scan's report holds them. */
  items: readonly Item[]
}

export interface TimelineEvent {
  seq: number
  at: string
  tone: TimelineTone
  /** A message key under `projectSecurity.event`. */
  text: Msg
  /** Other findings that appeared in the same scan. */
  more: number
}

const PRIORITY = [
  'sec.miner',
  'sec.preload',
  'sec.upload_php',
  'url.exposed',
  'sec.tmp_exec',
  'sec.ports',
  'url.tls',
  'url.http',
  'sec.recent_change',
]

function isOpen(item: Item): boolean {
  const level = item.severity.level
  if (item.disposition.kind === 'expected') return false
  if (level !== 'crit' && level !== 'warn') return false
  return (
    (valueOf(item) ?? 1) > 0 ||
    !['sec.upload_php', 'sec.tmp_exec', 'sec.miner'].includes(item.key.check)
  )
}

function appeared(item: Item): Msg {
  const data = dataOf(item)
  switch (item.key.check) {
    case 'sec.upload_php':
      return { key: 'uploadPhp', params: { file: baseName(item.key.target) } }
    case 'sec.tmp_exec':
      return { key: 'tmpExec', params: { file: baseName(item.key.target) } }
    case 'sec.miner':
      return { key: 'miner', params: { name: item.key.target } }
    case 'sec.preload':
      return { key: 'preload' }
    case 'sec.ports':
      return { key: 'ports', params: { port: num(data.port) ?? item.key.target } }
    case 'url.exposed':
      return { key: 'exposed' }
    case 'url.tls':
      return { key: 'tls' }
    case 'url.http':
      return { key: 'http' }
    default:
      return { key: 'recent', params: { n: valueOf(item) ?? 0 } }
  }
}

function toneOf(items: readonly Item[]): TimelineTone {
  return items.some((i) => i.severity.level === 'crit')
    ? 'crit'
    : items.some((i) => i.severity.level === 'warn')
      ? 'warn'
      : 'info'
}

/** One event for a scan. */
export function eventOf(scan: TimelineScan): TimelineEvent {
  const mine = scan.items.filter((i) => isSecurityCheck(i.key.check))
  const open = mine.filter(isOpen)
  const base = { seq: scan.seq, at: scan.at }
  if (mine.length === 0) return { ...base, tone: 'info', text: { key: 'notRun' }, more: 0 }
  if (open.length === 0) {
    const ran = new Set(mine.map((i) => i.key.check)).size
    return {
      ...base,
      tone: 'ok',
      text: ran >= SECURITY_CHECKS.length ? { key: 'allClean' } : { key: 'clean' },
      more: 0,
    }
  }
  const fresh = open
    .filter((i) => i.delta?.kind === 'new')
    .sort((a, b) => PRIORITY.indexOf(a.key.check) - PRIORITY.indexOf(b.key.check))
  const first = fresh[0]
  if (!first) {
    return {
      ...base,
      tone: toneOf(open),
      text: { key: 'stillOpen', params: { n: open.length } },
      more: 0,
    }
  }
  return { ...base, tone: toneOf(open), text: appeared(first), more: fresh.length - 1 }
}

/** The last `count` scans, oldest first. */
export function timeline(scans: readonly TimelineScan[], count = 4): TimelineEvent[] {
  return [...scans]
    .sort((a, b) => a.seq - b.seq)
    .slice(-count)
    .map(eventOf)
}

/** A vertical gradient that runs through the tones of the events, as the line of the timeline. */
export function lineGradient(
  events: readonly TimelineEvent[],
  colors: Record<TimelineTone, string>,
): string {
  if (events.length === 0) return 'transparent'
  if (events.length === 1) return colors[(events[0] as TimelineEvent).tone]
  const stops = events.map(
    (e, i) => `${colors[e.tone]} ${Math.round((i / (events.length - 1)) * 100)}%`,
  )
  return `linear-gradient(${stops.join(', ')})`
}
