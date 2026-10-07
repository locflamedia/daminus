// The setup screens' sample data: the servers, answers and finds the boards 01 to 05 draw, in
// the shapes the core sends. Used by the dev mock (the window in a plain browser) and by tests.
import type {
  HostDiscovery,
  HostListing,
  HostOutcome,
  HostSetup,
  LoginReport,
  Project,
  Proposal,
  ResolvedHost,
  SetupRecord,
  SkippedHost,
} from '@/api'

export interface SampleHost {
  alias: string
  hostname: string
  user: string
  port: number
  key: string
  proxyJump?: string
  /** How the login test of this host ends. */
  outcome: HostOutcome
  /** Milliseconds the test takes on the wire. */
  ms: number
  login?: LoginReport
  folders?: { path: string; state: 'readable' | 'denied' | 'missing' }[]
  /** Milliseconds before the first answer, to stagger the hosts. */
  delay: number
}

const report = (over: Partial<LoginReport>): LoginReport => ({
  os: 'Linux',
  kernel: '6.8.0-45-generic',
  arch: 'x86_64',
  distro: 'Ubuntu 22.04.5 LTS',
  user: 'deploy',
  uid: 1001,
  root: false,
  docker_group: true,
  adm_group: true,
  journal_group: true,
  docker: 'ok',
  gnu_find: true,
  ...over,
})

export const SAMPLE_HOSTS: SampleHost[] = [
  {
    alias: 'vps-sg-1',
    hostname: '203.0.113.14',
    user: 'root',
    port: 22,
    key: '~/.ssh/id_ed25519',
    outcome: { state: 'reached' },
    ms: 380,
    delay: 150,
    login: report({ user: 'root', uid: 0, root: true }),
  },
  {
    alias: 'vps-sg-2',
    hostname: '203.0.113.27',
    user: 'deploy',
    port: 22,
    key: '~/.ssh/id_ed25519',
    outcome: { state: 'reached' },
    ms: 410,
    delay: 300,
    login: report({
      distro: 'Ubuntu 24.04.1 LTS',
      adm_group: false,
      journal_group: false,
    }),
    folders: [{ path: '/srv/shop', state: 'denied' }],
  },
  {
    alias: 'vps-hn-3',
    hostname: '198.51.100.8',
    user: 'deploy',
    port: 2222,
    key: '~/.ssh/hn_deploy',
    outcome: { state: 'reached' },
    ms: 1120,
    delay: 450,
    login: report({ distro: 'Debian GNU/Linux 12 (bookworm)', docker: 'no_permission' }),
  },
  {
    alias: 'db-main',
    hostname: '10.0.0.40',
    user: 'admin',
    port: 22,
    key: '~/.ssh/id_ed25519',
    proxyJump: 'vps-sg-1',
    outcome: { state: 'reached' },
    ms: 860,
    delay: 600,
    login: report({ user: 'admin', docker: 'missing' }),
  },
  {
    alias: 'legacy-shop',
    hostname: '203.0.113.90',
    user: 'root',
    port: 22,
    key: '~/.ssh/id_rsa',
    outcome: { state: 'reached' },
    ms: 2640,
    delay: 1800,
    login: report({ user: 'root', uid: 0, root: true, distro: 'Ubuntu 20.04.6 LTS' }),
  },
  {
    alias: 'staging',
    hostname: '192.0.2.55',
    user: 'deploy',
    port: 22,
    key: '~/.ssh/staging_ed25519',
    outcome: { state: 'auth_failed' },
    ms: 900,
    delay: 900,
  },
]

export const SAMPLE_SKIPPED: SkippedHost[] = [
  { pattern: 'github.com', reason: 'no_host_name', file: '~/.ssh/config', line: 31 },
  { pattern: '*', reason: 'wildcard', file: '~/.ssh/config', line: 40 },
]

function resolved(h: SampleHost): ResolvedHost {
  return {
    hostname: h.hostname,
    user: h.user,
    port: h.port,
    identity_files: [h.key],
    proxy_jump: h.proxyJump ?? null,
    proxy_command: false,
    known_hosts_files: ['~/.ssh/known_hosts'],
    host_key_alias: null,
  }
}

/** The host list as `hosts_list` answers it. */
export function sampleListing(
  hosts: SampleHost[] = SAMPLE_HOSTS,
  skipped: SkippedHost[] = SAMPLE_SKIPPED,
): HostListing {
  const configHosts = hosts.map((h, i) => ({
    alias: h.alias,
    file: '~/.ssh/config',
    line: i * 6 + 1,
  }))
  return {
    list: { config_found: true, hosts: configHosts, skipped },
    entries: configHosts.map((host, i) => ({ host, resolved: resolved(hosts[i] as SampleHost) })),
  }
}

