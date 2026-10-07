import { describe, expect, it } from 'vitest'
import type { Project, ProjectIssue } from '@/api'
import { issueMessage } from './project-issues'

const project: Project = {
  id: 'tiemtra',
  name: 'tiemtra',
  urls: ['https://tiemtra.vn', 'http://10.0.0.5/health'],
  components: [{ role: 'fe', host: 'vps-old', kind: 'path', path: '/srv/x' }],
}

const issue = (field: ProjectIssue['field'], code: ProjectIssue['code']): ProjectIssue => ({
  project: 'tiemtra',
  field,
  level: 'warning',
  code,
})

describe('issueMessage', () => {
  it('names the field an empty value is in', () => {
    expect(issueMessage(issue({ kind: 'id' }, { kind: 'empty' })).key).toBe(
      'projectSheet.issues.idEmpty',
    )
    expect(issueMessage(issue({ kind: 'name' }, { kind: 'empty' })).key).toBe(
      'projectSheet.issues.nameEmpty',
    )
    expect(issueMessage(issue({ kind: 'project' }, { kind: 'empty' })).key).toBe(
      'projectSheet.issues.nothingToCheck',
    )
  })

  it('picks one of three sentences for an address only this Mac can reach', () => {
    const url = (warning: 'loopback' | 'private_network' | 'link_local') =>
      issueMessage(issue({ kind: 'url', index: 1 }, { kind: 'url_local_only', warning }), project)
    expect(url('loopback').key).toBe('projectSheet.issues.urlLoopback')
    expect(url('private_network').key).toBe('projectSheet.issues.urlPrivate')
    expect(url('link_local').key).toBe('projectSheet.issues.urlLinkLocal')
    expect(url('private_network').params.url).toBe('http://10.0.0.5/health')
  })

  it('says which host a part names that the ssh config lacks', () => {
    const m = issueMessage(
      issue({ kind: 'component', index: 0 }, { kind: 'unknown_host' }),
      project,
    )
    expect(m).toEqual({ key: 'projectSheet.issues.partUnknownHost', params: { host: 'vps-old' } })
  })

  it('carries the id of a duplicate or a replaced project', () => {
    expect(issueMessage(issue({ kind: 'id' }, { kind: 'duplicate_id' })).params.id).toBe('tiemtra')
    expect(issueMessage(issue({ kind: 'id' }, { kind: 'replaces_existing' })).key).toBe(
      'projectSheet.issues.idReplaces',
    )
  })
})
