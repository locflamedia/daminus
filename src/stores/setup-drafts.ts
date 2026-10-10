// Step 3 of setup: the suggestions as editable projects, the finds that belong to none, the
// issues the core finds when it checks them, and the save. Nothing is written to
// `projects.json` until `save()`; the draft only exists in the webview.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  type AppError,
  type ProjectIssue,
  type SaveOutcome,
  type Unassigned,
  isAppError,
  projectsSave,
  projectsValidate,
} from '@/api'
import { isDefaultSite } from '@/lib/discover-view'
import {
  type DraftPart,
  type DraftProject,
  draftFromProposed,
  draftToProject,
  hostsOf,
  isAbsPath,
  isIncomplete,
  newKey,
  nextColor,
  partName,
  roleForName,
} from '@/lib/setup-model'
import { useSetupStore } from './setup'

/** One find that no suggested project owns, as "Not in a project" lists it. */
export interface LooseItem {
  key: string
  host: string
  kind: 'vhost' | 'compose' | 'pm2' | 'db' | 'env' | 'path'
  /** The name, folder or file it is known by. */
  name: string
  /** Kind-specific words for the detail line, which the screen turns into text. */
  detail: { code: string; n?: number; text?: string }
  /** The catch-all server block, shown as "Default site" with its root. */
  defaultSite?: boolean
}

function looseOf(u: Unassigned): LooseItem | null {
  const host = u.host
  const base = (kind: LooseItem['kind'], name: string, detail: LooseItem['detail']): LooseItem => ({
    key: `${host}|${kind}|${name}`,
    host,
    kind,
    name,
    detail,
  })
  const r = u.item
  switch (r.rec) {
    case 'vhost':
      if (isDefaultSite(r)) {
        return {
          ...base('vhost', r.names[0] ?? r.file, { code: 'root', text: r.root ?? r.file }),
          defaultSite: true,
        }
      }
      return base('vhost', r.names[0] ?? r.root ?? r.file, { code: 'no_domain' })
    case 'compose':
      return base('compose', r.project, { code: 'no_site', n: r.services.length })
    case 'pm2':
      return base('pm2', r.app, r.cwd ? { code: 'runs_from', text: r.cwd } : { code: 'no_folder' })
    case 'db':
      return base(
        'db',
        r.origin === 'container' ? r.name : r.engine,
        r.origin === 'container' ? { code: 'container', text: r.name } : { code: 'process' },
      )
    case 'env':
      return base('env', r.path, { code: 'shared' })
    default:
      return null
  }
}

/** The part a loose find becomes when it is added to a project; `.env` files are not parts. */
export function partFromLoose(u: Unassigned): DraftPart | null {
  const base = { key: newKey('p'), host: u.host }
  const r = u.item
  switch (r.rec) {
    case 'vhost':
      return r.root ? { ...base, role: 'be', kind: 'path', path: r.root } : null
    case 'compose':
      return { ...base, role: roleForName(r.project, 'be'), kind: 'compose', project: r.project }
    case 'pm2':
      return {
        ...base,
        role: roleForName(r.app, 'fe'),
        kind: 'pm2',
        app: r.app,
        pm2Home: r.default ? null : r.home,
      }
    case 'db':
      return {
        ...base,
        role: 'db',
        kind: 'db',
        engine: r.engine,
        database: '',
        envFile: '',
        container: r.origin === 'container' ? r.name : null,
      }
    default:
      return null
  }
}

