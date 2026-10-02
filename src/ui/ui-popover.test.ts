// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import UiPopover from './UiPopover.vue'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

function make(props: Record<string, unknown> = {}) {
  wrapper = mount(UiPopover, {
    props: { label: 'Needs permission', ...props },
    slots: {
      trigger: ({ attrs, toggle }: { attrs: Record<string, unknown>; toggle: () => void }) =>
        h('button', { type: 'button', id: 'trigger', ...attrs, onClick: toggle }, 'Details'),
      default: () => [
        h('span', { class: 'copy' }, "deploy can't read the Docker socket"),
        h('button', { type: 'button', id: 'inner-a' }, 'Copy'),
        h('button', { type: 'button', id: 'inner-b' }, 'Close'),
      ],
    },
    attachTo: document.body,
  })
  return wrapper
}

const panel = () => document.querySelector('[role="dialog"]') as HTMLElement | null
const trigger = () => document.getElementById('trigger') as HTMLButtonElement

async function open() {
  trigger().focus()
  trigger().click()
  await nextTick()
  await nextTick()
}

const press = (el: Element, key: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

describe('UiPopover', () => {
  it('is a radius-12 surface, a step tighter than a menu', async () => {
    make({ open: true })
    await nextTick()
    await nextTick()
    const surface = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(surface?.style.borderRadius).toBe('12px')
  })

  it('is closed until the trigger is pressed, and the trigger says what it opens', async () => {
    make()
    expect(panel()).toBeNull()
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    await open()
    expect(panel()?.getAttribute('aria-label')).toBe('Needs permission')
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(trigger().getAttribute('aria-controls')).toBe(panel()!.querySelector('.popover')!.id)
  })

  it('moves focus into the panel and keeps Tab inside it', async () => {
    make()
    await open()
    expect(document.activeElement?.id).toBe('inner-a')
    const last = document.getElementById('inner-b')!
    last.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    last.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('inner-a')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    make()
    await open()
    press(document.activeElement!, 'Escape')
    await nextTick()
    await nextTick()
    expect(panel()).toBeNull()
    expect(wrapper!.emitted('update:open')?.at(-1)).toEqual([false])
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on a press outside, and not on a press inside or on the trigger', async () => {
    make()
    await open()
    document.getElementById('inner-a')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(panel()).not.toBeNull()
    trigger().dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(panel()).not.toBeNull()

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    await nextTick()
    expect(panel()).toBeNull()
  })

  it('toggles from the trigger and honours v-model:open', async () => {
    make({ open: true })
    await nextTick()
    await nextTick()
    expect(panel()).not.toBeNull()
    trigger().click()
    await nextTick()
    expect(wrapper!.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('renders its words as text', async () => {
    wrapper = mount(UiPopover, {
      props: { label: 'x', open: true },
      slots: { default: () => '<img src=x onerror=alert(1)>' },
      attachTo: document.body,
    })
    await nextTick()
    expect(panel()?.querySelector('img')).toBeNull()
    expect(panel()?.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})
