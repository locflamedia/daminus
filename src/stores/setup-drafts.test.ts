// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Project, ProjectIssue, Proposal, SaveOutcome } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { PROJECT_COLORS } from '@/lib/setup-model'
import { useSetupStore } from './setup'
import { useSetupDraftsStore } from './setup-drafts'

const proposal: Proposal = {
  projects: [
    {
      id: 'kho-hang',
      name: 'kho-hang',
      urls: ['https://khohang.vn'],
      components: [
        { role: 'be', host: 'vps-hn-3', kind: 'path', path: '/var/www/kho-hang' },
        {
          role: 'db',
          host: 'vps-hn-3',
          kind: 'db',
          engine: 'mysql',
          env_file: '/var/www/kho-hang/.env',
        },
      ],
      env_files: [{ host: 'vps-hn-3', path: '/var/www/kho-hang/.env', readable: true }],
    },
    {
      id: 'tiemtra',
      name: 'tiemtra',
      urls: ['https://tiemtra.vn'],
      components: [{ role: 'fe', host: 'vps-sg-1', kind: 'pm2', app: 'tiemtra-web' }],
      env_files: [],
    },
  ],
  unassigned: [
    {
      host: 'vps-sg-1',
      item: {
        rec: 'compose',
        project: 'metabase',
        services: ['app'],
        running: 1,
        total: 1,
        ports: [],
        dir: null,
      },
    },
    {
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
    },
    { host: 'vps-hn-3', item: { rec: 'env', path: '/var/www/shared/.env', readable: true } },
    {
      host: 'vps-sg-2',
      item: { rec: 'db', engine: 'postgres', origin: 'process', name: 'postgres' },
    },
  ],
}

let validated: Project[][]
let saved: { projects: Project[]; hosts: string[] }[]
let issues: ProjectIssue[]
let outcome: SaveOutcome

beforeEach(() => {
  setActivePinia(createPinia())
  validated = []
  saved = []
  issues = []
  outcome = { status: 'saved', issues: [], projects: 2 }
  mockCommands((cmd, args) => {
    if (cmd === 'projects_validate') {
      validated.push(args.projects as Project[])
      return issues
    }
    if (cmd === 'projects_save') {
      saved.push({ projects: args.projects as Project[], hosts: args.hosts as string[] })
      return outcome
    }
    throw new Error(`unexpected command ${cmd}`)
  })
})

afterEach(() => clearMocks())

function stores() {
  const setup = useSetupStore()
  setup.result = { hosts: [], proposal }
  const drafts = useSetupDraftsStore()
  drafts.sync()
  return { setup, drafts }
}

describe('suggestions as drafts', () => {
  it('makes a draft of each suggestion with its own colour, in the order of the tints', () => {
    const { drafts } = stores()
    expect(drafts.drafts.map((d) => [d.id, d.color])).toEqual([
      ['kho-hang', PROJECT_COLORS.blue],
      ['tiemtra', PROJECT_COLORS.lilac],
    ])
    expect(drafts.summary).toEqual({ projects: 2, parts: 3, servers: 2 })
    expect(drafts.incomplete).toBe(1)
  })

  it('keeps what the user edited when it syncs again, and adds only what is new', () => {
    const { setup, drafts } = stores()
    const first = drafts.drafts[0]
    if (first) first.name = 'Kho hàng'
    setup.result = {
      hosts: [],
      proposal: {
        ...proposal,
        projects: [
          ...proposal.projects,
          { id: 'booking', name: 'booking', urls: [], components: [], env_files: [] },
        ],
      },
    }
    drafts.sync()
    expect(drafts.drafts.map((d) => d.id)).toEqual(['kho-hang', 'tiemtra', 'booking'])
    expect(drafts.drafts[0]?.name).toBe('Kho hàng')
    expect(drafts.drafts[2]?.color).toBe(PROJECT_COLORS.rose)
  })
})

describe('not in a project', () => {
  it('lists the finds that belong to no project, by kind', () => {
    const { drafts } = stores()
    expect(drafts.loose.map((l) => [l.host, l.kind, l.name])).toEqual([
      ['vps-sg-1', 'compose', 'metabase'],
      ['vps-sg-2', 'pm2', 'queue-worker'],
      ['vps-hn-3', 'env', '/var/www/shared/.env'],
      ['vps-sg-2', 'db', 'postgres'],
    ])
  })

  it('moves a find into a project as a part, with the role its name suggests', () => {
    const { drafts } = stores()
    const target = drafts.drafts[1]
    const queue = drafts.loose[1]
    if (!target || !queue) throw new Error('setup')
    drafts.addToProject(queue, target.key)
    expect(drafts.loose.map((l) => l.name)).not.toContain('queue-worker')
    const part = target.parts.at(-1)
    expect(part).toMatchObject({
      kind: 'pm2',
      app: 'queue-worker',
      role: 'worker',
      host: 'vps-sg-2',
    })
  })

  it('adds a .env to the project and a database to its first .env', () => {
    const { drafts } = stores()
    const target = drafts.drafts[0]
    const env = drafts.loose.find((l) => l.kind === 'env')
    const db = drafts.loose.find((l) => l.kind === 'db')
    if (!target || !env || !db) throw new Error('setup')
    drafts.addToProject(env, target.key)
    expect(target.envFiles).toEqual(['/var/www/kho-hang/.env', '/var/www/shared/.env'])
    drafts.addToProject(db, target.key)
    expect(target.parts.at(-1)).toMatchObject({
      kind: 'db',
      engine: 'postgres',
      envFile: '/var/www/kho-hang/.env',
      database: '',
    })
  })

  it('starts a project from a find', () => {
    const { drafts } = stores()
    const compose = drafts.loose[0]
    if (!compose) throw new Error('setup')
    const made = drafts.newProjectFrom(compose)
    expect(made?.name).toBe('metabase')
    expect(made?.parts).toHaveLength(1)
    expect(drafts.drafts).toHaveLength(3)
    expect(drafts.loose.map((l) => l.name)).not.toContain('metabase')
  })
})

