// The four numbers on top of the server page (load, memory, disk, swap): the value from the
// latest report, its change against the chosen baseline scan, and the sparkline over the scans.
// The card's state is the severity the core gave the check, never a threshold read here.
import type { Item, ScanFact } from '@/api'
import type { UnknownReason } from '@/api/bindings/UnknownReason'
import { dataOf, num } from './project-facts'
import { coresOf, hostSeries, itemOf, recentValues } from './server-facts'

export type KpiId = 'load' | 'memory' | 'disk' | 'swap'
export type KpiLevel = 'ok' | 'info' | 'warn' | 'crit' | 'unknown'
export type KpiUnit = 'load' | 'bytes' | '%'

export interface KpiDelta {
  direction: 'up' | 'down' | 'flat'
  /** Always positive: the size of the change in the card's unit (load, points, bytes). */
  amount: number
  unit: 'load' | 'pts' | 'bytes'
  /** Disk: what the used bytes changed by, beside the points. */
  bytes: number | null
}

export type KpiDetail =
  { kind: 'busy'; pct: number } | { kind: 'available'; pct: number } | { kind: 'noSwap' }

export interface Kpi {
  id: KpiId
  level: KpiLevel
  reason: UnknownReason | null
  /** The scan the shown result was last really checked in, when it is old. */
  staleSince: number | null
  value: number | null
  unit: KpiUnit
  /** What the value is out of: the cores for load, the total memory in bytes. */
  of: number | null
  detail: KpiDetail | null
  delta: KpiDelta | null
  /** Mount point of the filesystem the disk card reads. */
  mount: string | null
  series: number[]
}

/** Scans the sparkline reads. */
export const SPARK_SCANS = 10

const ZERO_LOAD = 0.005

function level(item: Item | undefined): KpiLevel {
  return item ? item.severity.level : 'unknown'
}

function reason(item: Item | undefined): UnknownReason | null {
  return item?.severity.level === 'unknown' ? item.severity.reason : null
}

function staleSince(item: Item | undefined): number | null {
  return item?.disposition.kind === 'stale' ? item.disposition.since_seq : null
}

function change(
  now: number | null,
  before: number | null,
  unit: KpiDelta['unit'],
  bytes: number | null = null,
): KpiDelta | null {
  if (now === null || before === null) return null
  const diff = now - before
  const flat =
    unit === 'load'
      ? Math.abs(diff) < ZERO_LOAD
      : unit === 'pts'
        ? Math.abs(diff) < 0.5
        : diff === 0
  return {
    direction: flat ? 'flat' : diff > 0 ? 'up' : 'down',
    amount: Math.abs(diff),
    unit,
    bytes,
  }
}

function loadKpi(
  items: readonly Item[],
  before: readonly Item[],
  facts: readonly ScanFact[],
  host: string,
): Kpi {
  const item = itemOf(items, 'sys.load')
  const value = num(item?.fact?.value)
  const cores = coresOf(items)
  return {
    id: 'load',
    level: level(item),
    reason: reason(item),
    staleSince: staleSince(item),
    value,
    unit: 'load',
    of: cores,
    detail:
      value !== null && cores !== null
        ? { kind: 'busy', pct: Math.round((value / cores) * 100) }
        : null,
    delta: change(value, num(itemOf(before, 'sys.load')?.fact?.value), 'load'),
    mount: null,
    series: recentValues(hostSeries(facts, host, 'sys.load'), SPARK_SCANS),
  }
}

