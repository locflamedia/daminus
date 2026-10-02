// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { focusableIn, useFocusTrap } from './focus-trap'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

function harness(onEscape = vi.fn(), start = true) {
  const active = ref(start)
  const Host = defineComponent({
    setup() {
      const root = ref<HTMLElement>()
      useFocusTrap(root, active, { onEscape })
      return () =>
        h('div', [
          h('button', { id: 'before' }, 'before'),
          h('div', { ref: root, id: 'panel' }, [
            h('button', { id: 'a' }, 'a'),
            h('input', { id: 'b' }),
            h('button', { id: 'c', disabled: true }, 'c'),
            h('a', { id: 'd', href: '#x' }, 'd'),
          ]),
        ])
    },
  })
  document.body.replaceChildren()
  wrapper = mount(Host, { attachTo: document.body })
  return { active, onEscape }
}

const key = (target: Element, name: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

describe('focusableIn', () => {
  it('lists enabled, visible controls in order', () => {
    const root = document.createElement('div')
    const add = (
      parent: Element,
      tag: string,
      text: string,
      attrs: Record<string, string> = {},
    ) => {
      const el = document.createElement(tag)
      el.textContent = text
      for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
      parent.append(el)
      return el
    }
    add(root, 'button', '1')
    add(root, 'button', '2', { disabled: '' })
    add(root, 'input', '', { type: 'hidden' })
    add(root, 'a', '3', { href: '#' })
    add(root, 'span', '4', { tabindex: '0' })
    add(root, 'span', '5', { tabindex: '-1' })
    add(root, 'button', '6', { hidden: '' })
    add(add(root, 'div', '', { inert: '' }), 'button', '7')
    expect(focusableIn(root).map((el) => el.textContent)).toEqual(['1', '3', '4'])
  })
})

describe('useFocusTrap', () => {
  it('moves focus to the first control when it opens', async () => {
    harness()
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('a')
  })

  it('wraps Tab from the last control to the first and Shift+Tab the other way', async () => {
    harness()
    await nextTick()
    const last = document.getElementById('d')!
    last.focus()
    expect(key(last, 'Tab').defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('a')

    const event = key(document.getElementById('a')!, 'Tab', { shiftKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('d')
  })

  it('leaves Tab alone in the middle', async () => {
    harness()
    await nextTick()
    const middle = document.getElementById('b')!
    middle.focus()
    expect(key(middle, 'Tab').defaultPrevented).toBe(false)
  })

  it('sends Escape to the handler once, unless something inside already handled it', async () => {
    const { onEscape } = harness()
    await nextTick()
    const field = document.getElementById('b')!
    field.focus()
    key(field, 'Escape')
    expect(onEscape).toHaveBeenCalledTimes(1)

    field.addEventListener('keydown', (e) => e.preventDefault(), { once: true })
    key(field, 'Escape')
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('returns focus to where it was when it closes', async () => {
    const { active } = harness(vi.fn(), false)
    const before = document.getElementById('before')!
    before.focus()
    active.value = true
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('a')
    active.value = false
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(before)
  })

  it('does not take focus back from a control the user pressed outside', async () => {
    const { active } = harness(vi.fn(), false)
    const before = document.getElementById('before')!
    active.value = true
    await nextTick()
    await nextTick()
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    elsewhere.focus()
    active.value = false
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(elsewhere)
    expect(document.activeElement).not.toBe(before)
  })
})