describe('what the core says', () => {
  it('marks a suggestion whose id is saved and lets Keep both rename it to a free id', async () => {
    const { drafts } = stores()
    issues = [
      {
        project: 'tiemtra',
        field: { kind: 'id' },
        level: 'warning',
        code: { kind: 'replaces_existing' },
      },
    ]
    await drafts.validate()
    const tiemtra = drafts.drafts[1]
    if (!tiemtra) throw new Error('setup')
    expect(drafts.replaces(tiemtra)).toBe(true)
    expect(drafts.replaces(drafts.drafts[0]!)).toBe(false)

    issues = []
    drafts.keepBoth(tiemtra.key)
    await drafts.validate()
    expect(tiemtra.id).toBe('tiemtra-2')
    expect(drafts.replaces(tiemtra)).toBe(false)
  })

  it('checks every part, the database still waiting for its name included', async () => {
    const { drafts } = stores()
    await drafts.validate()
    expect(validated.at(-1)?.[0]?.components).toHaveLength(2)
  })

  it('knows when an error stops the save', async () => {
    const { drafts } = stores()
    issues = [{ project: 'x', field: { kind: 'name' }, level: 'error', code: { kind: 'empty' } }]
    await drafts.validate()
    expect(drafts.hasErrors).toBe(true)
  })
})

describe('saving', () => {
  it('writes the projects and the ticked hosts, keeping the database still waiting for its name', async () => {
    const { setup, drafts } = stores()
    setup.ticked = ['vps-hn-3', 'vps-sg-1']
    const result = await drafts.save()
    expect(result?.status).toBe('saved')
    expect(saved).toHaveLength(1)
    expect(saved[0]?.hosts).toEqual(['vps-hn-3', 'vps-sg-1'])
    expect(saved[0]?.projects[0]?.components).toHaveLength(2)
    expect(saved[0]?.projects[0]?.color).toBe(PROJECT_COLORS.blue)
  })

  it('keeps the drafts when the core rejects the save', async () => {
    const { drafts } = stores()
    outcome = {
      status: 'rejected',
      issues: [{ project: '', field: { kind: 'id' }, level: 'error', code: { kind: 'empty' } }],
    }
    const result = await drafts.save()
    expect(result?.status).toBe('rejected')
    expect(drafts.drafts).toHaveLength(2)
    expect(drafts.hasErrors).toBe(true)
  })

  it('forgets everything on reset', () => {
    const { drafts } = stores()
    drafts.reset()
    expect(drafts.drafts).toEqual([])
    expect(drafts.issues).toEqual([])
  })
})

describe('a suggestion that grows as hosts finish', () => {
  it('takes in the new parts and URLs, and leaves the user edits and removals alone', () => {
    const { setup, drafts } = stores()
    const kho = drafts.drafts[0]
    if (!kho) throw new Error('setup')
    kho.name = 'Kho hàng'
    kho.parts = kho.parts.filter((p) => p.kind !== 'path') // the user removed the folder
    const grown: Proposal = {
      ...proposal,
      projects: [
        {
          ...proposal.projects[0]!,
          urls: ['https://khohang.vn', 'https://admin.khohang.vn'],
          components: [
            ...proposal.projects[0]!.components,
            { role: 'worker', host: 'vps-hn-4', kind: 'pm2', app: 'kho-queue', pm2_home: null },
          ],
        },
        proposal.projects[1]!,
      ],
    }
    setup.result = { hosts: [], proposal: grown }
    drafts.sync()
    expect(drafts.drafts).toHaveLength(2)
    expect(kho.name).toBe('Kho hàng')
    expect(kho.urls).toEqual(['https://khohang.vn', 'https://admin.khohang.vn'])
    expect(kho.parts.map((p) => p.kind)).toEqual(['db', 'pm2'])
    // Syncing again adds nothing twice.
    drafts.sync()
    expect(kho.parts).toHaveLength(2)
  })
})

describe('keep both and later syncs', () => {
  it('does not make a second draft for a suggestion whose id was renamed', () => {
    const { drafts } = stores()
    const tiemtra = drafts.drafts[1]
    if (!tiemtra) throw new Error('setup')
    drafts.keepBoth(tiemtra.key)
    expect(tiemtra.id).toBe('tiemtra-2')
    drafts.sync()
    expect(drafts.drafts.map((d) => d.id)).toEqual(['kho-hang', 'tiemtra-2'])
  })
})
