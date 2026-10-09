// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { i18n } from '@/i18n'
import { messages } from '@/i18n/messages'
import { globalAction, inTextField, type KeyContext } from './keys'
import ShortcutsSheet from './ShortcutsSheet.vue'
import { SHORTCUT_COUNT, SHORTCUT_GROUPS } from './shortcuts-model'
import { useShortcutsStore } from './shortcuts-store'

let wrapper: VueWrapper | undefined
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

function mountSheet(open = true) {
  wrapper = mount(ShortcutsSheet, {
    props: { open },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return wrapper
}

describe('the sheet', () => {
  it('lists the 19 shortcuts of four groups', () => {
    const w = mountSheet()
    expect(SHORTCUT_COUNT).toBe(19)
    expect(w.findAll('.group')).toHaveLength(4)
    expect(w.findAll('.row')).toHaveLength(19)
    expect(w.find('.count').text()).toBe('19 shortcuts')
  })

  it('draws nothing while closed and closes on Escape and on the scrim', async () => {
    const closed = mountSheet(false)
    expect(closed.find('.sheet').exists()).toBe(false)
    closed.unmount()
    const w = mountSheet()
    await nextTick()
    await w.find('.sheet').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('close')).toHaveLength(1)
    await w.find('.scrim').trigger('mousedown')
    expect(w.emitted('close')).toHaveLength(2)
  })

  it('dims rows that do not match and counts the matches', async () => {
    const w = mountSheet()
    await w.find('input').setValue('expected')
    expect(w.find('.count').text()).toBe('1 match')
    expect(w.find('[data-shortcut="expected"]').classes()).toContain('hit')
    expect(w.find('[data-shortcut="scan"]').classes()).toContain('dim')
  })

  it('matches on the keys too, and says so when none match', async () => {
    const w = mountSheet()
    await w.find('input').setValue('⌘k')
    expect(w.find('[data-shortcut="search"]').classes()).toContain('hit')
    await w.find('input').setValue('zzzz')
    expect(w.find('.count').text()).toBe('0 matches')
  })

  it('starts with an empty search each time it opens', async () => {
    const w = mountSheet()
    await w.find('input').setValue('scan')
    await w.setProps({ open: false })
    await w.setProps({ open: true })
    expect((w.find('input').element as HTMLInputElement).value).toBe('')
  })
})

describe('the store', () => {
  it('opens, closes and toggles', () => {
    const s = useShortcutsStore()
    s.show()
    expect(s.open).toBe(true)
    s.toggle()
    expect(s.open).toBe(false)
    s.show()
    s.close()
    expect(s.open).toBe(false)
  })
})

const ctx: KeyContext = { route: 'server', suspended: false, scanning: false, canScan: true }
const key = (init: KeyboardEventInit & { key: string }, target?: Element) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, ...init })
  if (target) Object.defineProperty(e, 'target', { value: target })
  return e
}

describe('global keys', () => {
  it('opens the sheet with ? but never from a text field', () => {
    expect(globalAction(key({ key: '?', shiftKey: true }), ctx)).toBe('sheet')
    for (const tag of ['input', 'textarea']) {
      expect(globalAction(key({ key: '?' }, document.createElement(tag)), ctx)).toBeNull()
    }
    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(inTextField(editable)).toBe(true)
    expect(inTextField(document.createElement('button'))).toBe(false)
  })

  it('routes the command keys', () => {
    expect(globalAction(key({ key: ',', metaKey: true }), ctx)).toBe('settings')
    expect(globalAction(key({ key: '1', metaKey: true }), ctx)).toBe('overview')
    expect(globalAction(key({ key: '2', metaKey: true }), ctx)).toBe('history')
    expect(globalAction(key({ key: 'r', metaKey: true }), ctx)).toBe('scan')
  })

  it('leaves a key to the screen that owns it', () => {
    const overview = { ...ctx, route: 'overview' }
    expect(globalAction(key({ key: 'r', metaKey: true }), overview)).toBeNull()
    expect(globalAction(key({ key: '1', metaKey: true }), { ...ctx, route: 'project' })).toBeNull()
    expect(globalAction(key({ key: 'r', metaKey: true }), { ...ctx, scanning: true })).toBeNull()
    expect(globalAction(key({ key: 'r', metaKey: true }), { ...ctx, canScan: false })).toBeNull()
    expect(globalAction(key({ key: '?' }), { ...ctx, suspended: true })).toBeNull()
  })
})

describe('messages', () => {
  it('has a label for every row and group in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      const tree = messages[locale].shortcuts as { groups: object; rows: object }
      for (const g of SHORTCUT_GROUPS) {
        expect(tree.groups).toHaveProperty(g.id)
        for (const row of g.rows) expect(tree.rows).toHaveProperty(row.label)
      }
    }
  })
})

describe('global keys while something else owns them', () => {
  it('ignores a held key and every shortcut under an open palette or sheet', () => {
    expect(globalAction(key({ key: ',', metaKey: true, repeat: true }), ctx)).toBeNull()
    expect(globalAction(key({ key: ',', metaKey: true }), ctx)).toBe('settings')
    const open = { ...ctx, overlayOpen: true }
    for (const k of [',', '1', '2', 'r']) {
      expect(globalAction(key({ key: k, metaKey: true }), open)).toBeNull()
    }
  })
})