/** The config the empty-app screens meet: no file, or a file with nothing usable. */
export function emptyListing(cause: 'no_config' | 'no_usable_hosts'): HostListing {
  return {
    list: {
      config_found: cause === 'no_usable_hosts',
      hosts: [],
      skipped:
        cause === 'no_usable_hosts'
          ? [
              { pattern: '*', reason: 'wildcard', file: '~/.ssh/config', line: 1 },
              { pattern: 'Match host *.corp', reason: 'match', file: '~/.ssh/config', line: 6 },
              { pattern: 'bastion', reason: 'no_host_name', file: 'config.d/jump', line: 2 },
              { pattern: 'my server', reason: 'invalid_alias', file: '~/.ssh/config', line: 19 },
            ]
          : [],
      empty: cause === 'no_usable_hosts' ? 'no_usable_hosts' : 'no_config',
    },
    entries: [],
  }
}

export function sampleSetup(host: SampleHost): HostSetup {
  return {
    host: host.alias,
    outcome: host.outcome,
    resolved: resolved(host),
    host_key: null,
    login: host.login ? { login: host.login, paths: host.folders ?? [] } : null,
    discovery: null,
  }
}

// --- discover ---------------------------------------------------------------------------------

const vhost = (names: string[], extra: Partial<Extract<SetupRecord, { rec: 'vhost' }>> = {}) =>
  ({
    rec: 'vhost',
    file: '/etc/nginx/sites-enabled/site.conf',
    names,
    ssl: true,
    php: false,
    listen: [443],
    ...extra,
  }) as SetupRecord

/** What discover prints on each sample host, in the order it prints it. */
export const SAMPLE_RECORDS: Record<string, SetupRecord[]> = {
  'vps-sg-1': [
    vhost(['tiemtra.vn', 'www.tiemtra.vn'], { proxy: '127.0.0.1:3000' }),
    {
      rec: 'pm2',
      app: 'tiemtra-web',
      home: '/home/root/.pm2',
      default: true,
      instances: 2,
      status: 'online',
      cwd: '/var/www/tiemtra-web',
    },
    {
      rec: 'compose',
      project: 'metabase',
      dir: '/opt/metabase',
      services: ['app'],
      running: 1,
      total: 1,
      ports: [3001],
    },
    { rec: 'port', port: 8080, bind: 'loopback', proc: 'java', cwd: '/opt/metabase' },
  ],
  'vps-sg-2': [
    vhost(['api.tiemtra.vn'], { proxy: '127.0.0.1:8000' }),
    vhost(['booking.vn'], { root: '/var/www/booking', php: true }),
    vhost(['admin.booking.vn'], { root: '/var/www/booking', php: true }),
    {
      rec: 'compose',
      project: 'tiemtra-api',
      dir: '/srv/tiemtra-api',
      services: ['api', 'worker', 'db', 'redis'],
      running: 4,
      total: 4,
      ports: [8000],
    },
    {
      rec: 'compose',
      project: 'booking',
      dir: '/var/www/booking',
      services: ['app', 'queue', 'scheduler'],
      running: 3,
      total: 3,
      ports: [],
    },
    {
      rec: 'db',
      engine: 'postgres',
      origin: 'container',
      name: 'tiemtra-api-db-1',
      project: 'tiemtra-api',
    },
    { rec: 'env', path: '/srv/tiemtra-api/.env', readable: true },
    { rec: 'env', path: '/var/www/booking/.env', readable: true },
    { rec: 'env', path: '/var/www/booking/.env.production', readable: true },
    { rec: 'port', port: 9000, bind: 'loopback', proc: 'php-fpm', cwd: '/var/www/booking' },
  ],
  'vps-hn-3': [
    vhost(['khohang.vn'], { root: '/var/www/kho-hang/public', php: true }),
    {
      rec: 'pm2',
      app: 'kho-hang-admin',
      home: '/home/deploy/.pm2',
      default: true,
      instances: 1,
      status: 'online',
      cwd: '/var/www/kho-hang',
    },
    { rec: 'db', engine: 'mysql', origin: 'process', name: 'mysqld' },
    { rec: 'env', path: '/var/www/shared/.env', readable: true },
    { rec: 'env', path: '/var/www/kho-hang/legacy/.env', readable: false },
    { rec: 'port', port: 5173, bind: 'loopback', proc: 'node', cwd: '/var/www/kho-hang' },
    { rec: 'port', port: 3306, bind: 'loopback', proc: 'mysqld' },
    { rec: 'pm2_home', home: '/home/node/.pm2', state: 'needs_perm' },
    { rec: 'note', code: 'docker_no_permission' },
    { rec: 'note', code: 'nginx_no_permission' },
  ],
  'db-main': [
    { rec: 'db', engine: 'mysql', origin: 'process', name: 'mysqld' },
    { rec: 'port', port: 3306, bind: 'any', proc: 'mysqld' },
  ],
  'legacy-shop': [vhost(['shop.old.example'], { root: '/var/www/legacy', php: true })],
}

export function discoveryOf(records: SetupRecord[]): HostDiscovery {
  const out: HostDiscovery = {
    vhosts: [],
    compose: [],
    pm2: [],
    pm2_homes: [],
    dbs: [],
    envs: [],
    ports: [],
    notes: [],
  }
  for (const r of records) {
    const { rec, ...rest } = r
    switch (rec) {
      case 'vhost':
        out.vhosts.push(rest as never)
        break
      case 'compose':
        out.compose.push(rest as never)
        break
      case 'pm2':
        out.pm2.push(rest as never)
        break
      case 'pm2_home':
        out.pm2_homes.push(rest as never)
        break
      case 'db':
        out.dbs.push(rest as never)
        break
      case 'env':
        out.envs.push(rest as never)
        break
      case 'port':
        out.ports.push(rest as never)
        break
      case 'note':
        out.notes.push(rest as never)
        break
    }
  }
  return out
}

