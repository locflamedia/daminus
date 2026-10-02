// Builders for `Report` values in tests, so each test states only what it cares about.
import type { Counts, Item, MainIssue, ProjectRollup, Report, ServerRollup } from '@/api'

export const NOW = '2026-09-26T13:42:00Z'

export function counts(partial: Partial<Counts> = {}): Counts {
  return { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0, ...partial }
}

export function project(id: string, partial: Partial<ProjectRollup> = {}): ProjectRollup {
  return {
    id,
    level: 'ok',
    counts: counts(),
    unreachable_hosts: [],
    not_scanned_hosts: [],
    ...partial,
  }
}

export function server(host: string, partial: Partial<ServerRollup> = {}): ServerRollup {
  return {
    host,
    outcome: { state: 'reached' },
    included: true,
    level: 'ok',
    counts: counts(),
    used_by: [],
    ...partial,
  }
}

export function diskItem(host: string, pct: number, target = '/'): Item {
  return {
    key: { host, check: 'disk.fs', target },
    group: 'disk',
    owner: { kind: 'server', host },
    severity: { level: 'ok' },
    disposition: { kind: 'active' },
    fact: { check: 'disk.fs', target, data: { pct, ipct: 1 } },
  }
}

export function mainIssue(check: string, params: MainIssue['params'] = {}): MainIssue {
  return {
    key: { host: 'vps-a', check, target: '' },
    params,
    severity: { level: 'warn' },
  }
}

export function report(partial: Partial<Report> = {}): Report {
  const projects = partial.projects ?? []
  return {
    seq: 12,
    scanned_at: NOW,
    evaluated_at: NOW,
    items: [],
    projects,
    servers: [],
    disabled_groups: [],
    rules_due: [],
    counts: counts(),
    ...partial,
  }
}
