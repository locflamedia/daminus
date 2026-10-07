// What a project's tabs read from the latest report: the items a project owns, one check's
// items, and typed readers over a fact's `data` (the shapes are written in the check manifest).
// Nothing here grades anything: severity, delta and staleness come from the core.
import type { CheckFact, CheckGroup, Item, Report } from '@/api'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'

export type DataRecord = { [key: string]: JsonValue | undefined }

/** The items a project owns, in report order. */
export function projectItems(report: Report | null | undefined, id: string): Item[] {
  return (report?.items ?? []).filter((i) => i.owner.kind === 'project' && i.owner.id === id)
}

export function itemsOf(items: readonly Item[], check: string): Item[] {
  return items.filter((i) => i.key.check === check)
}

export function isRecord(v: unknown): v is DataRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function dataOf(fact: CheckFact | null | undefined): DataRecord {
  return isRecord(fact?.data) ? fact.data : {}
}

export function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function bool(v: unknown): boolean {
  return v === true
}

/** `[name, bytes]` pairs of a `top` or `files` list; anything else is dropped. */
export function pairs(v: unknown): { name: string; bytes: number }[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((row) => {
    if (!Array.isArray(row)) return []
    const name = row[0]
    const bytes = num(row[1])
    return typeof name === 'string' && bytes !== null ? [{ name, bytes }] : []
  })
}

/** The group is switched off in Settings: nothing of it was evaluated. */
export function groupOff(report: Report | null | undefined, group: CheckGroup): boolean {
  return report?.disabled_groups.includes(group) === true
}

/** The reason an item has no answer, when the core says so. */
export function unknownReason(item: Item): string | null {
  return item.severity.level === 'unknown' ? item.severity.reason : null
}

/** Scan in which a stale item was last really checked; `null` when it is current. */
export function staleSince(item: Item): number | null {
  return item.disposition.kind === 'stale' ? item.disposition.since_seq : null
}