export const useSetupDraftsStore = defineStore('setup-drafts', () => {
  const setup = useSetupStore()

  const drafts = ref<DraftProject[]>([])
  /** Folders the user added by hand ("Add by path"); they are loose finds until moved. */
  const manual = ref<{ host: string; path: string }[]>([])
  /** Keys of loose finds the user already moved into a project. */
  const moved = ref<Set<string>>(new Set())
  const issues = ref<ProjectIssue[]>([])
  const saving = ref(false)
  const saved = ref<SaveOutcome | null>(null)
  const error = ref<AppError | null>(null)

  /** What discover suggests now; the drafts are made from it by [`sync`]. */
  const proposal = computed(() => setup.result?.proposal ?? null)

  /**
   * Makes a draft of every suggestion that has none yet. A draft the user already has (same
   * id) is left as edited; finds that arrive late become new drafts, never changes to old ones.
   */
  /** What of each suggestion a draft has already taken in: part and URL signatures by draft key. */
  const taken = new Map<string, Set<string>>()

  function partSignature(p: DraftPart): string {
    return `${p.host}|${p.kind}|${partName(p)}`
  }

  function sync() {
    const p = proposal.value
    if (!p) return
    const used = drafts.value.map((d) => d.color)
    for (const suggestion of p.projects) {
      const existing = drafts.value.find(
        (d) => d.origin === suggestion.id || (d.origin === '' && d.id === suggestion.id),
      )
      if (!existing) {
        const color = nextColor([...used, ...drafts.value.map((d) => d.color)])
        const draft = draftFromProposed(suggestion, color)
        drafts.value = [...drafts.value, draft]
        taken.set(
          draft.key,
          new Set([...draft.parts.map(partSignature), ...draft.urls.map((u) => `url|${u}`)]),
        )
        continue
      }
      // The suggestion grows as hosts finish: take in what is new, never touch what the user
      // edited or removed (a part already taken in once is not added again).
      const seen = taken.get(existing.key) ?? new Set<string>()
      const fresh = draftFromProposed(suggestion, existing.color)
      const parts = fresh.parts.filter((part) => !seen.has(partSignature(part)))
      const urls = fresh.urls.filter((u) => !seen.has(`url|${u}`))
      for (const part of parts) seen.add(partSignature(part))
      for (const u of urls) seen.add(`url|${u}`)
      taken.set(existing.key, seen)
      for (const env of fresh.envFiles) {
        if (!existing.envFiles.includes(env) && !seen.has(`env|${env}`)) {
          seen.add(`env|${env}`)
          existing.envFiles = [...existing.envFiles, env]
        }
      }
      if (parts.length > 0) {
        const merged = parts.map((part) =>
          part.kind === 'db' && part.envFile === ''
            ? { ...part, envFile: existing.envFiles[0] ?? '' }
            : part,
        )
        existing.parts = [...existing.parts, ...merged]
      }
      if (urls.length > 0) existing.urls = [...existing.urls, ...urls]
      if (parts.length > 0 || urls.length > 0) void validate()
    }
  }

  const manualItems = computed<LooseItem[]>(() =>
    manual.value.map((m) => ({
      key: `${m.host}|path|${m.path}`,
      host: m.host,
      kind: 'path' as const,
      name: m.path,
      detail: { code: 'by_hand' },
    })),
  )

  const loose = computed<LooseItem[]>(() =>
    [...(proposal.value?.unassigned ?? []).map(looseOf), ...manualItems.value].filter(
      (l): l is LooseItem => l !== null && !moved.value.has(l.key),
    ),
  )

  /** "Add by path": a folder on `host` that discover could not know about. */
  function addManualPath(host: string, path: string): boolean {
    const clean = path.trim()
    if (!isAbsPath(clean) || manual.value.some((m) => m.host === host && m.path === clean)) {
      return false
    }
    manual.value = [...manual.value, { host, path: clean }]
    return true
  }

  /** Adds a loose find to the project `draftKey`; `.env` files go to its list of `.env`. */
  function addToProject(item: LooseItem, draftKey: string) {
    const draft = drafts.value.find((d) => d.key === draftKey)
    if (!draft) return
    if (item.kind === 'path') {
      draft.parts = [
        ...draft.parts,
        { key: newKey('p'), role: 'be', host: item.host, kind: 'path', path: item.name },
      ]
      moved.value = new Set([...moved.value, item.key])
      void validate()
      return
    }
    const u = proposal.value?.unassigned.find((x) => looseOf(x)?.key === item.key)
    if (!u) return
    if (u.item.rec === 'env') {
      if (!draft.envFiles.includes(u.item.path)) draft.envFiles = [...draft.envFiles, u.item.path]
    } else {
      const part = partFromLoose(u)
      if (!part) return
      if (part.kind === 'db') part.envFile = draft.envFiles[0] ?? ''
      draft.parts = [...draft.parts, part]
    }
    moved.value = new Set([...moved.value, item.key])
    void validate()
  }

  /** "+ New project…": a project made from one find. */
  function newProjectFrom(item: LooseItem): DraftProject | null {
    const known =
      item.kind === 'path' || proposal.value?.unassigned.some((x) => looseOf(x)?.key === item.key)
    if (!known) return null
    const name = item.kind === 'env' ? '' : item.name
    const draft: DraftProject = {
      key: newKey('d'),
      id: '',
      name,
      color: nextColor(drafts.value.map((d) => d.color)),
      urls: [],
      parts: [],
      envFiles: [],
      isNew: true,
      origin: '',
      idFollowsName: true,
    }
    drafts.value = [...drafts.value, draft]
    addToProject(item, draft.key)
    return draft
  }

  function remove(draftKey: string) {
    drafts.value = drafts.value.filter((d) => d.key !== draftKey)
    void validate()
  }

  function add(draft: DraftProject) {
    drafts.value = [...drafts.value.filter((d) => d.key !== draft.key), draft]
    void validate()
  }

  /** The draft with this key, replaced by the edited one from the sheet. */
  function replace(draft: DraftProject) {
    const at = drafts.value.findIndex((d) => d.key === draft.key)
    if (at === -1) return add(draft)
    drafts.value = drafts.value.map((d, i) => (i === at ? draft : d))
    void validate()
  }

  function issuesOf(id: string): ProjectIssue[] {
    return issues.value.filter((i) => i.project === id)
  }

  /** The id already exists in `projects.json`: Save replaces that project. */
  function replaces(draft: DraftProject): boolean {
    return issuesOf(draft.id).some((i) => i.code.kind === 'replaces_existing')
  }

  /** "Keep both": the suggestion gets a free id (`tiemtra-2`) and no longer replaces anything. */
  function keepBoth(draftKey: string) {
    const draft = drafts.value.find((d) => d.key === draftKey)
    if (!draft) return
    const taken = new Set([...drafts.value.map((d) => d.id), ...issues.value.map((i) => i.project)])
    let n = 2
    while (taken.has(`${draft.id}-${n}`)) n += 1
    draft.id = `${draft.id}-${n}`
    void validate()
  }

  let requests = 0
  /** Asks the core what is wrong with the drafts; only the newest answer counts. */
  async function validate() {
    const mine = ++requests
    try {
      const out = await projectsValidate(drafts.value.map((d) => draftToProject(d).project))
      if (mine === requests) issues.value = out
    } catch (e) {
      if (mine !== requests) return
      error.value = isAppError(e) ? e : null
      if (!isAppError(e)) console.error(e)
    }
  }

  /** Database parts that cannot be saved yet, over every draft. */
  const incomplete = computed(() =>
    drafts.value.reduce((n, d) => n + d.parts.filter(isIncomplete).length, 0),
  )

  const summary = computed(() => ({
    projects: drafts.value.length,
    parts: drafts.value.reduce((n, d) => n + d.parts.length, 0),
    servers: hostsOf(drafts.value).length,
  }))

  const hasErrors = computed(() => issues.value.some((i) => i.level === 'error'))

  /** Writes `projects.json`. Resolves with the outcome; a rejected save leaves the drafts as they are. */
  async function save(order?: string[]): Promise<SaveOutcome | null> {
    // A validate still in flight must not overwrite the issues the save returns.
    requests += 1
    saving.value = true
    error.value = null
    try {
      const outcome = await projectsSave(
        (order
          ? [...drafts.value].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
          : drafts.value
        ).map((d) => draftToProject(d).project),
        setup.ticked,
      )
      saved.value = outcome
      issues.value = outcome.issues
      return outcome
    } catch (e) {
      error.value = isAppError(e) ? e : null
      if (!isAppError(e)) console.error(e)
      return null
    } finally {
      saving.value = false
    }
  }

  function reset() {
    drafts.value = []
    moved.value = new Set()
    manual.value = []
    issues.value = []
    saved.value = null
    error.value = null
  }

  return {
    drafts,
    proposal,
    loose,
    addManualPath,
    issues,
    saving,
    saved,
    error,
    incomplete,
    summary,
    hasErrors,
    sync,
    addToProject,
    newProjectFrom,
    remove,
    add,
    replace,
    issuesOf,
    replaces,
    keepBoth,
    validate,
    save,
    reset,
  }
})
