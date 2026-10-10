// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Project } from '@/api'
import { mockValidate } from '@/api/dev-mock-setup'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { vEnter } from '@/lib/motion'
import { type DraftProject, draftFromProject, emptyDraft } from '@/lib/setup-model'
import { useProjectSheetStore } from '@/stores/project-sheet'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { report } from '@/testing/report-fixture'
import { useToastStore } from '@/stores/toasts'
import { SAVED_PROJECTS } from '@/testing/setup-fixture'
import ProjectSheet from './ProjectSheet.vue'

const calls: Array<{ cmd: string; args: Record<string, unknown> }> = []
let saved: Project[] = []

function core() {
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    switch (cmd) {
      case 'projects_validate':
        return mockValidate(
          args.projects as Project[],
          null,
          saved.map((p) => p.id),
        )
      case 'projects_save': {
        const sent = args.projects as Project[]
        saved = [...saved.filter((p) => !sent.some((s) => s.id === p.id)), ...sent]
        const issues = mockValidate(sent, null, [])
        return issues.some((i) => i.level === 'error')
          ? { status: 'rejected', issues }
          : { status: 'saved', issues, projects: saved.length }
      }
      case 'projects_remove':
        saved = saved.filter((p) => p.id !== args.id)
        return true
      case 'projects_list':
        return structuredClone(saved)
      case 'url_check':
        return { status: 200, ms: 90, tls_days: 61, failure: null }
      case 'hosts_list':
        return { list: { config_found: true, hosts: [], skipped: [], empty: null }, entries: [] }
      case 'ssh_environment':
        return { agent: 'keys', keys: 1, termius_installed: false }
      default:
        throw new Error(`unexpected command ${cmd}`)
    }
  })
}

let wrapper: VueWrapper | undefined

async function open(draft: DraftProject, mode: 'setup' | 'saved' = 'saved', extra = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  wrapper = mount(ProjectSheet, {
    attachTo: document.body,
    global: { plugins: [i18n, router], directives: { enter: vEnter } },
  })
  useProjectSheetStore().open({ draft, mode, ...extra })
  await settle()
  return wrapper
}

/** Lets the debounced validation, the URL probes and the promises of the sheet finish. */
async function settle() {
  await vi.advanceTimersByTimeAsync(800)
  await flushPromises()
}

const text = () => document.body.textContent ?? ''
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label))

async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`no ${selector}`)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  setI18nLocale('en')
  saved = structuredClone(SAVED_PROJECTS)
  calls.length = 0
  core()
  useProjectsStore().details = structuredClone(SAVED_PROJECTS)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  clearMocks()
  vi.useRealTimers()
  document.body.replaceChildren()
})

const edit = () => draftFromProject(SAVED_PROJECTS[0]!)

describe('opening', () => {
  it('shows a saved project: title, id, URLs with their answer, parts and Remove', async () => {
    await open(edit())
    expect(text()).toContain('Edit project')
    expect(document.querySelector('.layer')?.classList.contains('pinned')).toBe(true)
    expect(text()).toContain('tiemtra · 4 parts on 2 servers')
    expect(document.querySelectorAll<HTMLInputElement>('[data-sheet-field^="url:"]')).toHaveLength(
      2,
    )
    expect(text()).toContain('200')
    expect(text()).toContain('TLS 61 d')
    expect(document.querySelectorAll('[data-part]')).toHaveLength(4)
    expect(button('Remove project')).toBeTruthy()
    expect(text()).toContain('Undo for 8 s after')
    expect(text()).not.toContain('unsaved change')
    // The "Expect 2xx" select is not part of the data model: it is not drawn.
    expect(text()).not.toContain('2xx')
  })

  it('says it in Vietnamese', async () => {
    setI18nLocale('vi')
    await open(edit())
    expect(text()).toContain('Sửa dự án')
    expect(text()).toContain('URL cần kiểm tra')
    expect(text()).toContain('Xóa dự án')
  })

  it('leaves the id fixed once saved, and editable while new', async () => {
    await open(edit())
    expect(document.querySelector('.id-edit')).toBeNull()
    wrapper?.unmount()
    document.body.replaceChildren()
    await open({ ...emptyDraft('#4f6bed') })
    expect(document.querySelector('.id-edit')).not.toBeNull()
    expect(text()).toContain('New project')
  })
})

describe('closing', () => {
  it('counts changes, and Escape asks before it discards them', async () => {
    await open(edit())
    await type('[data-sheet-field="name"]', 'Tiem Tra')
    expect(text()).toContain('1 unsaved change')
    document
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )
    await flushPromises()
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    button('Discard')?.click()
    await flushPromises()
    expect(useProjectSheetStore().isOpen).toBe(false)
  })

  it('closes at once on Escape when nothing changed', async () => {
    await open(edit())
    document
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )
    await flushPromises()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(useProjectSheetStore().isOpen).toBe(false)
  })

  it('Cancel discards without asking', async () => {
    await open(edit())
    await type('[data-sheet-field="name"]', 'other')
    button('Cancel')?.click()
    await flushPromises()
    expect(useProjectSheetStore().isOpen).toBe(false)
    expect(calls.some((c) => c.cmd === 'projects_save')).toBe(false)
  })
})

