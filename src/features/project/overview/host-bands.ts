// Lays the wiring out as the diagram draws it: one band per server, holding that server's front
// end, back end and worker parts stacked; a database on a server that already has a band gets
// its own "data" band next to it.
import type { Tier, WireBand, WireNode } from '@/lib/project-overview'

const TIER_RANK: Record<Tier, number> = { fe: 0, app: 1, db: 2 }

export function hostBands(bands: readonly WireBand[]): WireBand[] {
  const out: WireBand[] = []
  for (const band of bands) {
    if (band.tier === 'db') {
      const data = out.some((b) => b.host === band.host)
      out.push({ ...band, data, nodes: [...band.nodes] })
      continue
    }
    const at = out.findIndex((b) => b.host === band.host && b.tier !== 'db')
    const host = out[at]
    if (host === undefined) {
      out.push({ ...band, data: false, nodes: [...band.nodes] })
      continue
    }
    const nodes = [...host.nodes, ...band.nodes].sort(
      (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier],
    )
    out[at] = { ...host, nodes }
  }
  return out
}

export interface WireLink {
  from: WireNode
  fromBand: number
  to: WireNode
  toBand: number
}

/** Requests flow from each part to the parts of the next tier that has any, on another band. */
export function wireLinks(bands: readonly WireBand[]): WireLink[] {
  const all = bands.flatMap((b, i) => b.nodes.map((node) => ({ node, band: i })))
  const out: WireLink[] = []
  for (const a of all) {
    const later = all.map((x) => TIER_RANK[x.node.tier]).filter((r) => r > TIER_RANK[a.node.tier])
    if (later.length === 0) continue
    const next = Math.min(...later)
    for (const b of all) {
      if (TIER_RANK[b.node.tier] !== next || b.band === a.band) continue
      out.push({ from: a.node, fromBand: a.band, to: b.node, toBand: b.band })
    }
  }
  return out
}
