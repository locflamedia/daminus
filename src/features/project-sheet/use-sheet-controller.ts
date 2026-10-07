// The state and the actions of the project sheet: the copy of the draft being edited, what the
// core says about it, which errors are shown yet, the changes since it opened, and Save and
// Remove. The sheet opens on a copy, so Cancel and Escape lose nothing but the edits.
import { computed, nextTick, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  type AppError,
  type Project,
  type ProjectIssue,
  isAppError,
  projectsRemove,
  projectsSave,
} from '@/api'
import { errorText } from '@/lib/issue-text'
import { issueSentence } from '@/lib/project-issues'
import { cloneDraft, countChanges } from '@/lib/sheet-changes'
import { type FieldTarget, type MappedIssues, errorTargets, mapIssues } from '@/lib/sheet-issues'
import { type AddKind, badPath, hostForKind, isBlank, newPart, savable } from '@/lib/sheet-parts'
import { moveBy, moveItem } from '@/lib/sheet-reorder'
import {
  type DraftPart,
  type DraftProject,
  draftToProject,
  isIncomplete,
  newKey,
  partName,
  slugId,
} from '@/lib/setup-model'
import { useProjectSheetStore, type SheetRequest } from '@/stores/project-sheet'
import { useProjectsStore } from '@/stores/projects'
import { useSetupDraftsStore } from '@/stores/setup-drafts'
import { useSetupStore } from '@/stores/setup'
import { UNDO_MS, useToastStore } from '@/stores/toasts'
import { fieldSelector } from './field-selector'
import { useSheetValidation } from './use-sheet-validation'

const EMPTY: DraftProject = {
  key: '',
  id: '',
  name: '',
  color: null,
  urls: [],
  parts: [],
  envFiles: [],
  isNew: true,
  idFollowsName: true,
}

