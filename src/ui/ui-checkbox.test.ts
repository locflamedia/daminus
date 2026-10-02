// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiCheckbox from './UiCheckbox.vue'

describe('UiCheckbox', () => {
  it('is a labelled checkbox row with trailing text', () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: true, meta: 'deploy@103.72.4.18', mono: true },
      slots: { default: 'vps-sg-1' },
    })
    const input = wrapper.get('input')
    expect(input.attributes('type')).toBe('checkbox')
    expect((input.element as HTMLInputElement).checked).toBe(true)
    expect(input.attributes('aria-checked')).toBe('true')
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(wrapper.get('.label').text()).toBe('vps-sg-1')
    expect(wrapper.get('.label').classes()).toContain('mono')
    expect(wrapper.get('.meta').text()).toBe('deploy@103.72.4.18')
  })

  it('emits the new state', async () => {
    const wrapper = mount(UiCheckbox, { props: { modelValue: false }, slots: { default: 'x' } })
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('announces a partial selection as mixed', () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: false, indeterminate: true, filled: true },
      slots: { default: 'Select all' },
    })
    expect(wrapper.get('input').attributes('aria-checked')).toBe('mixed')
    expect(wrapper.classes()).toContain('filled')
  })

  it('draws a mixed box as the ink box with a dash, and a click ticks everything', async () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: false, indeterminate: true },
      slots: { default: 'Select all' },
    })
    expect(wrapper.classes()).toContain('mixed')
    expect(wrapper.find('.box .dash').exists()).toBe(true)
    expect((wrapper.get('input').element as HTMLInputElement).indeterminate).toBe(true)
    // Whatever the native box says after the click, a mixed box reports "all".
    await wrapper.get('input').trigger('change')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('does not draw the mixed state for a plain box', () => {
    const wrapper = mount(UiCheckbox, { props: { modelValue: true }, slots: { default: 'x' } })
    expect(wrapper.classes()).not.toContain('mixed')
    expect(wrapper.get('input').attributes('aria-checked')).toBe('true')
  })

  it('disables the row and says why in its trailing text', () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: false, disabled: true, meta: 'Wildcard, skipped' },
      slots: { default: '*.internal' },
    })
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.classes()).toContain('off')
    expect(wrapper.get('.meta').text()).toBe('Wildcard, skipped')
  })

  it('passes attributes to the row', () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: false },
      attrs: { 'data-force': 'focus' },
      slots: { default: 'x' },
    })
    expect(wrapper.attributes('data-force')).toBe('focus')
  })
})