describe('saving a saved project', () => {
  it('writes it, reads projects.json again, toasts and closes', async () => {
    await open(edit())
    await type('[data-sheet-field="name"]', 'Tiem Tra')
    button('Save')?.click()
    await settle()
    const save = calls.find((c) => c.cmd === 'projects_save')
    expect((save?.args.projects as Project[])[0]).toMatchObject({ id: 'tiemtra', name: 'Tiem Tra' })
    expect(calls.some((c) => c.cmd === 'projects_list')).toBe(true)
    expect(useToastStore().toasts[0]?.title).toBe('Saved tiemtra')
    expect(useProjectSheetStore().isOpen).toBe(false)
  })

  it('lists the warnings in one toast', async () => {
    const draft = edit()
    draft.urls = ['https://tiemtra.vn', 'http://10.0.0.5/health']
    draft.parts[0] = { ...draft.parts[0]!, host: 'x' }
    await open(draft)
    mockCommands((cmd, args) => {
      if (cmd === 'projects_validate')
        return mockValidate(args.projects as Project[], ['vps-sg-2'], [])
      if (cmd === 'projects_save') {
        return {
          status: 'saved',
          issues: mockValidate(args.projects as Project[], ['vps-sg-2'], []),
          projects: 1,
        }
      }
      return cmd === 'projects_list' ? [] : { status: 200, ms: 1, tls_days: null, failure: null }
    })
    button('Save')?.click()
    await settle()
    const toast = useToastStore().toasts[0]
    expect(toast?.title).toBe('Saved tiemtra with 2 warnings')
    expect(toast?.detail).toContain('Private network.')
    expect(toast?.detail).toContain('x is not in ~/.ssh/config')
  })

  it('keeps the sheet open and says why when the core rejects it', async () => {
    await open(edit())
    await type('[data-sheet-field="name"]', '')
    expect(text()).toContain('Name can’t be empty.')
    expect(text()).toContain('1 error to fix')
    button('Save')?.click()
    await settle()
    expect(calls.some((c) => c.cmd === 'projects_save')).toBe(false)
    expect(useProjectSheetStore().isOpen).toBe(true)
  })
})

describe('field checks', () => {
  it('waits to show the errors of a new project until Save is tried, then goes to the first', async () => {
    await open({ ...emptyDraft('#4f6bed') })
    expect(text()).not.toContain('Name can’t be empty.')
    expect(text()).not.toContain('error to fix')
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', metaKey: true }))
    await settle()
    expect(text()).toContain('Name can’t be empty.')
    expect(text()).toContain('Nothing to check. Add a URL or a part.')
    expect(document.activeElement).toBe(document.querySelector('[data-sheet-field="name"]'))
    expect(calls.some((c) => c.cmd === 'projects_save')).toBe(false)
  })

  it('follows the name with the id until the id is typed', async () => {
    await open({ ...emptyDraft('#4f6bed') })
    await type('[data-sheet-field="name"]', 'Shop Online')
    expect(document.querySelector('.id-edit')?.textContent).toContain('shop-online')
    document.querySelector<HTMLElement>('.id-edit')?.click()
    await settle()
    await type('[data-sheet-field="id"]', 'shop')
    await type('[data-sheet-field="name"]', 'Shop Two')
    expect(document.querySelector<HTMLInputElement>('[data-sheet-field="id"]')?.value).toBe('shop')
  })

  it('tells a bad URL in words and does not probe it', async () => {
    const draft = edit()
    draft.urls = ['ftp://tiemtra.vn']
    await open(draft)
    expect(text()).toContain('Only http:// and https:// addresses can be checked.')
    expect(calls.filter((c) => c.cmd === 'url_check')).toHaveLength(0)
  })

  it('keeps Save enabled for the local-address warnings', async () => {
    const draft = edit()
    draft.urls = ['http://localhost:3000']
    await open(draft)
    expect(text()).toContain('Points at this Mac.')
    expect(button('Save')?.hasAttribute('disabled')).toBe(false)
    expect(button('Save')?.getAttribute('aria-disabled')).toBeNull()
  })

  it('shows the amber chip when a new project would replace a saved one', async () => {
    const draft = edit()
    draft.isNew = true
    await open(draft, 'setup', { onSave: () => undefined })
    expect(text()).toContain('Already saved · Save replaces it')
  })
})

