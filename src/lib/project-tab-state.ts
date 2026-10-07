// Which of its states a project tab is in, from what the report and the saved project say:
// the group switched off in Settings, no part of that kind, hosts that did not answer, results
// that were not re-checked. Loading and error belong to the stores, not to this.
import type { CheckGroup, Component, Item, Project, ProjectRollup, Report } from '@/api'
import { groupOff, staleSince } from './project-facts'

export type TabStatus = 'off' | 'empty' | 'unreachable' | 'waiting' | 'normal'

export interface TabState {
  status: TabStatus
  /** Hosts of the tab's parts that did not answer the latest scan. */
  unreachable: string[]
  /** Oldest scan any shown result was last really checked in; `null` when all are current. */
  staleSince: number | null
}

/** The saved parts of one kind. */
export function partsOf<K extends Component['kind']>(
  project: Project | undefined,
  kind: K,
): Extract<Component, { kind: K }>[] {
  return (project?.components ?? []).filter(
    (c): c is Extract<Component, { kind: K }> => c.kind === kind,
  )
}

/** The oldest `since_seq` among stale items; `null` when none is stale. */
export function oldestStale(items: readonly Item[]): number | null {
  let out: number | null = null
  for (const item of items) {
    const since = staleSince(item)
    if (since !== null && (out === null || since < out)) out = since
  }
  return out
}

export function tabState(args: {
  report: Report | null | undefined
  group: CheckGroup
  parts: readonly Component[]
  rollup?: ProjectRollup
  items: readonly Item[]
}): TabState {
  const { report, group, parts, rollup, items } = args
  const hosts = new Set(parts.map((p) => p.host))
  const unreachable = (rollup?.unreachable_hosts ?? []).filter((h) => hosts.has(h))
  const stale = oldestStale(items)
  if (groupOff(report, group)) return { status: 'off', unreachable: [], staleSince: null }
  if (parts.length === 0) return { status: 'empty', unreachable: [], staleSince: null }
  if (items.length === 0) {
    return {
      status: unreachable.length > 0 ? 'unreachable' : 'waiting',
      unreachable,
      staleSince: null,
    }
  }
  return { status: 'normal', unreachable, staleSince: stale }
}
