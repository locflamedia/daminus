// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import UiTooltip from './UiTooltip.vue'

let wrapper: VueWrapper | undefined

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  document.body.replaceChildren()
})

function make(props: Record<string, unknown> = {}) {
  wrapper = mount(UiTooltip, {
    props: { text: 'Scan all', ...props },
    slots: { default: () => h('button', { type: 'button', id: 'trigger' }, 'Scan') },
    attachTo: document.body,
  })
  return wrapper
}

const tip = () => document.querySelector('[role="tooltip"]')
const trigger = () => document.getElementById('trigger') as HTMLElement

async function hover() {
  trigger().dispatchEvent(
    new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }),
  )
  await nextTick()
}

function leave() {
  trigger().dispatchEvent(
    new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
  )
}

describe('UiTooltip', () => {
  it('opens at once while pinned, and leaves when the pointer leaves or the pin is dropped', async () => {
    make({ pinned: false })
    expect(tip()).toBeNull()
    await wrapper!.setProps({ pinned: true })
    await nextTick()
    expect(tip()?.textContent).toContain('Scan all')
    expect(trigger().getAttribute('aria-describedby')).toBe(tip()?.id)
    await wrapper!.setProps({ pinned: false })
    await nextTick()
    expect(tip()).toBeNull()
    await wrapper!.setProps({ pinned: true })
    await nextTick()
    leave()
    await nextTick()
    expect(tip()).toBeNull()
  })

  it('removes a native title that repeats its words, so the system tip does not double it', () => {
    wrapper = mount(UiTooltip, {
      props: { text: 'Scan all' },
      slots: { default: () => h('button', { id: 'trigger', title: 'Scan all' }, 'S') },
      attachTo: document.body,
    })
    expect(trigger().hasAttribute('title')).toBe(false)
    wrapper.unmount()
    wrapper = mount(UiTooltip, {
      props: { text: 'Scan all' },
      slots: { default: () => h('button', { id: 'trigger', title: 'Other' }, 'S') },
      attachTo: document.body,
    })
    expect(trigger().getAttribute('title')).toBe('Other')
  })

  it('wraps its trigger without adding a box', () => {
    make()
    expect(wrapper!.element.className).toContain('tooltip-root')
    expect(trigger()).not.toBeNull()
    expect(tip()).toBeNull()
  })

  it('opens 400 ms after the pointer rests, not before', async () => {
    make()
    await hover()
    vi.advanceTimersByTime(399)
    await nextTick()
    expect(tip()).toBeNull()
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(tip()?.textContent).toContain('Scan all')
  })

  it('describes the trigger while open and says nothing after', async () => {
    make()
    await hover()
    vi.advanceTimersByTime(400)
    await nextTick()
    const id = tip()!.id
    expect(trigger().getAttribute('aria-describedby')).toBe(id)
    leave()
    await nextTick()
    expect(trigger().hasAttribute('aria-describedby')).toBe(false)
  })

  it('leaves at once when the pointer leaves, and never opens if it left in time', async () => {
    make()
    await hover()
    vi.advanceTimersByTime(200)
    leave()
    vi.advanceTimersByTime(500)
    await nextTick()
    expect(tip()).toBeNull()

    await hover()
    vi.advanceTimersByTime(400)
    await nextTick()
    expect(tip()).not.toBeNull()
    leave()
    await nextTick()
    expect(tip()).toBeNull()
  })

  it('opens at once for a neighbour right after another closed, and waits again later', async () => {
    make()
    await hover()
    vi.advanceTimersByTime(400)
    await nextTick()
    leave()
    await nextTick()
    expect(tip()).toBeNull()

    vi.advanceTimersByTime(100)
    await hover()
    await nextTick()
    expect(tip()).not.toBeNull()
    leave()
    await nextTick()

    vi.advanceTimersByTime(1000)
    await hover()
    expect(tip()).toBeNull()
  })

  it('goes on a click or Escape', async () => {
    make()
    await hover()
    vi.advanceTimersByTime(400)
    await nextTick()
    trigger().dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(tip()).toBeNull()

    vi.advanceTimersByTime(1000)
    await hover()
    vi.advanceTimersByTime(400)
    await nextTick()
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(tip()).toBeNull()
  })

  it('shows the shortcut as keys and renders the words as text', async () => {
    make({ text: '<img src=x onerror=alert(1)>', keys: ['⌘', 'R'] })
    await hover()
    vi.advanceTimersByTime(400)
    await nextTick()
    expect(tip()?.querySelector('img')).toBeNull()
    expect(tip()?.textContent).toContain('<img src=x onerror=alert(1)>')
    expect([...tip()!.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['⌘', 'R'])
  })

  it('stays closed when disabled', async () => {
    make({ disabled: true })
    await hover()
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(tip()).toBeNull()
  })

  it('closes when unmounted', async () => {
    make()
    await hover()
    vi.advanceTimersByTime(400)
    await nextTick()
    wrapper!.unmount()
    wrapper = undefined
    expect(tip()).toBeNull()
  })
})