describe('parts', () => {
  it('moves a part from its menu', async () => {
    await open(edit())
    const order = () =>
      [...document.querySelectorAll('[data-handle]')].map((e) => e.getAttribute('aria-label'))
    expect(order()[0]).toBe('Reorder tiemtra-web')
    document.querySelector<HTMLElement>('[data-part] [aria-label="More for tiemtra-web"]')?.click()
    await flushPromises()
    document
      .querySelectorAll<HTMLElement>('[role="menuitem"]')
      .forEach((el) => el.textContent?.includes('Move down') && el.click())
    await flushPromises()
    expect(order()[0]).toBe('Reorder tiemtra-api')
    expect(text()).toContain('1 unsaved change')
  })

  it('moves a part with the keys on its grip', async () => {
    await open(edit())
    const grip = document.querySelector<HTMLElement>('[data-handle]')!
    grip.focus()
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    grip.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    )
    await flushPromises()
    expect(document.querySelectorAll('[data-handle]')[1]?.getAttribute('aria-label')).toBe(
      'Reorder tiemtra-web',
    )
  })

  it('adds a part from the menu and leaves it out of the save while it is blank', async () => {
    await open(edit())
    button('Add part')?.click()
    await flushPromises()
    document
      .querySelectorAll<HTMLElement>('[role="menuitem"]')
      .forEach((el) => el.textContent?.includes('Folder path') && el.click())
    await settle()
    expect(document.querySelectorAll('[data-part]')).toHaveLength(5)
    expect(text()).toContain('1 unfinished part isn’t saved')
    button('Save')?.click()
    await settle()
    const save = calls.find((c) => c.cmd === 'projects_save')
    expect((save?.args.projects as Project[])[0]?.components).toHaveLength(4)
  })

  it('refuses a folder that is not an absolute path', async () => {
    await open(edit())
    button('Add part')?.click()
    await flushPromises()
    document
      .querySelectorAll<HTMLElement>('[role="menuitem"]')
      .forEach((el) => el.textContent?.includes('Folder path') && el.click())
    await settle()
    const field = document.querySelector<HTMLInputElement>('[data-part]:last-child input')!
    field.value = 'var/www'
    field.dispatchEvent(new Event('input'))
    field.dispatchEvent(new Event('blur'))
    await settle()
    expect(text()).toContain('Use an absolute path, starting with /')
    button('Save')?.click()
    await settle()
    expect(calls.some((c) => c.cmd === 'projects_save')).toBe(false)
  })

  it('opens the details of a database part inline', async () => {
    await open(edit())
    expect(text()).not.toContain('Values are read on the server')
    document.querySelector<HTMLElement>('[aria-label="Show the database details"]')?.click()
    await flushPromises()
    expect(text()).toContain('.env on the server')
    expect(text()).toContain('Values are read on the server at scan time and never leave it.')
    expect(text()).not.toContain('DB_PASSWORD')
  })
})

describe('setup mode', () => {
  it('hands the edited draft back and writes nothing', async () => {
    const onSave = vi.fn()
    await open({ ...edit(), isNew: true }, 'setup', { onSave })
    await type('[data-sheet-field="name"]', 'Renamed')
    button('Save')?.click()
    await settle()
    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ name: 'Renamed', id: 'tiemtra' })
    expect(calls.some((c) => c.cmd === 'projects_save')).toBe(false)
    expect(useProjectSheetStore().isOpen).toBe(false)
  })

  it('offers "Remove from setup" only when the caller can remove', async () => {
    await open({ ...edit(), isNew: true }, 'setup', { onSave: () => undefined })
    expect(button('Remove from setup')).toBeUndefined()
    wrapper?.unmount()
    document.body.replaceChildren()
    const onRemove = vi.fn()
    await open({ ...edit(), isNew: true }, 'setup', { onSave: () => undefined, onRemove })
    button('Remove from setup')?.click()
    await flushPromises()
    expect(onRemove).toHaveBeenCalledOnce()
    expect(useProjectSheetStore().isOpen).toBe(false)
  })
})

describe('removing', () => {
  it('removes with no dialog and offers Undo for 8 s, which saves the project back', async () => {
    await open(edit())
    button('Remove project')?.click()
    await settle()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(calls.some((c) => c.cmd === 'projects_remove' && c.args.id === 'tiemtra')).toBe(true)
    const toast = useToastStore().toasts[0]
    expect(toast?.title).toBe('Removed tiemtra')
    expect(toast?.duration).toBe(8000)
    toast?.action?.run()
    await settle()
    const restore = calls.filter((c) => c.cmd === 'projects_save').at(-1)
    expect((restore?.args.projects as Project[])[0]).toEqual(SAVED_PROJECTS[0])
  })
})

describe('header scan line', () => {
  it('says when it was last scanned only when a report exists', async () => {
    await open(edit())
    expect(text()).not.toContain('last scan')
    wrapper?.unmount()
    document.body.replaceChildren()
    useReportStore().latest = report()
    await open(edit())
    expect(text()).toContain('last scan')
  })
})
