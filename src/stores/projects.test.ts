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
