// Builders for report items and raw facts in tests of the server page and the scan history.
import type { CheckFact, Item, ScanFact, Severity } from '@/api'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'

export interface ItemSpec {
  host?: string
  check: string
  target?: string
  level?: Severity
  value?: number
  unit?: string
  data?: { [key: string]: JsonValue }
  owner?: Item['owner']
  disposition?: Item['disposition']
  delta?: Item['delta']
}

export function item(spec: ItemSpec): Item {
  const host = spec.host ?? 'vps-a'
  const target = spec.target ?? ''
  const fact: CheckFact = {
    check: spec.check,
    target,
    ...(spec.value === undefined ? {} : { value: spec.value }),
    ...(spec.unit === undefined ? {} : { unit: spec.unit }),
    ...(spec.data === undefined ? {} : { data: spec.data }),
  }
  return {
    key: { host, check: spec.check, target },
    group: 'disk',
    owner: spec.owner ?? { kind: 'server', host },
    severity: spec.level ?? { level: 'ok' },
    disposition: spec.disposition ?? { kind: 'active' },
    delta: spec.delta ?? null,
    fact,
  }
}

const DAY = 86_400_000
export const T0 = Date.UTC(2026, 8, 15, 6, 40)

/** One raw fact per scan, a day apart from `T0`, on `host`. */
export function factSeries(
  host: string,
  check: string,
  values: readonly number[],
  options: { target?: string; field?: 'value' | string; gap?: number } = {},
): ScanFact[] {
  const { target = '', field = 'value', gap = DAY } = options
  return values.map((v, i) => ({
    seq: i + 1,
    at: new Date(T0 + i * gap).toISOString(),
    host,
    fact: {
      check,
      target,
      ...(field === 'value' ? { value: v } : { data: { [field]: v } }),
    },
  }))
}
