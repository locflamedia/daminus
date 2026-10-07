// What the core said about the project in the sheet, sorted by where it is drawn: under the
// id or the name, under one URL row, on one part, or above the parts list. The core counts
// URLs and parts of the project it was given, which leaves out empty URL rows and parts that
// are still blank; this maps those indexes back to the rows on screen.
import type { ProjectIssue } from '@/api'
import type { DraftProject } from './setup-model'
import { isBlank } from './sheet-parts'

export interface MappedIssues {
  id: ProjectIssue[]
  name: ProjectIssue[]
  /** The form-level "Nothing to check". */
  form: ProjectIssue[]
  /** By index of the row in `draft.urls`. */
  urls: Map<number, ProjectIssue[]>
  /** By the part's key. */
  parts: Map<string, ProjectIssue[]>
  /** The id is already in `projects.json`. */
  replaces: boolean
  errors: number
  warnings: number
}

function push<K>(map: Map<K, ProjectIssue[]>, key: K, issue: ProjectIssue) {
  map.set(key, [...(map.get(key) ?? []), issue])
}

export function mapIssues(issues: readonly ProjectIssue[], draft: DraftProject): MappedIssues {
  const urlRows = draft.urls.flatMap((u, i) => (u.trim() === '' ? [] : [i]))
  const partRows = draft.parts.filter((p) => !isBlank(p))
  const out: MappedIssues = {
    id: [],
    name: [],
    form: [],
    urls: new Map(),
    parts: new Map(),
    replaces: false,
    errors: 0,
    warnings: 0,
  }
  for (const issue of issues) {
    if (issue.code.kind === 'replaces_existing') {
      out.replaces = true
      continue
    }
    if (issue.level === 'error') out.errors += 1
    else out.warnings += 1
    const field = issue.field
    if (field.kind === 'id') out.id.push(issue)
    else if (field.kind === 'name') out.name.push(issue)
    else if (field.kind === 'project') out.form.push(issue)
    else if (field.kind === 'url') {
      const row = urlRows[field.index]
      if (row !== undefined) push(out.urls, row, issue)
    } else {
      const part = partRows[field.index]
      if (part) push(out.parts, part.key, issue)
    }
  }
  return out
}

export type FieldTarget =
  | { kind: 'name' }
  | { kind: 'id' }
  | { kind: 'url'; index: number }
  | { kind: 'form' }
  | { kind: 'part'; key: string }

/** The fields that hold an error, in the order the sheet draws them (⌘S goes to the first). */
export function errorTargets(mapped: MappedIssues, draft: DraftProject): FieldTarget[] {
  const bad = (list: ProjectIssue[] | undefined) => list?.some((i) => i.level === 'error') ?? false
  const out: FieldTarget[] = []
  if (bad(mapped.name)) out.push({ kind: 'name' })
  if (bad(mapped.id)) out.push({ kind: 'id' })
  draft.urls.forEach((_, index) => {
    if (bad(mapped.urls.get(index))) out.push({ kind: 'url', index })
  })
  if (bad(mapped.form)) out.push({ kind: 'form' })
  for (const part of draft.parts) {
    if (bad(mapped.parts.get(part.key))) out.push({ kind: 'part', key: part.key })
  }
  return out
}

/** The same project with only the issues that are about the first project of `list` by `id`. */
export function issuesOfProject(list: readonly ProjectIssue[], id: string): ProjectIssue[] {
  return list.filter((i) => i.project === id)
}
