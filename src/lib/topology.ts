// The URL -> front end -> back end -> database strip of a project: which nodes show, which
// fold into "+N", and where a server name is worth printing.
export type NodeState = 'ok' | 'warn' | 'crit' | 'unknown'

export interface TopologyInput {
  id: string
  /** Short role: FE, BE, DB, Worker. */
  label: string
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
