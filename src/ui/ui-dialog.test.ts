// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import UiDialog from './UiDialog.vue'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

function make(props: Record<string, unknown> = {}) {
  wrapper = mount(UiDialog, {
    props: {
      open: true,
      title: 'The identity of vps-sg-1 changed',
      description: 'Scanning this host is paused until you decide.',
      alert: true,
      ...props,
    },
    slots: {
      default: () => h('div', { class: 'details' }, 'Known SHA256:9xQ2…vT8a'),
      footer: () => [
        h('button', { id: 'keep', type: 'button' }, 'Keep paused'),
        h('button', { id: 'trust', type: 'button' }, 'Trust new key'),
      ],
    },
    attachTo: document.body,
  })
  return wrapper
}

describe('UiDialog', () => {
  it('is an alert dialog named by its title and described by its sentence', async () => {
    make()
    await nextTick()
    const dialog = wrapper!.get('[role="alertdialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe(wrapper!.get('h2').attributes('id'))
    expect(dialog.attributes('aria-describedby')).toBe(wrapper!.get('p').attributes('id'))
  })

  it('is a plain dialog unless it is an alert', () => {
    make({ alert: false })
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper!.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('tints the icon tile by tone', () => {
    make({ tone: 'warn', icon: 'warn' })
    expect(wrapper!.get('.tile').classes()).toContain('tone-warn')
    expect(wrapper!.get('.tile svg').attributes('width')).toBe('18')
  })

  it('puts the details between the sentence and the buttons', () => {
    make()
    const card = wrapper!.get('.card').element
    const kids = [...card.children].map((c) => c.className)
    expect(kids).toEqual(['head', 'details', 'foot'])
  })

  it('starts on the first button, so the safe choice goes first', async () => {
    make()
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('keep')
  })

  it('falls back to the first control when the primary one is disabled', async () => {
    wrapper = mount(UiDialog, {
      props: { open: true, title: 'T', alert: true },
      slots: {
        footer: () => [
          h('button', { id: 'keep', type: 'button' }, 'Keep paused'),
          h('button', { id: 'trust', type: 'button', disabled: true, 'data-dialog-primary': '' }),
        ],
      },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('keep')
  })

  it('wraps Tab and asks to close on Escape, but never closes by itself', async () => {
    make()
    await nextTick()
    await nextTick()
    const last = document.getElementById('trust')!
    last.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    last.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('keep')

    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(wrapper!.emitted('close')).toHaveLength(1)
    expect(wrapper!.find('[role="alertdialog"]').exists()).toBe(true)
    await wrapper!.get('.scrim').trigger('click')
    expect(wrapper!.emitted('close')).toHaveLength(1)
  })

  it('renders the words as text', () => {
    make({ title: '<img src=x onerror=alert(1)>', description: '<b>x</b>' })
    expect(wrapper!.find('img').exists()).toBe(false)
    expect(wrapper!.find('p b').exists()).toBe(false)
  })
})
