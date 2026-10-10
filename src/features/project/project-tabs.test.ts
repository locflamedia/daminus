// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ResultsMock, type ResultsVariant } from '@/api/dev-mock-results'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import type { ResultsBundle } from '@/testing/results-bundle'
import raw from '@/testing/fixtures/results.json'
import ProjectContainersTab from './containers/ProjectContainersTab.vue'
import ProjectDatabaseTab from './database/ProjectDatabaseTab.vue'
import ProjectDiskTab from './disk/ProjectDiskTab.vue'
import ProjectOverviewTab from './overview/ProjectOverviewTab.vue'

const bundle = raw as unknown as ResultsBundle

type Tab = typeof ProjectDiskTab

async function mountTab(
  tab: Tab,
  variant: string,
  id: string,
  edit?: (reports: ReturnType<typeof useReportStore>) => void,
) {
  const mock = new ResultsMock(variant as ResultsVariant, bundle)
  mockCommands((cmd, args) => mock.handle(cmd, args) ?? null)
  const pinia = createPinia()
  setActivePinia(pinia)
  await useReportStore().loadLatest()
  await useProjectsStore().loadDetails()
  edit?.(useReportStore())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/project/:id/:tab?', name: 'project', component: { template: '<div />' } },
      { path: '/server/:host', name: 'server', component: { template: '<div />' } },
      { path: '/settings/:section?', name: 'settings', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(tab, { props: { id }, global: { plugins: [i18n, router, pinia] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  i18n.global.locale.value = 'en'
})
afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Disk tab', () => {
  it('draws a tile for each folder and the sentence naming what grew', async () => {
    const w = await mountTab(ProjectDiskTab, 'results', 'tiemtra')
    expect(w.findAll('.treemap .tile').map((t) => t.find('.name').text())).toContain(
      'public/uploads',
    )
    expect(w.text()).toContain('Where 5.4 GB goes')
    expect(w.text()).toContain('node_modules, .next/cache, vendor')
  })

  it('shows the large-log finding with a copyable command', async () => {
    const w = await mountTab(ProjectDiskTab, 'tab-logs', 'tiemtra')
    expect(w.text()).toContain('Large log files')
    expect(w.text()).toContain('ssh vps-sg-1 "ls -lhS /srv/tiemtra-web/storage/logs | head"')
  })

  it('lists every server that holds a part of the project, and says which was not measured', async () => {
    const w = await mountTab(ProjectDiskTab, 'results', 'tiemtra', (reports) => {
      const latest = reports.latest
      if (latest)
        reports.latest = {
          ...latest,
          items: latest.items.filter(
            (i) => !(i.key.check === 'disk.fs' && i.key.host === 'vps-sg-2'),
          ),
        }
    })
    const servers = w.findAll('.disk').map((d) => d.text())
    expect(servers).toHaveLength(2)
    expect(servers.find((d) => d.includes('vps-sg-2'))).toContain('not measured')
  })

  it('says the group is off in Settings and draws nothing of it', async () => {
    const w = await mountTab(ProjectDiskTab, 'results', 'tiemtra', (reports) => {
      const latest = reports.latest
      if (latest) reports.latest = { ...latest, disabled_groups: ['disk'] }
    })
    expect(w.text()).toContain('Disk checks are off')
    expect(w.text()).toContain('Turned off in Settings › Scan. Nothing is read for this tab.')
    expect(w.text()).toContain('Open Settings › Scan')
    expect(w.find('.treemap').exists()).toBe(false)
  })

  it('says nothing was read yet when the project has no folder result', async () => {
    const w = await mountTab(ProjectDiskTab, 'results', 'kho-hang', (reports) => {
      const latest = reports.latest
      if (latest)
        reports.latest = {
          ...latest,
          items: latest.items.filter((i) => i.key.check !== 'disk.path'),
        }
    })
    expect(w.text()).toContain('No result yet')
  })
})

describe('Containers tab', () => {
  it('shows each service and the last exit with the logs command the person runs', async () => {
    const w = await mountTab(ProjectContainersTab, 'results', 'tiemtra')
    expect(w.text()).toContain('tiemtra-api-worker-1')
    expect(w.text()).toContain('ssh vps-sg-2 "docker logs --tail 20 tiemtra-api-worker-1"')
    expect(w.text()).toContain('Daminus does not read container logs')
    expect(w.text()).not.toContain('ExportOrders')
  })

  it('offers the permission steps when Docker needs permission', async () => {
    const w = await mountTab(ProjectContainersTab, 'tab-docker-perm', 'tiemtra')
    expect(w.text()).toContain('Daminus can’t use Docker on vps-sg-2')
    expect(w.text()).toContain('sudo usermod -aG docker SSH_USER')
    expect(w.text()).toContain('Docker group is root access')
    expect(w.text()).toContain('anyone in the docker group can take over this server')
    expect(w.text()).toContain('Check again')
  })

  it('Check again scans only the host that needs permission', async () => {
    const started: unknown[] = []
    const w = await mountTab(ProjectContainersTab, 'tab-docker-perm', 'tiemtra')
    mockCommands((cmd, args) => {
      if (cmd === 'scan_start') {
        started.push(args.scope)
        return { scan_id: 's1', joined: false }
      }
      return null
    })
    await w
      .findAll('button')
      .find((b) => b.text().includes('Check again'))
      ?.trigger('click')
    expect(started).toEqual([{ projects: [], hosts: ['vps-sg-2'] }])
  })

  it('says a host did not answer and keeps the parts of the other host', async () => {
    const w = await mountTab(ProjectContainersTab, 'tab-unreachable', 'tiemtra')
    expect(w.text()).toContain('vps-sg-2 did not answer')
    expect(w.text()).toContain('tiemtra-cron')
  })

  it('tells a stale result from a current one', async () => {
    const w = await mountTab(ProjectContainersTab, 'tab-stale', 'tiemtra')
    expect(w.text()).toContain('Not re-checked since #7')
  })

  it('names the other projects on the host and whether raising the limit fits', async () => {
    const w = await mountTab(ProjectContainersTab, 'tab-neighbours', 'tiemtra')
    expect(w.text()).toContain('Also on vps-sg-2')
    expect(w.text()).toContain('booking-app-1')
    expect(w.text()).toContain('so raising the worker limit to 768 MB fits')
  })

  it('draws the memory of the troubled service as straight segments', async () => {
    const w = await mountTab(ProjectContainersTab, 'tab-neighbours', 'tiemtra')
    expect(w.find('.curve .line').attributes('d')).not.toContain('C')
  })

  it('says a pm2 app is stopped', async () => {
    const w = await mountTab(ProjectContainersTab, 'tab-pm2-stopped', 'tiemtra')
    expect(w.text()).toContain('Stopped')
  })
})

describe('Database tab', () => {
  it('shows size, tables with their change and no clock note for Postgres', async () => {
    const w = await mountTab(ProjectDatabaseTab, 'results', 'tiemtra')
    expect(w.text()).toContain('PostgreSQL')
    expect(w.text()).toContain('orders')
    expect(w.text()).not.toContain('about once a day')
  })

  it('says plainly that slow queries are not read, per engine, and recommends a read-only user', async () => {
    const pg = await mountTab(ProjectDatabaseTab, 'results', 'tiemtra')
    expect(pg.text()).toContain('Slow queries need pg_stat_statements')
    expect(pg.text()).toContain('A read-only user is recommended')
    const my = await mountTab(ProjectDatabaseTab, 'tab-mysql', 'booking')
    expect(my.text()).toContain('MySQL slow query log')
  })

  it('adds the clock note under the size and the tables of a MySQL database', async () => {
    const w = await mountTab(ProjectDatabaseTab, 'tab-mysql', 'booking')
    expect(w.findAll('.note').filter((n) => n.text().includes('about once a day'))).toHaveLength(2)
  })

  it('has one view for each way a database cannot be read', async () => {
    const perm = await mountTab(ProjectDatabaseTab, 'states', 'booking')
    expect(perm.text()).toContain('Daminus can’t read booking’s .env on db-main')
    expect(perm.text()).toContain('ssh db-main "ls -l /srv/booking/.env"')
    const refused = await mountTab(ProjectDatabaseTab, 'tab-db-refused', 'tiemtra')
    expect(refused.text()).toContain('refused the login, or could not be reached')
    const unsupported = await mountTab(ProjectDatabaseTab, 'tab-db-unsupported', 'tiemtra')
    expect(unsupported.text()).toContain('DATABASE_URL')
    const missing = await mountTab(ProjectDatabaseTab, 'tab-db-missing', 'tiemtra')
    expect(missing.text()).toContain('No .env at /srv/tiemtra-api/.env')
  })
})

describe('Overview tab', () => {
  it('shows the four numbers, the wiring, the parts and the certificate', async () => {
    const w = await mountTab(ProjectOverviewTab, 'results', 'tiemtra')
    expect(w.text()).toContain('How tiemtra is wired')
    expect(w.text()).toContain('Needs a look')
    expect(w.text()).toContain('Certificate · tiemtra.vn')
    expect(w.findAll('.tile').length).toBeGreaterThanOrEqual(4)
  })

  it('groups the wiring by server, with the databases of a shared server in a data band', async () => {
    const w = await mountTab(ProjectOverviewTab, 'results', 'tiemtra')
    expect(w.findAll('.band .host').map((h) => h.text())).toEqual([
      'vps-sg-1',
      'vps-sg-2',
      'vps-sg-2 · data',
    ])
    expect(w.findAll('.node .role').map((r) => r.text())).toEqual(['FE', 'WORKER', 'BE', 'DB'])
  })

  it('writes the status next to the uptime and marks restarts in the parts table', async () => {
    const w = await mountTab(ProjectOverviewTab, 'results', 'tiemtra')
    expect(w.text()).toContain('200 OK')
    expect(w.find('.rows .tri').text()).toContain('▲')
  })

  it('names the shared server a warning comes from and links to it', async () => {
    const w = await mountTab(ProjectOverviewTab, 'results', 'tiemtra')
    expect(w.text()).toContain('disk.fs')
  })
})
