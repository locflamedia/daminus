// A small window's worth of data: three projects and five servers, one of them unreachable.
// Used by the development mock and the gallery's shell section.
import type { Project, Report } from '@/api'
import { counts, diskItem, project, report, server } from './report-fixture'

const HOSTS = [
  { host: 'vps-sg-2', pct: 87, level: 'warn' as const, used: ['tiemtra', 'booking'] },
  { host: 'vps-sg-1', pct: 64, level: 'ok' as const, used: ['tiemtra'] },
  { host: 'vps-hn-3', pct: 52, level: 'ok' as const, used: ['kho-hang'] },
  { host: 'db-main', pct: 41, level: 'ok' as const, used: ['booking'] },
]

export function shellReport(): Report {
  return report({
    seq: 12,
    projects: [
      project('kho-hang', { level: 'crit', counts: counts({ crit: 2, warn: 1 }) }),
      project('tiemtra', { level: 'warn', counts: counts({ warn: 2 }) }),
      project('booking', { level: 'ok' }),
    ],
    servers: [
      ...HOSTS.map((h) =>
        server(h.host, {
          level: h.level,
          used_by: h.used,
          counts: counts({ warn: h.level === 'warn' ? 1 : 0 }),
        }),
      ),
      server('legacy-shop', {
        outcome: { state: 'unreachable', cause: 'connect_timeout' },
        level: 'ok',
        used_by: [],
      }),
    ],
    items: HOSTS.map((h) => diskItem(h.host, h.pct)),
    counts: counts({ crit: 2, warn: 3 }),
  })
}

export function shellProjects(): Project[] {
  const base = { components: [] }
  return [
    { id: 'kho-hang', name: 'kho-hang', color: '#e0649a', urls: ['https://khohang.vn'], ...base },
    { id: 'tiemtra', name: 'tiemtra', color: '#4f6bed', urls: ['https://tiemtra.vn'], ...base },
    { id: 'booking', name: 'booking', color: '#9a7bea', urls: ['https://booking.vn'], ...base },
  ]
}
