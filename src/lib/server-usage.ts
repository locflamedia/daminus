// "What uses it" on the server page: the project folders `du` sized, the Docker total and the
// big log files, largest first with the change since the baseline scan. A big log is tagged on
// the folder that holds it; one outside every folder gets its own row. Only what the facts
// hold is listed.
import type { Item } from '@/api'
import { dataOf, num } from './project-facts'
import { itemOf } from './server-facts'

export type UsageKind = 'folder' | 'docker' | 'log'

export interface UsageRow {
  id: string
  kind: UsageKind
  /** The folder or file; empty for Docker, which the screen words itself. */
  path: string
  bytes: number
  /** Change since the baseline scan; `null` when it has no figure for this row. */
  delta: number | null
  /** The biggest log inside the folder. */
  log: { name: string; bytes: number } | null
  /** Size against the largest row, 0 to 1. */
  share: number
}

export interface Usage {
  rows: UsageRow[]
  /** Docker build cache that `docker system df` calls reclaimable. */
  reclaimable: number | null
}

/** Rows the card lists. */
export const USAGE_ROWS = 5

function sizeOf(item: Item | undefined): number | null {
  return num(item?.fact?.value)
}

function baseDelta(
  bytes: number,
  before: readonly Item[],
  check: string,
  target: string,
): number | null {
  const prior = sizeOf(itemOf(before, check, target))
  return prior === null ? null : bytes - prior
}

function leaf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The longest folder that holds `file`, by path. */
function holder(file: string, folders: readonly UsageRow[]): UsageRow | undefined {
  let best: UsageRow | undefined
  for (const folder of folders) {
    const inside = file.startsWith(folder.path.endsWith('/') ? folder.path : `${folder.path}/`)
    if (inside && (!best || folder.path.length > best.path.length)) best = folder
  }
  return best
}

export function buildUsage(items: readonly Item[], before: readonly Item[]): Usage {
  const folders: UsageRow[] = []
  for (const item of items) {
    const bytes = sizeOf(item)
    if (item.key.check !== 'disk.path' || bytes === null || bytes <= 0) continue
    folders.push({
      id: `folder:${item.key.target}`,
      kind: 'folder',
      path: item.key.target,
      bytes,
      delta: baseDelta(bytes, before, 'disk.path', item.key.target),
      log: null,
      share: 0,
    })
  }

  const rows = [...folders]
  for (const item of items) {
    const bytes = sizeOf(item)
    if (item.key.check !== 'logs.big' || bytes === null || bytes <= 0 || !item.key.target) continue
    const home = holder(item.key.target, folders)
    if (home) {
      const index = rows.indexOf(home)
      if (!home.log || home.log.bytes < bytes) {
        rows[index] = { ...home, log: { name: leaf(item.key.target), bytes } }
      }
      continue
    }
    rows.push({
      id: `log:${item.key.target}`,
      kind: 'log',
      path: item.key.target,
      bytes,
      delta: baseDelta(bytes, before, 'logs.big', item.key.target),
      log: null,
      share: 0,
    })
  }

  const docker = itemOf(items, 'docker.df')
  const dockerBytes = sizeOf(docker)
  if (dockerBytes !== null && dockerBytes > 0) {
    rows.push({
      id: 'docker',
      kind: 'docker',
      path: '',
      bytes: dockerBytes,
      delta: baseDelta(dockerBytes, before, 'docker.df', ''),
      log: null,
      share: 0,
    })
  }

  const top = rows.sort((a, b) => b.bytes - a.bytes).slice(0, USAGE_ROWS)
  const max = top[0]?.bytes ?? 0
  const cache = dataOf(docker?.fact).build_cache
  const reclaimable =
    typeof cache === 'object' && cache !== null && !Array.isArray(cache)
      ? num(cache.reclaimable)
      : null
  return {
    rows: top.map((row) => ({ ...row, share: max > 0 ? row.bytes / max : 0 })),
    reclaimable: reclaimable !== null && reclaimable > 0 ? reclaimable : null,
  }
}
