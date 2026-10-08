// An item of the report as the one-line issue text reads it (`issueText`): the check picks the
// sentence, the target and the measured value fill it. Shared by the server page's findings and
// the scan history's compare rows, so both word an issue the way the cards do.
import type { Item, MainIssue } from '@/api'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'

export function itemIssue(item: Item): MainIssue {
  const params: { [key: string]: JsonValue } = { target: item.key.target }
  const value = item.fact?.value
  if (typeof value === 'number' && Number.isFinite(value)) {
    params.value = value
    if (item.fact?.unit) params.unit = item.fact.unit
  }
  return { key: item.key, severity: item.severity, params }
}

export type OpenLevel = 'crit' | 'warn'

/** The item counts as an open issue: a warning or critical result that stands as it is. */
export function openLevel(item: Item): OpenLevel | null {
  if (item.disposition.kind !== 'active') return null
  const level = item.severity.level
  return level === 'crit' || level === 'warn' ? level : null
}

export function itemId(item: Item): string {
  const { host, check, target } = item.key
  return `${host}\u0000${check}\u0000${target}`
}
