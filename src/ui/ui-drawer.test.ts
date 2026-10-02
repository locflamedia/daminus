// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick, ref } from 'vue'
import UiDrawer from './UiDrawer.vue'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

const press = (el: Element, key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}

function make(props: Record<string, unknown> = {}) {
  wrapper = mount(UiDrawer, {
    props: { open: true, label: 'Ask AI', ...props },
    slots: {
      default: () => [
        h('input', { id: 'ask' }),
        h('button', { id: 'send', type: 'button' }, 'Send'),
      ],
    },
    attachTo: document.body,
  })
  return wrapper
}

describe('UiDrawer', () => {
  it('is a labelled, non-modal dialog beside the page, with no scrim', async () => {
    make()
    await nextTick()
    const panel = wrapper!.get('[role="dialog"]')
    expect(panel.attributes('aria-modal')).toBe('false')
    expect(panel.attributes('aria-label')).toBe('Ask AI')
    expect(wrapper!.find('.scrim').exists()).toBe(false)
  })

  it('has the glass shape by default and the card shape on request', () => {
    make()
    expect(wrapper!.get('aside').classes()).toContain('drawer-glass')
    wrapper!.unmount()
    make({ variant: 'card' })
    expect(wrapper!.get('aside').classes()).toContain('drawer-card')
  })

  it('takes another width', () => {
    make({ width: '520px' })
    expect(wrapper!.get('aside').attributes('style')).toContain('width: 520px')
  })

  it('renders nothing while closed', () => {
    make({ open: false })
    expect(wrapper!.find('aside').exists()).toBe(false)
  })

  it('moves focus in, wraps Tab, asks to close on Escape and returns focus', async () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    const open = ref(true)
    const Host = {
      setup: () => () =>
        h(
          UiDrawer,
          { open: open.value, label: 'Ask AI', onClose: () => (open.value = false) },
          {
            default: () => [
              h('input', { id: 'ask' }),
              h('button', { id: 'send', type: 'button' }, 'Send'),
            ],
          },
        ),
    }
    wrapper = mount(Host, { attachTo: document.body })
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('ask')

    const send = document.getElementById('send')!
    send.focus()
    expect(press(send, 'Tab').defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('ask')

    press(document.activeElement!, 'Escape')
    await nextTick()
    await nextTick()
    expect(open.value).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('does not capture a press elsewhere', async () => {
    make()
    await nextTick()
    const page = document.createElement('button')
    document.body.append(page)
    const down = new Event('pointerdown', { bubbles: true, cancelable: true })
    page.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    expect(wrapper!.emitted('close')).toBeUndefined()
  })
})
