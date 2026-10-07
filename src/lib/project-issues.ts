// What the core says about a project, as message keys: one place that maps an issue (code and
// field) to the sentence the sheet and the setup screens show. The sentences live in the
// `projectSheet.issues` messages, in both languages.
import type { Project, ProjectIssue } from '@/api'

export interface IssueMessage {
  /** An i18n key under `projectSheet.issues`. */
  key: string
  params: Record<string, string | number>
}

/**
 * The words for `issue`. `project` is the project the issue is about; it gives the host of a
 * part that is not in the ssh config. A warning about a local address is one of three
 * sentences by what kind of address it is.
 */
export function issueMessage(issue: ProjectIssue, project?: Project): IssueMessage {
  const base = 'projectSheet.issues.'
  const code = issue.code
  const at = issue.field.kind === 'component' ? issue.field.index : -1
  const host = at >= 0 ? (project?.components[at]?.host ?? '') : ''
  const url = issue.field.kind === 'url' ? (project?.urls[issue.field.index] ?? '') : ''
  switch (code.kind) {
    case 'empty':
      return {
        key:
          base +
          (issue.field.kind === 'id'
            ? 'idEmpty'
            : issue.field.kind === 'name'
              ? 'nameEmpty'
              : 'nothingToCheck'),
        params: {},
      }
    case 'bad_id':
      return { key: base + 'idBad', params: {} }
    case 'duplicate_id':
      return { key: base + 'idDuplicate', params: { id: issue.project } }
    case 'replaces_existing':
      return { key: base + 'idReplaces', params: { id: issue.project } }
    case 'url_invalid':
      return { key: base + 'urlInvalid', params: { url } }
    case 'url_duplicate':
      return { key: base + 'urlDuplicate', params: { url } }
    case 'url_local_only':
      return {
        key:
          base +
          (code.warning === 'loopback'
            ? 'urlLoopback'
            : code.warning === 'private_network'
              ? 'urlPrivate'
              : 'urlLinkLocal'),
        params: { url },
      }
    case 'component_duplicate':
      return { key: base + 'partDuplicate', params: {} }
    case 'unknown_host':
      return { key: base + 'partUnknownHost', params: { host } }
  }
}

/** The sentence of an issue, for a toast or a list: `t` is the translator of the caller. */
export function issueSentence(
  issue: ProjectIssue,
  project: Project | undefined,
  t: (key: string, params: Record<string, string | number>) => string,
): string {
  const message = issueMessage(issue, project)
  return t(message.key, message.params)
}
