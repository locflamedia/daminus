// The words of a part: the second line of its node and the state cell of its row. Pure text built
// from the part's own data; the translator and the formatters come from the caller.
import type { PartRow } from '@/lib/project-overview'

type T = (key: string, params?: Record<string, unknown>, plural?: number) => string
type Bytes = (value: number) => string

/** The second line under a node's name. */
export function nodeLine(row: PartRow, t: T, bytes: Bytes): string {
  const s = row.state
  switch (s.kind) {
    case 'pm2':
      if (s.restarts > 0)
        return t('projectOverview.wiring.pm2Restarts', { n: s.restarts }, s.restarts)
      return s.instances === null
        ? t('projectOverview.wiring.pm2Status', { status: s.status || '—' })
        : t('projectOverview.wiring.pm2', { n: s.instances }, s.instances)
    case 'compose':
      if (s.restarts > 0)
        return t('projectOverview.wiring.composeRestarts', { n: s.restarts }, s.restarts)
      return s.down > 0
        ? t('projectOverview.wiring.composeDown', { down: s.down })
        : t('projectOverview.wiring.compose', { up: s.up })
    case 'db':
      if (s.bytes === null) return t('projectOverview.wiring.unknown')
      return s.tables === null
        ? t('projectOverview.wiring.dbSize', { size: bytes(s.bytes) })
        : t('projectOverview.wiring.db', { size: bytes(s.bytes), tables: s.tables })
    case 'size':
      return t('projectOverview.wiring.path', { size: bytes(s.bytes) })
    default:
      return t('projectOverview.wiring.unknown')
  }
}

/** The state cell of a row of the parts table. */
export function stateCell(row: PartRow, t: T, bytes: Bytes): string {
  const s = row.state
  switch (s.kind) {
    case 'pm2':
      return s.instances === null
        ? t('projectOverview.parts.status', { status: s.status || '—' })
        : t('projectOverview.parts.online', { status: s.status || '—', n: s.instances })
    case 'compose':
      if (s.restarts > 0) return t('projectOverview.parts.restarts', { n: s.restarts }, s.restarts)
      return s.down > 0
        ? t('projectOverview.parts.down', { n: s.down })
        : t('projectOverview.parts.up', { n: s.up })
    case 'db':
      return s.bytes === null ? t('projectOverview.parts.notRead') : bytes(s.bytes)
    case 'size':
      return bytes(s.bytes)
    default:
      return t('projectOverview.parts.notRead')
  }
}

/** The name on a node: a path shows its last folder. */
export function shortName(row: PartRow): string {
  if (row.kind !== 'path') return row.name
  return row.name.split('/').filter(Boolean).pop() ?? row.name
}
