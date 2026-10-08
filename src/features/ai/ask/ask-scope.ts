// What an Ask or a Findings screen is about: the whole report, one project or one server. The
// scope names the thread (one per scope, kept in memory). A finding's result comes from the
// event (Rust resolves the id from the payload that was sent), never from this file.
import type { Item, PreviewScope, Report } from '@/api'

export type AskScope = PreviewScope

/** A stable name for a scope: the key of its thread. */
export function scopeKey(scope: AskScope): string {
  switch (scope.kind) {
    case 'project':
      return `project:${scope.id}`
    case 'server':
      return `server:${scope.host}`
    default:
      return 'whole'
  }
}

/** The scope of the page the person is on: a project, a server, else everything. */
export function scopeFromRoute(route: {
  name?: string | symbol | null
  params: Record<string, unknown>
}): AskScope {
  const id = route.params.id
  const host = route.params.host
  if (route.name === 'project' && typeof id === 'string') return { kind: 'project', id }
  if (route.name === 'server' && typeof host === 'string') return { kind: 'server', host }
  return { kind: 'whole' }
}

/** Whether a result belongs to `scope`; the same rule as `in_scope` in the payload builder. */
export function inScope(item: Item, scope: AskScope): boolean {
  switch (scope.kind) {
    case 'project':
      return item.owner.kind === 'project' && item.owner.id === scope.id
    case 'server':
      return item.key.host === scope.host
    default:
      return true
  }
}

/** How many results of the report the scope covers: what a question reads. */
export function countInScope(report: Report | null, scope: AskScope): number {
  return report ? report.items.filter((item) => inScope(item, scope)).length : 0
}