export function useSheetController() {
  const { t } = useI18n()
  const router = useRouter()
  const route = useRoute()
  const sheet = useProjectSheetStore()
  const projects = useProjectsStore()
  const setup = useSetupStore()
  const setupDrafts = useSetupDraftsStore()
  const toasts = useToastStore()

  const request = shallowRef<SheetRequest | null>(null)
  const draft = ref<DraftProject>({ ...EMPTY })
  const original = shallowRef<DraftProject>({ ...EMPTY })
  const originalProject = shallowRef<Project | null>(null)
  const expanded = ref(new Set<string>())
  const touched = ref(new Set<string>())
  const attempted = ref(false)
  const editingId = ref(false)
  const busy = ref(false)
  const confirmOpen = ref(false)
  const error = ref<AppError | null>(null)
  const errorTitle = ref<string | null>(null)
  const announce = ref('')
  /** Stable keys of the URL rows, parallel to `draft.urls` (a row keeps its probe). */
  const urlKeys = ref<string[]>([])

  const mode = computed(() => request.value?.mode ?? 'saved')

  const validation = useSheetValidation(draft, () =>
    mode.value === 'setup'
      ? setupDrafts.drafts
          .filter((d) => d.key !== draft.value.key)
          .map((d) => draftToProject(savable(d)).project)
      : [],
  )

  const all = computed<MappedIssues>(() => mapIssues(validation.issues.value, draft.value))

  /** Errors of a form that was just opened wait until the field was touched; warnings do not. */
  function revealed(field: string): boolean {
    return !draft.value.isNew || attempted.value || touched.value.has(field)
  }

  const visible = computed<MappedIssues>(() => {
    const keep = (field: string, list: ProjectIssue[]) =>
      list.filter((i) => i.level !== 'error' || revealed(field))
    const a = all.value
    const urls = new Map<number, ProjectIssue[]>()
    for (const [i, list] of a.urls) urls.set(i, keep(`url:${i}`, list))
    const parts = new Map<string, ProjectIssue[]>()
    for (const [k, list] of a.parts) parts.set(k, keep(`part:${k}`, list))
    const out: MappedIssues = {
      ...a,
      id: keep('id', a.id),
      name: keep('name', a.name),
      form: keep('form', a.form),
      urls,
      parts,
      errors: 0,
      warnings: 0,
    }
    out.errors += badPaths.value.filter((key) => revealed(`part:${key}`)).length
    const lists = [out.id, out.name, out.form, ...urls.values(), ...parts.values()]
    for (const issue of lists.flat()) {
      if (issue.level === 'error') out.errors += 1
      else out.warnings += 1
    }
    return out
  })

  const changes = computed(() => countChanges(original.value, draft.value))
  const leftOut = computed(() => draft.value.parts.length - savable(draft.value).parts.length)
  const badPaths = computed(() => draft.value.parts.filter(badPath).map((p) => p.key))

  function begin(next: SheetRequest) {
    request.value = next
    const copy = cloneDraft(next.draft)
    draft.value = copy
    original.value = cloneDraft(next.draft)
    originalProject.value = projects.details.find((p) => p.id === next.draft.id) ?? null
    expanded.value = new Set(copy.parts.filter(isIncomplete).map((p) => p.key))
    touched.value = new Set()
    attempted.value = false
    editingId.value = false
    busy.value = false
    confirmOpen.value = false
    error.value = null
    errorTitle.value = null
    announce.value = ''
    urlKeys.value = copy.urls.map(() => newKey('u'))
    validation.reset()
    void validation.validateNow()
    if (setup.entries.length === 0) void setup.load()
  }

  function touch(field: string) {
    if (!touched.value.has(field)) touched.value = new Set([...touched.value, field])
  }

  // --- edits ---------------------------------------------------------------------------
  function setName(name: string) {
    draft.value.name = name
    if (draft.value.isNew && draft.value.idFollowsName) draft.value.id = slugId(name)
    touch('name')
  }

  function setId(id: string) {
    draft.value.id = id
    draft.value.idFollowsName = false
    touch('id')
  }

  function showId() {
    editingId.value = true
    void nextTick(() => focusField({ kind: 'id' }))
  }

  function setColor(hex: string) {
    draft.value.color = hex
  }

  function setUrl(index: number, url: string) {
    draft.value.urls[index] = url
    touch(`url:${index}`)
  }

  function addUrl() {
    draft.value.urls = [...draft.value.urls, '']
    urlKeys.value = [...urlKeys.value, newKey('u')]
    void nextTick(() => focusField({ kind: 'url', index: draft.value.urls.length - 1 }))
  }

  function removeUrl(index: number) {
    draft.value.urls = draft.value.urls.filter((_, i) => i !== index)
    urlKeys.value = urlKeys.value.filter((_, i) => i !== index)
    touch('form')
  }

  function replacePart(part: DraftPart) {
    draft.value.parts = draft.value.parts.map((p) => (p.key === part.key ? part : p))
    touch(`part:${part.key}`)
  }

  /** The host a new part starts on: the project's last one, else the first of the ssh config. */
  function addHost(): string {
    return draft.value.parts.at(-1)?.host ?? setup.entries[0]?.host.alias ?? ''
  }

  /** Where discover is asked for suggestions: the project's servers, else every server. */
  function searchHosts(): string[] {
    const own = [...new Set(draft.value.parts.map((p) => p.host))]
    return own.length > 0 ? own : setup.entries.map((e) => e.host.alias)
  }

  function addPart(kind: AddKind) {
    const host = hostForKind(kind, searchHosts(), setup.recordsOf, addHost())
    const part = newPart(kind, host)
    draft.value.parts = [...draft.value.parts, part]
    if (part.kind === 'db') expanded.value = new Set([...expanded.value, part.key])
    void nextTick(() => focusField({ kind: 'part', key: part.key }))
  }

  function removePart(key: string) {
    draft.value.parts = draft.value.parts.filter((p) => p.key !== key)
    touch('form')
  }

  function say(key: string, at: number) {
    const part = draft.value.parts[at]
    if (!part) return
    announce.value = t(key, {
      name: partName(part) || t('projectSheet.parts.unnamed'),
      n: at + 1,
      total: draft.value.parts.length,
    })
  }

  function reorderPart(from: number, to: number) {
    draft.value.parts = moveItem(draft.value.parts, from, to)
    say('projectSheet.parts.moved', Math.min(Math.max(to, 0), draft.value.parts.length - 1))
  }

  function movePart(key: string, step: -1 | 1) {
    const at = draft.value.parts.findIndex((p) => p.key === key)
    draft.value.parts = moveBy(draft.value.parts, at, step)
    say('projectSheet.parts.moved', at + step)
  }

  function toggleExpanded(key: string) {
    const next = new Set(expanded.value)
    if (!next.delete(key)) next.add(key)
    expanded.value = next
  }

  // --- focus ---------------------------------------------------------------------------
  function focusField(target: FieldTarget) {
    const el = document.querySelector<HTMLElement>(fieldSelector(target))
    if (!el) return
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    el.focus({ preventScroll: true })
  }

  async function showFirstError(issues: ProjectIssue[]) {
    attempted.value = true
    const first = errorTargets(mapIssues(issues, draft.value), draft.value)[0]
    if (!first) return
    if (first.kind === 'id') editingId.value = true
    await nextTick()
    focusField(first)
  }

  // --- save and remove -----------------------------------------------------------------
  function fail(title: string, e: unknown) {
    errorTitle.value = title
    if (isAppError(e)) error.value = e
    else {
      error.value = null
      console.error(e)
    }
  }

  async function save(): Promise<void> {
    if (busy.value) return
    error.value = null
    errorTitle.value = null
    const issues = await validation.validateNow()
    if (issues.some((i) => i.level === 'error')) return showFirstError(issues)
    const badPart = badPaths.value[0]
    if (badPart) {
      attempted.value = true
      await nextTick()
      return focusField({ kind: 'part', key: badPart })
    }
    const { project } = draftToProject(savable(draft.value))
    const req = request.value
    if (!req) return
    if (req.mode === 'setup') {
      // A database part still being filled in stays in the draft; setup counts it.
      const keep = draft.value.parts.filter((p) => p.kind === 'db' || !isBlank(p))
      req.onSave?.(cloneDraft({ ...draft.value, parts: keep }))
      sheet.close()
      return
    }
    busy.value = true
    try {
      const outcome = await projectsSave([project], [])
      if (outcome.status === 'rejected') {
        validation.reset(outcome.issues.filter((i) => i.project === project.id))
        return showFirstError(outcome.issues)
      }
      await projects.loadDetails()
      toastSaved(project, outcome.issues)
      sheet.close()
    } catch (e) {
      fail(t('projectSheet.error.save'), e)
    } finally {
      busy.value = false
    }
  }

  function toastSaved(project: Project, issues: ProjectIssue[]) {
    const warnings = issues.filter(
      (i) => i.level === 'warning' && i.code.kind !== 'replaces_existing',
    )
    if (warnings.length === 0) {
      toasts.push({ tone: 'ok', title: t('projectSheet.toast.saved', { id: project.id }) })
      return
    }
    toasts.push({
      tone: 'ok',
      title: t(
        'projectSheet.toast.savedWarn',
        { id: project.id, n: warnings.length },
        warnings.length,
      ),
      detail: warnings.map((w) => issueSentence(w, project, t)).join(' · '),
    })
  }

  async function remove(): Promise<void> {
    const req = request.value
    if (!req || busy.value) return
    if (req.mode === 'setup') {
      req.onRemove?.()
      sheet.close()
      return
    }
    const id = draft.value.id
    const restore = originalProject.value ?? draftToProject(savable(original.value)).project
    busy.value = true
    try {
      await projectsRemove(id)
      await projects.loadDetails()
      toasts.push({
        title: t('projectSheet.toast.removed', { id }),
        duration: UNDO_MS,
        action: { label: t('projectSheet.toast.undo'), run: () => void undoRemove(restore) },
      })
      sheet.close()
      if (route.params.id === id) await router.push('/')
    } catch (e) {
      fail(t('projectSheet.error.remove'), e)
    } finally {
      busy.value = false
    }
  }

  async function undoRemove(project: Project) {
    try {
      await projectsSave([project], [])
      await projects.loadDetails()
      toasts.push({ tone: 'ok', title: t('projectSheet.toast.restored', { id: project.id }) })
    } catch (e) {
      toasts.push({
        tone: 'crit',
        title: t('projectSheet.error.undo'),
        detail: isAppError(e) ? errorText(e) : undefined,
      })
    }
  }

  /** Escape and the close button: ask first only when something changed. */
  function requestClose() {
    if (changes.value > 0) confirmOpen.value = true
    else sheet.close()
  }

  function discard() {
    confirmOpen.value = false
    sheet.close()
  }

  return reactive({
    request,
    draft,
    mode,
    visible,
    hosts: computed(() => setup.entries.map((e) => e.host.alias)),
    expanded,
    announce,
    editingId,
    leftOut,
    changes,
    busy,
    confirmOpen,
    error,
    errorTitle,
    urlKeys,
    begin,
    touch,
    isShown: revealed,
    setName,
    setId,
    showId,
    setColor,
    setUrl,
    addUrl,
    removeUrl,
    replacePart,
    addPart,
    removePart,
    movePart,
    reorderPart,
    toggleExpanded,
    addHost,
    searchHosts,
    focusField,
    save,
    remove,
    requestClose,
    discard,
  })
}

export type SheetController = ReturnType<typeof useSheetController>
