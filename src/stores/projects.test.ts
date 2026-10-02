import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { counts, diskItem, project, report, server } from '@/testing/report-fixture'
import { useProjectsStore } from './projects'
import { useReportStore } from './report'

beforeEach(() => setActivePinia(createPinia()))

describe('useProjectsStore', () => {
  it('is empty before any report', () => {
    const store = useProjectsStore()
    expect(store.projects).toEqual([])
    expect(store.servers).toEqual([])
    expect(store.issues).toBe(0)
    expect(store.disk('vps-a')).toBeNull()
  })

  it('lists projects and servers by severity, and counts issues', () => {
    useReportStore().remember(report())
    useReportStore().latest = report({
      counts: counts({ crit: 2, warn: 3, expected: 2 }),
      projects: [
        project('booking'),
        project('tiemtra', { level: 'warn', counts: counts({ warn: 2 }) }),
        project('kho-hang', { level: 'crit', counts: counts({ crit: 3 }) }),
      ],
      servers: [server('db-main'), server('vps-sg-2', { level: 'warn' })],
      items: [diskItem('vps-sg-2', 87)],
    })
    const store = useProjectsStore()
    expect(store.projects.map((p) => p.id)).toEqual(['kho-hang', 'tiemtra', 'booking'])
    expect(store.servers.map((s) => s.host)).toEqual(['vps-sg-2', 'db-main'])
    expect(store.issues).toBe(5)
    expect(store.disk('vps-sg-2')).toBe(87)
    expect(store.project('tiemtra')?.counts.warn).toBe(2)
    expect(store.server('db-main')?.included).toBe(true)
    expect(store.project('nope')).toBeUndefined()
  })
})

describe('useProjectsStore details', () => {
  const saved = (id: string, color: string | null, urls: string[] = []) => ({
    id,
    name: id,
    color,
    urls,
    components: [],
  })

  it('gives the colour of a project only when it is a plain #rrggbb', () => {
    const store = useProjectsStore()
    store.details = [
      saved('a', '#E0649A'),
      saved('b', 'red'),
      saved('c', 'url(javascript:alert(1))'),
      saved('d', null),
    ]
    expect(store.color('a')).toBe('#E0649A')
    expect(store.color('b')).toBeNull()
    expect(store.color('c')).toBeNull()
    expect(store.color('d')).toBeNull()
    expect(store.color('missing')).toBeNull()
  })

  it('gives the host of the first URL for the project header', () => {
    const store = useProjectsStore()
    store.details = [
      saved('a', null, ['https://khohang.vn/app', 'https://other.vn']),
      saved('b', null, ['not a url']),
      saved('c', null),
    ]
    expect(store.domain('a')).toBe('khohang.vn')
    expect(store.domain('b')).toBeNull()
    expect(store.domain('c')).toBeNull()
  })
})