function memoryKpi(
  items: readonly Item[],
  before: readonly Item[],
  facts: readonly ScanFact[],
  host: string,
): Kpi {
  const item = itemOf(items, 'sys.mem')
  const available = num(item?.fact?.value)
  const data = dataOf(item?.fact)
  const total = num(data.total)
  const free = num(data.available)
  const bytes = total !== null && free !== null && total > 0
  const used = bytes ? total - free : available === null ? null : 100 - available

  const prior = itemOf(before, 'sys.mem')
  const priorData = dataOf(prior?.fact)
  const priorTotal = num(priorData.total)
  const priorFree = num(priorData.available)
  const priorAvailable = num(prior?.fact?.value)
  const priorUsed =
    bytes && priorTotal !== null && priorFree !== null
      ? priorTotal - priorFree
      : !bytes && priorAvailable !== null
        ? 100 - priorAvailable
        : null
  const series = hostSeries(facts, host, 'sys.mem').map((p) => ({ ...p, value: 100 - p.value }))
  return {
    id: 'memory',
    level: level(item),
    reason: reason(item),
    staleSince: staleSince(item),
    value: used,
    unit: bytes ? 'bytes' : '%',
    of: bytes ? total : null,
    detail: available === null ? null : { kind: 'available', pct: Math.round(available) },
    delta: change(used, priorUsed, bytes ? 'bytes' : 'pts'),
    mount: null,
    series: recentValues(series, SPARK_SCANS),
  }
}

/** The filesystem the disk card reads: the fullest one, `/` on a tie. */
export function fullestDisk(items: readonly Item[]): Item | undefined {
  let best: Item | undefined
  let bestPct = -1
  for (const item of items) {
    if (item.key.check !== 'disk.fs') continue
    const pct = num(dataOf(item.fact).pct)
    if (pct === null) continue
    if (pct > bestPct || (pct === bestPct && item.key.target === '/')) {
      best = item
      bestPct = pct
    }
  }
  return best ?? itemOf(items, 'disk.fs')
}

function diskKpi(
  items: readonly Item[],
  before: readonly Item[],
  facts: readonly ScanFact[],
  host: string,
): Kpi {
  const item = fullestDisk(items)
  const mount = item?.key.target ?? null
  const data = dataOf(item?.fact)
  const pct = num(data.pct)
  const prior = mount === null ? undefined : itemOf(before, 'disk.fs', mount)
  const priorData = dataOf(prior?.fact)
  const used = num(data.used)
  const priorUsed = num(priorData.used)
  return {
    id: 'disk',
    level: level(item),
    reason: reason(item),
    staleSince: staleSince(item),
    value: pct,
    unit: '%',
    of: null,
    detail: null,
    delta: change(
      pct,
      num(priorData.pct),
      'pts',
      used !== null && priorUsed !== null ? used - priorUsed : null,
    ),
    mount,
    series:
      mount === null
        ? []
        : recentValues(hostSeries(facts, host, 'disk.fs', 'data.pct', mount), SPARK_SCANS),
  }
}

function swapKpi(
  items: readonly Item[],
  before: readonly Item[],
  facts: readonly ScanFact[],
  host: string,
): Kpi {
  const item = itemOf(items, 'sys.swap')
  const value = num(item?.fact?.value)
  return {
    id: 'swap',
    level: level(item),
    reason: reason(item),
    staleSince: staleSince(item),
    value,
    unit: '%',
    of: null,
    detail: num(dataOf(item?.fact).total) === 0 ? { kind: 'noSwap' } : null,
    delta: change(value, num(itemOf(before, 'sys.swap')?.fact?.value), 'pts'),
    mount: null,
    series: recentValues(hostSeries(facts, host, 'sys.swap'), SPARK_SCANS),
  }
}

/** The four cards, in the board's order. `before` is the baseline scan's items (empty without one). */
export function buildKpis(
  items: readonly Item[],
  before: readonly Item[],
  facts: readonly ScanFact[],
  host: string,
): Kpi[] {
  return [
    loadKpi(items, before, facts, host),
    memoryKpi(items, before, facts, host),
    diskKpi(items, before, facts, host),
    swapKpi(items, before, facts, host),
  ]
}

export type DeltaTone = 'warn' | 'crit' | 'ok' | 'plain'

/**
 * The colour of a change: the card's own band when it is past one and the value went up (more
 * of it is worse), green when it went down, plain otherwise.
 */
export function deltaTone(kpi: Kpi): DeltaTone {
  const d = kpi.delta
  if (!d || d.direction === 'flat') return 'plain'
  if (d.direction === 'down') return 'ok'
  return kpi.level === 'warn' ? 'warn' : kpi.level === 'crit' ? 'crit' : 'plain'
}
