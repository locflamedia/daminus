// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiSwitch from './UiSwitch.vue'

describe('UiSwitch', () => {
  it('is a switch with its state announced', () => {
    const off = mount(UiSwitch, { props: { modelValue: false, label: 'Scan on open' } })
    const on = mount(UiSwitch, { props: { modelValue: true, label: 'Scan on open' } })
    expect(off.get('input').attributes('role')).toBe('switch')
    expect(off.get('input').attributes('aria-checked')).toBe('false')
    expect(on.get('input').attributes('aria-checked')).toBe('true')
    expect((on.get('input').element as HTMLInputElement).checked).toBe(true)
  })

  it('names itself by its label, which also toggles it', () => {
    const wrapper = mount(UiSwitch, { props: { modelValue: false, label: 'Scan on open' } })
    const label = wrapper.get('label')
    expect(label.text()).toBe('Scan on open')
    expect(label.attributes('for')).toBe(wrapper.get('input').attributes('id'))
  })

  it('takes a label from the slot as well', () => {
    const wrapper = mount(UiSwitch, {
      props: { modelValue: false },
      slots: { default: 'Security checks' },
    })
    expect(wrapper.get('.text').text()).toBe('Security checks')
  })

  it('emits the new state on change', async () => {
    const wrapper = mount(UiSwitch, { props: { modelValue: false, label: 'x' } })
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('passes an aria-label to the input when there is no visible label', () => {
    const wrapper = mount(UiSwitch, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'Folder sizes' },
    })
    expect(wrapper.get('input').attributes('aria-label')).toBe('Folder sizes')
    expect(wrapper.find('.text').exists()).toBe(false)
  })

  it('does not toggle when disabled', () => {
    const wrapper = mount(UiSwitch, { props: { modelValue: true, label: 'x', disabled: true } })
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.classes()).toContain('off')
  })

  it('jumps without a slide when the keyboard toggles it, and slides again for the pointer', async () => {
    const wrapper = mount(UiSwitch, { props: { modelValue: false, label: 'x' } })
    expect(wrapper.classes()).not.toContain('jump')
    await wrapper.get('input').trigger('keydown', { key: ' ' })
    expect(wrapper.classes()).toContain('jump')
    await wrapper.trigger('pointerdown')
    expect(wrapper.classes()).not.toContain('jump')
  })

  it('has a compact size for a page header', () => {
    const wrapper = mount(UiSwitch, { props: { modelValue: true, size: 'compact', label: 'x' } })
    expect(wrapper.classes()).toContain('compact')
  })
})
