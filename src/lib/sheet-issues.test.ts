import { describe, expect, it } from 'vitest'
import type { ProjectIssue } from '@/api'
import type { DraftPart, DraftProject } from './setup-model'
import { errorTargets, mapIssues } from './sheet-issues'

const web: DraftPart = { key: 'p1', role: 'fe', host: 'a', kind: 'pm2', app: 'web', pm2Home: null }
const blankDb: DraftPart = {
  key: 'p2',
  role: 'db',
  host: 'a',
  kind: 'db',
  engine: 'postgres',
  database: '',
  envFile: '',
  container: null,
}
const api: DraftPart = { key: 'p3', role: 'be', host: 'b', kind: 'compose', project: 'api' }

const draft: DraftProject = {
  key: 'd',
  id: 'x',
  name: 'x',
  color: null,
  urls: ['', 'https://a.vn', 'ftp://b.vn'],
  parts: [web, blankDb, api],
  envFiles: [],
  isNew: true,
  idFollowsName: true,
}

const at = (
  field: ProjectIssue['field'],
  code: ProjectIssue['code'],
  level: ProjectIssue['level'] = 'warning',
): ProjectIssue => ({ project: 'x', field, level, code })

describe('mapIssues', () => {
  it('maps the core indexes back to the rows on screen', () => {
    const mapped = mapIssues(
      [
        at({ kind: 'url', index: 1 }, { kind: 'url_invalid' }, 'error'),
        at({ kind: 'component', index: 1 }, { kind: 'component_duplicate' }),
      ],
      draft,
    )
    // The core never saw the empty URL row nor the blank database part.
    expect(mapped.urls.get(2)).toHaveLength(1)
    expect(mapped.urls.has(1)).toBe(false)
    expect(mapped.parts.get('p3')).toHaveLength(1)
    expect(mapped.parts.has('p2')).toBe(false)
    expect(mapped.errors).toBe(1)
    expect(mapped.warnings).toBe(1)
  })

  it('sorts id, name and the form-level issue, and sets "replaces" aside', () => {
    const mapped = mapIssues(
      [
        at({ kind: 'id' }, { kind: 'empty' }, 'error'),
        at({ kind: 'name' }, { kind: 'empty' }, 'error'),
        at({ kind: 'project' }, { kind: 'empty' }, 'error'),
        at({ kind: 'id' }, { kind: 'replaces_existing' }),
      ],
      draft,
    )
    expect(mapped.id).toHaveLength(1)
    expect(mapped.name).toHaveLength(1)
    expect(mapped.form).toHaveLength(1)
    expect(mapped.replaces).toBe(true)
    expect(mapped.errors).toBe(3)
    expect(mapped.warnings).toBe(0)
  })
})

describe('errorTargets', () => {
  it('lists the fields with an error in the order they are drawn', () => {
    const mapped = mapIssues(
      [
        at({ kind: 'component', index: 1 }, { kind: 'unknown_host' }),
        at({ kind: 'url', index: 1 }, { kind: 'url_invalid' }, 'error'),
        at({ kind: 'id' }, { kind: 'bad_id' }, 'error'),
        at({ kind: 'name' }, { kind: 'empty' }, 'error'),
      ],
      draft,
    )
    expect(errorTargets(mapped, draft)).toEqual([
      { kind: 'name' },
      { kind: 'id' },
      { kind: 'url', index: 2 },
    ])
  })
})
