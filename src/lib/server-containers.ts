// The containers table of the server page: every Compose container on the host across the
// projects that run there, with what changed since the baseline scan. Restarts that grew turn
// the row amber.
import type { Item } from '@/api'
import { parseCompose, type ServiceView } from './project-containers'
import { itemOf } from './server-facts'

export type ContainerTone = 'ok' | 'warn' | 'crit' | 'idle'

export interface ContainerRow {
  id: string
  name: string
  /** The Compose project the container belongs to. */
  compose: string
  /** The Daminus project that owns the Compose project, when one does. */
  owner: string | null
  state: string
  cpu: number | null
  mem: number | null
  restarts: number
  /** Restarts since the baseline scan; `null` when the container was not there. */
  grew: number | null
  tone: ContainerTone
}

export interface Containers {
  rows: ContainerRow[]
  /** Compose projects that have a container on the host. */
  projects: number
  running: number
}

function restartsBefore(before: readonly Item[], compose: string, name: string): number | null {
  const prior = itemOf(before, 'docker.compose', compose)
  const view = prior ? parseCompose(prior) : null
  const service = view?.services.find((s) => s.name === name)
  return service ? service.restarts : null
}

function toneOf(service: ServiceView, grew: boolean): ContainerTone {
  if (service.state === 'running') return grew ? 'warn' : 'ok'
  return service.oom || (service.exit !== null && service.exit !== 0) ? 'crit' : 'idle'
}

export function buildContainers(items: readonly Item[], before: readonly Item[]): Containers {
  const rows: ContainerRow[] = []
  const composes = new Set<string>()
  for (const item of items) {
    if (item.key.check !== 'docker.compose') continue
    const view = parseCompose(item)
    if (!view) continue
    composes.add(view.project)
    for (const service of view.services) {
      const prior = restartsBefore(before, view.project, service.name)
      const grew = prior === null ? null : service.restarts - prior
      rows.push({
        id: `${view.project}\u0000${service.name}`,
        name: service.name,
        compose: view.project,
        owner: item.owner.kind === 'project' ? item.owner.id : null,
        state: service.state,
        cpu: service.cpu,
        mem: service.mem,
        restarts: service.restarts,
        grew,
        tone: toneOf(service, grew !== null && grew > 0),
      })
    }
  }
  rows.sort((a, b) => a.compose.localeCompare(b.compose) || a.name.localeCompare(b.name))
  return {
    rows,
    projects: composes.size,
    running: rows.filter((r) => r.state === 'running').length,
  }
}
