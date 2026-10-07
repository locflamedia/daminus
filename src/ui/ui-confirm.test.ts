// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n, setI18nLocale } from '@/i18n'
import UiConfirm from './UiConfirm.vue'

beforeEach(() => setI18nLocale('en'))
afterEach(() => document.body.replaceChildren())

function make(props: Record<string, unknown> = {}) {
  return mount(UiConfirm, {
    props: {
      open: true,
      title: 'Clear scan history?',
      body: 'Deletes 12 saved scans on this Mac.',
      confirmLabel: 'Clear history',
      ...props,
    },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

const dialog = () => document.body.querySelector('[role="alertdialog"]')

describe('UiConfirm', () => {
  it('asks the question, says what goes, and names the action on the confirm button', () => {
    make()
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Clear scan history?')
    expect(dialog()?.querySelector('.body')?.textContent).toContain('12 saved scans')
    const buttons = dialog()!.querySelectorAll('button')
    expect(buttons[0]?.textContent?.trim()).toBe('Cancel')
    expect(buttons[1]?.textContent?.trim()).toBe('Clear history')
    expect(buttons[1]?.className).toContain('confirm')
  })

  it('names the dialog by its title and describes it by its body', () => {
    make()
    const el = dialog()!
    expect(document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Clear scan history?',
    )
    expect(document.getElementById(el.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Deletes 12',
    )
  })

  it('starts on Cancel, cancels on Escape, and confirms only from its button', async () => {
    const wrapper = make()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel')
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    dialog()!.querySelectorAll('button')[1]?.click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('stays inside its ancestor when contained, and covers the window otherwise', () => {
    make({ contained: true })
    expect(document.body.querySelector('.layer')?.classList.contains('contained')).toBe(true)
    document.body.replaceChildren()
    make()
    expect(document.body.querySelector('.layer')?.classList.contains('contained')).toBe(false)
  })

  it('draws nothing while closed', () => {
    make({ open: false })
    expect(dialog()).toBeNull()
  })
})
