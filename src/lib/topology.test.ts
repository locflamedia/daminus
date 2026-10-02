import { describe, expect, it } from 'vitest'
import { layoutTopology, type TopologyInput } from './topology'

const node = (id: string, state: TopologyInput['state'], host: string | null): TopologyInput => ({
  id,
  label: id.toUpperCase(),
  host,
  state,
})

describe('layoutTopology', () => {
  it('keeps request order and names a server where it changes', () => {
    const view = layoutTopology([
      node('fe', 'ok', 'vps-a'),
      node('be', 'ok', 'vps-b'),
      node('db', 'warn', 'vps-b'),
    ])
    expect(view.nodes.map((n) => [n.id, n.showHost])).toEqual([
      ['fe', true],
      ['be', true],
      ['db', false],
    ])
    expect(view.hidden).toBe(0)
  })

  it('does not repeat the server on a single-server project', () => {
    const view = layoutTopology([node('fe', 'ok', 'vps-1'), node('be', 'ok', 'vps-1')])
    expect(view.nodes.map((n) => n.showHost)).toEqual([true, false])
  })

  it('shows no server for a component whose host is unknown', () => {
    const view = layoutTopology([node('fe', 'ok', null), node('be', 'ok', 'vps-1')])
    expect(view.nodes.map((n) => n.showHost)).toEqual([false, true])
  })

  it('folds the healthiest into "+N" past four, never a failing part', () => {
    const view = layoutTopology([
      node('fe', 'ok', 'a'),
      node('be', 'crit', 'a'),
      node('db', 'warn', 'a'),
      node('worker', 'ok', 'a'),
      node('cache', 'unknown', 'a'),
      node('queue', 'ok', 'a'),
    ])
    expect(view.hidden).toBe(2)
    // be, db and cache are the worst three; the fourth slot goes to the first healthy one.
    expect(view.nodes.map((n) => n.id)).toEqual(['fe', 'be', 'db', 'cache'])
  })

  it('has no nodes for no components', () => {
    expect(layoutTopology([])).toEqual({ nodes: [], hidden: 0 })
  })
})
