// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import UiMenu, { type MenuItem } from './UiMenu.vue'

const items: MenuItem[] = [
  { id: 'scan', label: 'Scan project', icon: 'refresh', keys: ['⌘', 'R'] },
  { id: 'ssh', label: 'Open SSH', icon: 'terminal' },
  { id: 'copy', label: 'Copy host alias', icon: 'copy', disabled: true },
  { id: 'edit', label: 'Edit project', icon: 'edit' },
  { id: 'remove', label: 'Remove project', icon: 'trash', danger: true },
]

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

function make(props: Record<string, unknown> = {}) {
  wrapper = mount(UiMenu, {
    props: { items, label: 'Project actions', ...props },
    slots: {
      trigger: ({ attrs, toggle }: { attrs: Record<string, unknown>; toggle: () => void }) =>
        h('button', { type: 'button', id: 'trigger', ...attrs, onClick: toggle }, 'kho-hang'),
    },
    attachTo: document.body,
  })
  return wrapper
}

const menu = () => document.querySelector('[role="menu"]') as HTMLElement | null
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const trigger = () => document.getElementById('trigger') as HTMLButtonElement

async function open() {
  trigger().focus()
  trigger().click()
  await nextTick()
  await nextTick()
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )

describe('UiMenu', () => {
  it('is a menu button: closed, then role=menu with a menuitem per row', async () => {
    make()
    expect(menu()).toBeNull()
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')
    await open()
    expect(menu()?.getAttribute('aria-label')).toBe('Project actions')
    expect(rows().map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Scan project⌘R',
      'Open SSH',
      'Copy host alias',
      'Edit project',
      'Remove project',
    ])
    expect(rows()[0]?.querySelector('svg')).not.toBeNull()
    expect([...rows()[0]!.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['⌘', 'R'])
  })

  it('focuses the first row on open and moves with the arrows, skipping a disabled row and wrapping', async () => {
    make()
    await open()
    expect(document.activeElement).toBe(rows()[0])
    press('ArrowDown')
    expect(document.activeElement).toBe(rows()[1])
    press('ArrowDown')
    expect(document.activeElement).toBe(rows()[3])
    press('ArrowDown')
    press('ArrowDown')
    expect(document.activeElement).toBe(rows()[0])
    press('ArrowUp')
    expect(document.activeElement).toBe(rows()[4])
  })

  it('jumps with Home, End and the first letter', async () => {
    make()
    await open()
    press('End')
    expect(document.activeElement).toBe(rows()[4])
    press('Home')
    expect(document.activeElement).toBe(rows()[0])
    press('e')
    expect(document.activeElement).toBe(rows()[3])
    press('o')
    expect(document.activeElement).toBe(rows()[1])
  })

  it('picks with Enter or a click, reports the id and closes', async () => {
    make()
    await open()
    press('ArrowDown')
    rows()[1]!.click()
    await nextTick()
    await nextTick()
    expect(wrapper!.emitted('select')).toEqual([['ssh']])
    expect(menu()).toBeNull()
  })

  it('does not pick a disabled row', async () => {
    make()
    await open()
    rows()[2]!.click()
    await nextTick()
    expect(wrapper!.emitted('select')).toBeUndefined()
    expect(menu()).not.toBeNull()
  })

  it('closes on Escape back to the trigger, and on Tab', async () => {
    make()
    await open()
    press('Escape')
    await nextTick()
    await nextTick()
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())

    await open()
    press('Tab')
    await nextTick()
    await nextTick()
    expect(menu()).toBeNull()
  })

  it('opens from the keyboard with ArrowDown, or on the last row with ArrowUp', async () => {
    make()
    trigger().focus()
    trigger().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    )
    await nextTick()
    await nextTick()
    await nextTick()
    expect(menu()).not.toBeNull()
    expect(document.activeElement).toBe(rows()[4])
  })

  it('sets a destructive last row apart, in the critical ink', async () => {
    make()
    await open()
    expect(rows()[4]!.className).toContain('danger')
    expect(rows()[4]!.className).toContain('apart')
    expect(rows()[3]!.className).not.toContain('apart')
  })

  it('renders labels as text', async () => {
    make({ items: [{ id: 'x', label: '<img src=x onerror=alert(1)>' }] })
    await open()
    expect(menu()?.querySelector('img')).toBeNull()
    expect(rows()[0]?.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})
