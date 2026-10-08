import { describe, expect, it } from 'vitest'
import type { Item, Project, Report } from '@/api'
import { oldestStale, partsOf, tabState } from './project-tab-state'

const project: Project = {
  id: 'p',
  name: 'p',
  urls: [],
  components: [
    { role: 'be', host: 'h1', kind: 'compose', project: 'x' },
    { role: 'db', host: 'h2', kind: 'db', engine: 'postgres', database: 'd', env_file: '/e' },
  ],
}
const report = (off: Report['disabled_groups'] = []) => ({ disabled_groups: off }) as Report
const item = (since?: number) =>
  ({
    disposition: since === undefined ? { kind: 'active' } : { kind: 'stale', since_seq: since },
  }) as Item

describe('project tab state', () => {
  it('picks the parts of one kind', () => {
    expect(partsOf(project, 'compose')).toHaveLength(1)
    expect(partsOf(project, 'pm2')).toHaveLength(0)
  })

  it('says off when the group is switched off in Settings', () => {
    const s = tabState({
      report: report(['containers']),
      group: 'containers',
      parts: partsOf(project, 'compose'),
      items: [],
    })
    expect(s.status).toBe('off')
  })

  it('says empty when the project has no part of that kind', () => {
    const s = tabState({ report: report(), group: 'containers', parts: [], items: [] })
    expect(s.status).toBe('empty')
  })

  it('says unreachable when no result exists and the host did not answer', () => {
    const s = tabState({
      report: report(),
      group: 'containers',
      parts: partsOf(project, 'compose'),
      rollup: { unreachable_hosts: ['h1', 'h9'] } as never,
      items: [],
    })
    expect(s).toMatchObject({ status: 'unreachable', unreachable: ['h1'] })
  })

  it('says waiting when nothing was scanned yet and no host failed', () => {
    const s = tabState({
      report: report(),
      group: 'containers',
      parts: partsOf(project, 'compose'),
      items: [],
    })
    expect(s.status).toBe('waiting')
  })

  it('keeps showing results that are stale and names the oldest scan', () => {
    const items = [item(5), item(3), item()]
    expect(oldestStale(items)).toBe(3)
    const s = tabState({
      report: report(),
      group: 'containers',
      parts: partsOf(project, 'compose'),
      rollup: { unreachable_hosts: ['h1'] } as never,
      items,
    })
    expect(s).toMatchObject({ status: 'normal', staleSince: 3 })
  })
})
