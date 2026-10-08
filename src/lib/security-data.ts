// Typed readers over the loose `data` of a check fact, for the Security tab. A fact's `data`
// is JSON the check scripts write; every read here answers `undefined` (or an empty list) for a
// shape it does not recognise, so a changed script never breaks the screen.
import type { CheckFact, Item } from '@/api'

export type Data = Record<string, unknown>

export function factData(fact: CheckFact | null | undefined): Data {
  const data = fact?.data
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Data) : {}
}

export function dataOf(item: Pick<Item, 'fact'>): Data {
  return factData(item.fact)
}

export function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function bool(value: unknown): boolean {
  return value === true
}

/** The strings of a JSON list; anything else is dropped. */
export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** `[path, mtime]` pairs as the recent-change check writes them. */
export function pathTimes(value: unknown): { path: string; mtime: number }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!Array.isArray(entry)) return []
    const [path, mtime] = entry as unknown[]
    return typeof path === 'string' && typeof mtime === 'number' ? [{ path, mtime }] : []
  })
}

/** The measured number of an item's fact, when it has one. */
export function valueOf(item: Item): number | undefined {
  return num(item.fact?.value)
}
