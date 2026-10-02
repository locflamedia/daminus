import { describe, expect, it } from 'vitest'
import { layoutServers, layoutTopology, roleOf, type TopologyInput } from './topology'

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

describe('roleOf', () => {
  it('reads the role from the label, case and spaces aside', () => {
    expect(roleOf({ label: 'FE' })).toBe('fe')
    expect(roleOf({ label: ' Worker ' })).toBe('worker')
    expect(roleOf({ label: 'APP' })).toBe('app')
    expect(roleOf({ label: 'cache' })).toBe('other')
  })

  it('prefers the role it is given', () => {
    expect(roleOf({ label: 'Queue', role: 'worker' })).toBe('worker')
  })
})

describe('layoutServers', () => {
  it('puts neighbours on one server in one node', () => {
    const view = layoutServers([
      node('fe', 'ok', 'vps-sg-1'),
      node('be', 'ok', 'vps-sg-2'),
      node('db', 'warn', 'vps-sg-2'),
    ])
    expect(view.groups.map((g) => [g.host, g.roles.map((r) => r.label), g.state])).toEqual([
      ['vps-sg-1', ['FE'], 'ok'],
      ['vps-sg-2', ['BE', 'DB'], 'warn'],
    ])
    expect(view.hidden).toBe(0)
  })

  it('keeps one node for a project on a single server', () => {
    const view = layoutServers([
      node('fe', 'ok', 'a'),
      node('be', 'ok', 'a'),
      node('db', 'ok', 'a'),
    ])
    expect(view.groups).toHaveLength(1)
    expect(view.groups[0]?.roles.map((r) => r.role)).toEqual(['fe', 'be', 'db'])
  })

  it('starts a new node where the server changes back', () => {
    const view = layoutServers(
      [node('fe', 'ok', 'a'), node('be', 'ok', 'b'), node('db', 'ok', 'a')],
      Infinity,
    )
    expect(view.groups.map((g) => g.host)).toEqual(['a', 'b', 'a'])
  })

  it('shows the first two servers in discovery order and folds the rest into +N', () => {
    const view = layoutServers([
      node('a', 'ok', '1'),
      node('b', 'ok', '2'),
      node('c', 'crit', '3'),
      node('d', 'ok', '4'),
    ])
    expect(view.groups.map((g) => g.host)).toEqual(['1', '2'])
    expect(view.hidden).toBe(2)
    expect(view.folded.map((g) => g.host)).toEqual(['3', '4'])
  })

  it('does not fold two servers, and shows every server when asked for a list', () => {
    const three = [node('a', 'ok', '1'), node('b', 'ok', '2'), node('c', 'ok', '3')]
    expect(layoutServers(three.slice(0, 2)).hidden).toBe(0)
    expect(layoutServers(three, Infinity).groups).toHaveLength(3)
  })
})
