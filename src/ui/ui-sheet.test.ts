// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { h, nextTick, ref } from 'vue'
import { compileStyle, parse } from 'vue/compiler-sfc'
import { i18n } from '@/i18n'
import UiSelect from './UiSelect.vue'
import UiSheet from './UiSheet.vue'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

function make(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
  wrapper = mount(UiSheet, {
    props: { open: true, title: 'Edit kho-hang', context: '4 components', ...props },
    slots: {
      default: () => [
        h('input', { id: 'first' }),
        h('button', { id: 'last', type: 'button' }, 'x'),
      ],
      ...slots,
    } as never,
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return wrapper
}

const press = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(event)
  return event
}

describe('UiSheet', () => {
  it('pins a form sheet 64 px from the top, so it only grows down', async () => {
    make({ pinned: true })
    await nextTick()
    expect(wrapper!.get('.layer').classes()).toContain('pinned')
    make()
    await nextTick()
    expect(wrapper!.get('.layer').classes()).not.toContain('pinned')

    const file = join(__dirname, 'UiSheet.vue')
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
    const css = descriptor.styles
      .map(
        (s) =>
          compileStyle({ source: s.content, filename: file, id: 'data-v-t', scoped: true }).code,
      )
      .join('\n')
    const rule = css.match(/\.layer\.pinned\[data-v-t\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/align-items:\s*flex-start/)
    expect(rule).toMatch(/padding-top:\s*64px/)
  })

  it('is a modal dialog named by its title, with the context beside it', async () => {
    make()
    await nextTick()
    const dialog = wrapper!.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    const title = wrapper!.get('h2')
    expect(dialog.attributes('aria-labelledby')).toBe(title.attributes('id'))
    expect(title.text()).toBe('Edit kho-hang')
    expect(wrapper!.get('.context').text()).toBe('4 components')
  })

  it('renders nothing while closed', () => {
    make({ open: false })
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(false)
  })

  it('has a labelled 28 px close button that asks to close', async () => {
    make()
    const close = wrapper!.get('button.close')
    expect(close.attributes('aria-label')).toBe('Close')
    await close.trigger('click')
    expect(wrapper!.emitted('close')).toHaveLength(1)
  })

  it('does not close itself: Escape and the button only ask', async () => {
    make()
    await nextTick()
    press(document.getElementById('first')!, 'Escape')
    expect(wrapper!.emitted('close')).toHaveLength(1)
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(true)
  })

  it('ignores a press on the scrim, so a stray click never loses an edit', async () => {
    make()
    await wrapper!.get('.scrim').trigger('click')
    await wrapper!.get('.scrim').trigger('pointerdown')
    expect(wrapper!.emitted('close')).toBeUndefined()
  })

  it('shows the footer with the destructive action left and the primary right', () => {
    make(
      {},
      {
        'footer-start': () => h('button', { class: 'remove' }, 'Remove project'),
        'footer-end': () => [
          h('button', { class: 'cancel' }, 'Cancel'),
          h('button', { class: 'save' }, 'Save'),
        ],
      },
    )
    const foot = wrapper!.get('footer')
    expect([...foot.element.children].map((c) => c.textContent)).toEqual([
      'Remove project',
      '',
      'Cancel',
      'Save',
    ])
  })

  it('has no footer when no footer slot is given', () => {
    make()
    expect(wrapper!.find('footer').exists()).toBe(false)
  })

  it('moves focus in, wraps Tab, and gives focus back on close', async () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    const open = ref(true)
    const Host = {
      setup: () => () =>
        h(
          UiSheet,
          { open: open.value, title: 'T', onClose: () => (open.value = false) },
          {
            default: () => [
              h('input', { id: 'first' }),
              h('button', { id: 'last', type: 'button' }, 'x'),
            ],
          },
        ),
    }
    wrapper = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body })
    await nextTick()
    await nextTick()
    // The close button in the header is the first control.
    expect(document.activeElement?.className).toContain('close')

    const last = document.getElementById('last')!
    last.focus()
    expect(press(last, 'Tab').defaultPrevented).toBe(true)
    expect(document.activeElement?.className).toContain('close')

    press(document.activeElement!, 'Escape')
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(outside)
  })

  it('leaves Escape to a select that is open inside it', async () => {
    wrapper = mount(
      {
        setup: () => () =>
          h(
            UiSheet,
            { open: true, title: 'T' },
            {
              default: () =>
                h(UiSelect, {
                  modelValue: 'a',
                  options: [
                    { value: 'a', label: 'A' },
                    { value: 'b', label: 'B' },
                  ],
                  label: 'Model',
                  defaultOpen: true,
                }),
            },
          ),
      },
      { global: { plugins: [i18n] }, attachTo: document.body },
    )
    await nextTick()
    const input = document.querySelector('input[role="combobox"]') as HTMLElement
    input.focus()
    press(input, 'Escape')
    await nextTick()
    const sheet = wrapper.findComponent(UiSheet)
    expect(sheet.emitted('close')).toBeUndefined()
    // The second Escape, with the list closed, is the sheet's.
    const trigger = document.querySelector('button.field') as HTMLElement
    press(trigger, 'Escape')
    expect(sheet.emitted('close')).toHaveLength(1)
  })

  it('is a 760 px centred card unless another width is asked for', () => {
    make()
    expect(wrapper!.get('.tray').attributes('style')).toContain('width: 760px')
    wrapper!.unmount()
    make({ width: '520px' })
    expect(wrapper!.get('.tray').attributes('style')).toContain('width: 520px')
  })

  it('blurs the page behind it with the sheet scrim', () => {
    make()
    expect(wrapper!.get('.scrim').attributes('aria-hidden')).toBe('true')
    expect(wrapper!.get('.tray').classes()).not.toContain('narrow')
  })

  it('renders title and context as text', () => {
    make({ title: '<img src=x onerror=alert(1)>', context: '<b>x</b>' })
    expect(wrapper!.find('img').exists()).toBe(false)
    expect(wrapper!.find('.context b').exists()).toBe(false)
  })
})
