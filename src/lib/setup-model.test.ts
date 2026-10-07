import { describe, expect, it } from 'vitest'
import type { ProposedProject } from '@/api'
import {
  PROJECT_COLORS,
  colorName,
  draftFromProject,
  draftFromProposed,
  draftToProject,
  emptyDraft,
  hostsOf,
  isAbsPath,
  isIncomplete,
  isPlainName,
  nextColor,
  previewLines,
  roleForName,
  samePart,
  slugId,
} from './setup-model'

const proposed: ProposedProject = {
  id: 'kho-hang',
  name: 'kho-hang',
  urls: ['https://khohang.vn'],
  components: [
    { role: 'be', host: 'vps-hn-3', kind: 'path', path: '/var/www/kho-hang' },
    { role: 'fe', host: 'vps-hn-3', kind: 'pm2', app: 'kho-hang-admin', pm2_home: null },
    {
      role: 'db',
      host: 'vps-hn-3',
      kind: 'db',
      engine: 'mysql',
      env_file: '/var/www/kho-hang/.env',
    },
  ],
  env_files: [{ host: 'vps-hn-3', path: '/var/www/kho-hang/.env', readable: true }],
}

describe('project colours', () => {
  it('give the next colour no project has, in the order of the tints', () => {
    expect(nextColor([])).toBe(PROJECT_COLORS.blue)
    expect(nextColor([PROJECT_COLORS.blue, null, PROJECT_COLORS.rose])).toBe(PROJECT_COLORS.lilac)
    expect(colorName('#4F6BED')).toBe('blue')
    expect(colorName('#123456')).toBeNull()
  })

  it('wrap round when all eight are taken', () => {
    const all = Object.values(PROJECT_COLORS)
    expect(nextColor(all)).toBe(PROJECT_COLORS.blue)
  })
})

describe('ids and names', () => {
  it('turn a name into the id it suggests', () => {
    expect(slugId('Tiem Tra!')).toBe('tiem-tra')
    expect(slugId('  Kho  hàng đỏ ')).toBe('kho-hang-do')
    expect(slugId('!!!')).toBe('')
  })

  it('accept what the core accepts', () => {
    expect(isPlainName('kho-hang')).toBe(true)
    expect(isPlainName('Tiem Tra!')).toBe(false)
    expect(isPlainName('-x')).toBe(false)
    expect(isAbsPath('/srv/x')).toBe(true)
    expect(isAbsPath('srv/x')).toBe(false)
    expect(isAbsPath('/srv/\nx')).toBe(false)
  })

  it('suggest the worker role from the name', () => {
    expect(roleForName('queue-worker', 'be')).toBe('worker')
    expect(roleForName('tiemtra-web', 'fe')).toBe('fe')
  })
})

describe('drafts', () => {
  it('turn a suggestion into parts, leaving the database name for the user', () => {
    const d = draftFromProposed(proposed, PROJECT_COLORS.blue)
    expect(d.isNew).toBe(true)
    expect(d.parts.map((p) => p.kind)).toEqual(['path', 'pm2', 'db'])
    const db = d.parts[2]
    expect(db?.kind === 'db' && db.database).toBe('')
    expect(db && isIncomplete(db)).toBe(true)
  })

  it('leave an incomplete database part out of the saved project and count it', () => {
    const d = draftFromProposed(proposed, null)
    const first = draftToProject(d)
    expect(first.leftOut).toBe(1)
    expect(first.project.components).toHaveLength(2)
    expect(first.project.color).toBeUndefined()

    const db = d.parts[2]
    if (db?.kind === 'db') db.database = ' booking_prod '
    const second = draftToProject(d)
    expect(second.leftOut).toBe(0)
    expect(second.project.components[2]).toMatchObject({
      kind: 'db',
      database: 'booking_prod',
      env_file: '/var/www/kho-hang/.env',
    })
  })

  it('leave a database part out while no .env is chosen', () => {
    const d = draftFromProposed({ ...proposed, env_files: [] }, null)
    const db = d.parts[2]
    if (db?.kind === 'db') {
      db.database = 'x'
      db.envFile = ''
    }
    expect(draftToProject(d).leftOut).toBe(1)
  })

  it('round trip a saved project and keep its colour', () => {
    const { project } = draftToProject(
      Object.assign(draftFromProposed(proposed, PROJECT_COLORS.rose), { name: 'Kho hàng' }),
    )
    const back = draftFromProject(project)
    expect(back.isNew).toBe(false)
    expect(back.color).toBe(PROJECT_COLORS.rose)
    expect(draftToProject(back).project).toEqual(project)
  })

  it('trim and drop empty URLs and list the hosts once', () => {
    const d = { ...emptyDraft(null), id: ' a ', urls: [' https://a.example ', ''] }
    d.parts = draftFromProposed(proposed, null).parts
    expect(draftToProject(d).project.urls).toEqual(['https://a.example'])
    expect(draftToProject(d).project.id).toBe('a')
    expect(hostsOf([d])).toEqual(['vps-hn-3'])
  })

  it('tell the same part on the same host from another', () => {
    const [a, b] = draftFromProposed(proposed, null).parts
    if (!a || !b) throw new Error('parts')
    expect(samePart(a, { ...a, key: 'other' })).toBe(true)
    expect(samePart(a, b)).toBe(false)
    expect(samePart(a, { ...a, host: 'vps-sg-1' })).toBe(false)
  })
})

describe('the projects.json preview', () => {
  it('shows the first project in full and the others as one line, with no secret', () => {
    const one = draftFromProposed(proposed, null)
    const other = { ...draftFromProposed(proposed, null), id: 'tiemtra' }
    const text = previewLines([one, other]).join('\n')
    expect(text).toContain('"id": "kho-hang"')
    expect(text).toContain('{ "id": "tiemtra", … 2 parts }')
    expect(text).not.toMatch(/password|secret/i)
    expect(JSON.parse(previewLines([]).join('\n'))).toEqual({ version: 1, projects: [] })
  })
})
