// Small builders for results of the security checks, for tests and the development mock.
import type { CheckGroup, Item, Severity } from '@/api'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'

const GROUPS: Record<string, CheckGroup> = {
  'sec.recent_change': 'code_changes',
  'url.http': 'uptime',
  'url.tls': 'uptime',
}

export interface ItemSpec {
  check: string
  host?: string
  target?: string
  project?: string
  level?: Severity
  value?: number | null
  unit?: string
  data?: Record<string, JsonValue>
  disposition?: Item['disposition']
  delta?: Item['delta']
  unknown?: 'needs_perm' | 'timeout' | 'unreachable' | 'missing' | 'unsupported'
}

export function secItem(spec: ItemSpec): Item {
  const host = spec.host ?? (spec.check.startsWith('url.') ? '@local' : 'vps-1')
  const target = spec.target ?? ''
  return {
    key: { host, check: spec.check, target },
    group: GROUPS[spec.check] ?? 'security',
    owner: { kind: 'project', id: spec.project ?? 'shop' },
    severity: spec.level ?? { level: 'ok' },
    disposition: spec.disposition ?? { kind: 'active' },
    delta: spec.delta ?? null,
    fact: {
      check: spec.check,
      target,
      value: spec.value === undefined ? 0 : spec.value,
      unit: spec.unit ?? 'count',
      data: spec.data ?? {},
      ...(spec.unknown ? { unknown: spec.unknown } : {}),
    },
  }
}