/** The suggestions of the grouping for the sample finds (boards 03 and 04). */
export function sampleProposal(hosts: string[]): Proposal {
  const has = (h: string) => hosts.includes(h)
  const projects: Proposal['projects'] = []
  const unassigned: Proposal['unassigned'] = []
  if (has('vps-hn-3')) {
    projects.push({
      id: 'kho-hang',
      name: 'kho-hang',
      urls: ['https://khohang.vn'],
      components: [
        { role: 'be', host: 'vps-hn-3', kind: 'path', path: '/var/www/kho-hang' },
        { role: 'fe', host: 'vps-hn-3', kind: 'pm2', app: 'kho-hang-admin', pm2_home: null },
        { role: 'db', host: 'vps-hn-3', kind: 'db', engine: 'mysql', env_file: '' },
      ],
      env_files: [],
    })
    unassigned.push({
      host: 'vps-hn-3',
      item: { rec: 'env', path: '/var/www/shared/.env', readable: true },
    })
  }
  if (has('vps-sg-1') || has('vps-sg-2')) {
    const components: Proposal['projects'][number]['components'] = []
    if (has('vps-sg-1')) {
      components.push({
        role: 'fe',
        host: 'vps-sg-1',
        kind: 'pm2',
        app: 'tiemtra-web',
        pm2_home: null,
      })
    }
    if (has('vps-sg-2')) {
      components.push(
        { role: 'be', host: 'vps-sg-2', kind: 'compose', project: 'tiemtra-api' },
        {
          role: 'db',
          host: 'vps-sg-2',
          kind: 'db',
          engine: 'postgres',
          env_file: '/srv/tiemtra-api/.env',
          container: 'tiemtra-api-db-1',
        },
      )
    }
    projects.push({
      id: 'tiemtra',
      name: 'tiemtra',
      urls: ['https://tiemtra.vn', 'https://api.tiemtra.vn'],
      components,
      env_files: has('vps-sg-2')
        ? [{ host: 'vps-sg-2', path: '/srv/tiemtra-api/.env', readable: true }]
        : [],
    })
  }
  if (has('vps-sg-2')) {
    const components: Proposal['projects'][number]['components'] = [
      { role: 'fe', host: 'vps-sg-2', kind: 'path', path: '/var/www/booking' },
      { role: 'worker', host: 'vps-sg-2', kind: 'compose', project: 'booking' },
    ]
    if (has('db-main')) {
      components.push({
        role: 'db',
        host: 'db-main',
        kind: 'db',
        engine: 'mysql',
        env_file: '/var/www/booking/.env',
      })
    }
    projects.push({
      id: 'booking',
      name: 'booking',
      urls: ['https://booking.vn', 'https://admin.booking.vn'],
      components,
      env_files: [
        { host: 'vps-sg-2', path: '/var/www/booking/.env', readable: true },
        { host: 'vps-sg-2', path: '/var/www/booking/.env.production', readable: true },
        { host: 'vps-sg-2', path: '/var/www/booking/api/.env', readable: true },
      ],
    })
    unassigned.push({
      host: 'vps-sg-2',
      item: {
        rec: 'pm2',
        app: 'queue-worker',
        home: '/home/deploy/.pm2',
        default: true,
        instances: 1,
        status: 'online',
        cwd: '/srv/jobs',
      },
    })
    unassigned.push({
      host: 'vps-sg-2',
      item: { rec: 'db', engine: 'postgres', origin: 'process', name: 'postgres' },
    })
  }
  if (has('vps-sg-1')) {
    unassigned.unshift({
      host: 'vps-sg-1',
      item: {
        rec: 'compose',
        project: 'metabase',
        dir: '/opt/metabase',
        services: ['app'],
        running: 1,
        total: 1,
        ports: [3001],
      },
    })
  }
  return { projects, unassigned }
}

/** Projects already saved: the second run of setup meets them ("Already saved"). */
export const SAVED_PROJECTS: Project[] = [
  {
    id: 'tiemtra',
    name: 'tiemtra',
    color: '#4f6bed',
    urls: ['https://tiemtra.vn', 'https://api.tiemtra.vn/health'],
    components: [
      { role: 'fe', host: 'vps-sg-1', kind: 'pm2', app: 'tiemtra-web' },
      { role: 'be', host: 'vps-sg-2', kind: 'compose', project: 'tiemtra-api' },
      { role: 'db', host: 'vps-sg-2', kind: 'compose', project: 'tiemtra-redis' },
      {
        role: 'db',
        host: 'vps-sg-2',
        kind: 'db',
        engine: 'postgres',
        database: 'tiemtra',
        env_file: '/srv/tiemtra-api/.env',
        container: 'tiemtra-api-db-1',
      },
    ],
  },
]
