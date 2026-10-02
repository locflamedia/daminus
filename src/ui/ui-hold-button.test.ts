// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n, setI18nLocale } from '@/i18n'
import UiHoldButton from './UiHoldButton.vue'

beforeEach(() => {
  vi.useFakeTimers()
  setI18nLocale('en')
})
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

function make(props: Record<string, unknown> = {}) {
  return mount(UiHoldButton, {
    props: { label: 'Hold to delete history', ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('UiHoldButton', () => {
  it('names the action and says how to use it', () => {
    const wrapper = make({ hint: 'Hold for 1.5 s. Letting go early cancels.' })
    const button = wrapper.get('button')
    expect(button.text()).toContain('Hold to delete history')
    const hint = wrapper.get('.hint')
    expect(button.attributes('aria-describedby')).toBe(hint.attributes('id'))
    // The white copy of the label is for the eye only.
    expect(wrapper.get('.fill').attributes('aria-hidden')).toBe('true')
  })

  it('confirms once, after the full hold', async () => {
    const wrapper = make()
    await wrapper.get('button').trigger('pointerdown', { button: 0 })
    expect(wrapper.classes()).toBeDefined()
    expect(wrapper.get('button').classes()).toContain('holding')
    vi.advanceTimersByTime(1499)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button').classes()).not.toContain('holding')
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('cancels when let go early', async () => {
    const wrapper = make()
    await wrapper.get('button').trigger('pointerdown', { button: 0 })
    vi.advanceTimersByTime(900)
    await wrapper.get('button').trigger('pointerup')
    expect(wrapper.get('button').classes()).not.toContain('holding')
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('cancels when the pointer leaves the button', async () => {
    const wrapper = make()
    await wrapper.get('button').trigger('pointerdown', { button: 0 })
    await wrapper.get('button').trigger('pointerleave')
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('ignores the secondary mouse button', async () => {
    const wrapper = make()
    await wrapper.get('button').trigger('pointerdown', { button: 2 })
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('works from the keyboard: hold Space, let go to cancel', async () => {
    const wrapper = make()
    const button = wrapper.get('button')
    await button.trigger('keydown', { key: ' ' })
    await button.trigger('keydown', { key: ' ', repeat: true })
    vi.advanceTimersByTime(800)
    await button.trigger('keyup', { key: ' ' })
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('confirm')).toBeUndefined()

    await button.trigger('keydown', { key: 'Enter' })
    vi.advanceTimersByTime(1500)
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('cancels on blur', async () => {
    const wrapper = make()
    await wrapper.get('button').trigger('keydown', { key: ' ' })
    await wrapper.get('button').trigger('blur')
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('takes its hold time from the duration and sets the fill to match', async () => {
    const wrapper = make({ duration: 600 })
    expect(wrapper.get('button').attributes('style')).toContain('--hold: 600ms')
    await wrapper.get('button').trigger('pointerdown', { button: 0 })
    vi.advanceTimersByTime(600)
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('does nothing when disabled', async () => {
    const wrapper = make({ disabled: true })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('pointerdown', { button: 0 })
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('stops the timer when it is removed mid-hold', async () => {
    const wrapper = make()
    await wrapper.get('button').trigger('pointerdown', { button: 0 })
    wrapper.unmount()
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  describe('the confirmation, for everyone who cannot hold', () => {
    const ask = {
      actionLabel: 'Clear history',
      confirmTitle: 'Clear scan history?',
      confirmBody: 'Deletes 12 saved scans on this Mac.',
      confirmLabel: 'Clear history',
    }
    const dialog = () => document.body.querySelector('[role="alertdialog"]')

    it('opens it from a click that ends before the hold starts to fill', async () => {
      const wrapper = make(ask)
      await wrapper.get('button').trigger('pointerdown', { button: 0 })
      vi.advanceTimersByTime(120)
      await wrapper.get('button').trigger('pointerup')
      expect(dialog()?.textContent).toContain('Clear scan history?')
      expect(wrapper.emitted('confirm')).toBeUndefined()
    })

    it('does not open it after a longer press that is let go', async () => {
      const wrapper = make(ask)
      await wrapper.get('button').trigger('pointerdown', { button: 0 })
      vi.advanceTimersByTime(700)
      await wrapper.get('button').trigger('pointerup')
      expect(dialog()).toBeNull()
    })

    it('opens it from an activation with no pointer or key, as VoiceOver sends', async () => {
      const wrapper = make(ask)
      await wrapper.get('button').trigger('click', { detail: 0 })
      expect(dialog()).not.toBeNull()
    })

    it('does not open it from the click that follows a real pointer press', async () => {
      const wrapper = make(ask)
      await wrapper.get('button').trigger('click', { detail: 1 })
      expect(dialog()).toBeNull()
    })

    it('does nothing on a click when there is no confirmation to open', async () => {
      const wrapper = make()
      await wrapper.get('button').trigger('click', { detail: 0 })
      expect(dialog()).toBeNull()
    })

    it('confirms with the same event as the hold, and Cancel closes it without one', async () => {
      const wrapper = make(ask)
      await wrapper.get('button').trigger('click', { detail: 0 })
      const [cancel, confirm] = [
        ...document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
      ]
      expect(cancel?.textContent?.trim()).toBe('Cancel')
      expect(confirm?.textContent?.trim()).toBe('Clear history')
      cancel?.click()
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('confirm')).toBeUndefined()
      await wrapper.get('button').trigger('click', { detail: 0 })
      document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')[1]?.click()
      expect(wrapper.emitted('confirm')).toHaveLength(1)
    })

    it('is named by the action and described by how to use it', () => {
      const wrapper = make({ ...ask, hint: 'Hold for 1.5 s.' })
      const button = wrapper.get('button')
      expect(button.attributes('aria-label')).toBe('Clear history')
      const described = button.attributes('aria-describedby')!.split(' ')
      const words = described.map((id) => document.getElementById(id)?.textContent)
      expect(words).toEqual([
        'Hold to confirm, or press to open a confirmation.',
        'Hold for 1.5 s.',
      ])
    })
  })
})
