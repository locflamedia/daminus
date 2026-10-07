import { describe, expect, it } from 'vitest'
import { cloneDraft, countChanges } from './sheet-changes'
import type { DraftPart, DraftProject } from './setup-model'

const web: DraftPart = {
  key: 'p1',
  role: 'fe',
  host: 'vps-sg-1',
  kind: 'pm2',
  app: 'web',
  pm2Home: null,
}
const api: DraftPart = { key: 'p2', role: 'be', host: 'vps-sg-2', kind: 'compose', project: 'api' }

function base(): DraftProject {
  return {
    key: 'd1',
    id: 'tiemtra',
    name: 'tiemtra',
    color: '#4f6bed',
    urls: ['https://tiemtra.vn'],
    parts: [web, api],
    envFiles: [],
    isNew: false,
    idFollowsName: false,
  }
}

describe('countChanges', () => {
  it('is zero for a copy', () => {
    expect(countChanges(base(), cloneDraft(base()))).toBe(0)
  })

  it('counts name, colour and a typed id once each', () => {
    const next = { ...base(), name: 'Tiem Tra', color: '#8b6fe0', id: 'tt' }
    expect(countChanges(base(), next)).toBe(3)
  })

  it('does not count an id that only follows the name', () => {
    const next = { ...base(), name: 'x', id: 'x', idFollowsName: true }
    expect(countChanges(base(), next)).toBe(1)
  })

  it('counts URL rows by position, and ignores empty rows', () => {
    expect(countChanges(base(), { ...base(), urls: ['https://tiemtra.vn', ''] })).toBe(0)
    expect(countChanges(base(), { ...base(), urls: ['https://tiemtra.vn', 'https://b.vn'] })).toBe(
      1,
    )
    expect(countChanges(base(), { ...base(), urls: ['https://other.vn'] })).toBe(1)
    expect(countChanges(base(), { ...base(), urls: [] })).toBe(1)
  })

  it('counts an added, a removed and an edited part', () => {
    const added: DraftPart = {
      key: 'p3',
      role: 'worker',
      host: 'vps-sg-1',
      kind: 'pm2',
      app: 'cron',
      pm2Home: null,
    }
    expect(countChanges(base(), { ...base(), parts: [web, api, added] })).toBe(1)
    expect(countChanges(base(), { ...base(), parts: [web] })).toBe(1)
    expect(countChanges(base(), { ...base(), parts: [{ ...web, role: 'worker' }, api] })).toBe(1)
  })

  it('counts moving parts once, however far', () => {
    const three: DraftPart = { key: 'p3', role: 'db', host: 'h', kind: 'compose', project: 'db' }
    const before = { ...base(), parts: [web, api, three] }
    expect(countChanges(before, { ...before, parts: [three, web, api] })).toBe(1)
    expect(countChanges(before, { ...before, parts: [three, api, web] })).toBe(1)
  })
})

describe('cloneDraft', () => {
  it('copies through reactive proxies', () => {
    const copy = cloneDraft(new Proxy(base(), {}))
    expect(copy).toEqual(base())
    expect(copy.parts).not.toBe(base().parts)
  })
})
