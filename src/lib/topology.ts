// The URL -> front end -> back end -> database strip of a project: which nodes show, which
// fold into "+N", and where a server name is worth printing.
export type NodeState = 'ok' | 'warn' | 'crit' | 'unknown'

/** What a component does; it picks the colour of its letters on the Overview cards. */
export type TopologyRole = 'fe' | 'be' | 'db' | 'app' | 'worker' | 'other'

export interface TopologyInput {
  id: string
  /** Short role: FE, BE, DB, Worker. */
  label: string
  /** Defaults to what `label` spells (FE, BE, DB, APP, WORKER). */
  role?: TopologyRole
  /** The server the component runs on; `null` when it is not known. */
  host?: string | null
  state: NodeState
}

export interface TopologyNodeView extends TopologyInput {
  /** The server name is printed only when it differs from the node before it. */
  showHost: boolean
}

export interface TopologyView {
  nodes: TopologyNodeView[]
  /** Components folded into the "+N" node. */
  hidden: number
}

/** Up to four components follow the URL. */
export const TOPOLOGY_MAX = 4

const SEVERITY: Record<NodeState, number> = { crit: 3, warn: 2, unknown: 1, ok: 0 }

/**
 * Keeps at most `max` components, in request order. When more exist, the healthiest fold
 * first, so a failing part is never hidden behind "+N". The server label shows on a node
 * only when its host differs from the one before; the first node always names its server.
 */
export function layoutTopology(
  components: readonly TopologyInput[],
  max = TOPOLOGY_MAX,
): TopologyView {
  let kept = components.map((c, index) => ({ c, index }))
  if (kept.length > max) {
    kept = [...kept]
      .sort((a, b) => SEVERITY[b.c.state] - SEVERITY[a.c.state] || a.index - b.index)
      .slice(0, max)
      .sort((a, b) => a.index - b.index)
  }
  let previous: string | null = null
  const nodes = kept.map(({ c }) => {
    const host = c.host ?? null
    const showHost = host !== null && host !== previous
    previous = host ?? previous
    return { ...c, showHost }
  })
  return { nodes, hidden: components.length - nodes.length }
}

/** The role of a component: the one given, else what its label spells. */
export function roleOf(input: Pick<TopologyInput, 'label' | 'role'>): TopologyRole {
  if (input.role) return input.role
  switch (input.label.trim().toLowerCase()) {
    case 'fe':
      return 'fe'
    case 'be':
      return 'be'
    case 'db':
      return 'db'
    case 'app':
      return 'app'
    case 'worker':
      return 'worker'
    default:
      return 'other'
  }
}

export interface ServerGroup {
  /** The server the components share; `null` when it is not known. */
  host: string | null
  roles: Array<{ id: string; label: string; role: TopologyRole }>
  /** The worst state among its components. */
  state: NodeState
}

export interface ServerGroupsView {
  groups: ServerGroup[]
  /** Servers folded into the "+N" node. */
  hidden: number
}

/**
 * The Overview card's form: components that follow each other on the same server share one
 * node ("FE BE DB vps-hn-3"), and a node appears again only where the server changes. At
 * most `max` nodes show; past that the healthiest groups fold, so a failing part stays.
 */
export function layoutServers(
  components: readonly TopologyInput[],
  max = TOPOLOGY_MAX,
): ServerGroupsView {
  const all: ServerGroup[] = []
  for (const c of components) {
    const host = c.host ?? null
    const last = all.at(-1)
    const role = { id: c.id, label: c.label, role: roleOf(c) }
    if (last && last.host === host) {
      last.roles.push(role)
      if (SEVERITY[c.state] > SEVERITY[last.state]) last.state = c.state
    } else {
      all.push({ host, roles: [role], state: c.state })
    }
  }
  if (all.length <= max) return { groups: all, hidden: 0 }
  const kept = all
    .map((group, index) => ({ group, index }))
    .sort((a, b) => SEVERITY[b.group.state] - SEVERITY[a.group.state] || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map(({ group }) => group)
  return { groups: kept, hidden: all.length - kept.length }
}
