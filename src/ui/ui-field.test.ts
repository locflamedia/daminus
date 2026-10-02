// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiField from './UiField.vue'

function make(props: Record<string, unknown> = {}) {
  return mount(UiField, { props: { modelValue: '', label: '.env path', ...props } })
}

describe('UiField', () => {
  it('puts the label above and ties it to the input', () => {
    const wrapper = make()
    const label = wrapper.get('label')
    expect(label.text()).toBe('.env path')
    expect(label.attributes('for')).toBe(wrapper.get('input').attributes('id'))
  })

  it('reads and writes its value', async () => {
    const wrapper = make({ modelValue: '/srv/app', placeholder: '/srv/project/.env' })
    const input = wrapper.get('input')
    expect((input.element as HTMLInputElement).value).toBe('/srv/app')
    expect(input.attributes('placeholder')).toBe('/srv/project/.env')
    await input.setValue('/srv/app/.env')
    expect(wrapper.emitted('update:modelValue')).toEqual([['/srv/app/.env']])
  })

  it('shows the hint under the field and describes the input with it', () => {
    const wrapper = make({ hint: 'Read on the server only.' })
    const note = wrapper.get('.note')
    expect(note.text()).toBe('Read on the server only.')
    expect(note.classes()).toContain('note-hint')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe(note.attributes('id'))
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('shows success text in place of the hint', () => {
    const wrapper = make({ hint: 'Read on the server only.', success: 'Found DB_DATABASE.' })
    expect(wrapper.get('.note').text()).toBe('Found DB_DATABASE.')
    expect(wrapper.get('.note').classes()).toContain('note-success')
  })

  it('marks an error invalid and says it in text, above hint and success', () => {
    const wrapper = make({
      hint: 'h',
      success: 's',
      error: 'No file at this path on vps-sg-1.',
    })
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('.note').text()).toBe('No file at this path on vps-sg-1.')
    expect(wrapper.get('.note').classes()).toContain('note-error')
    expect(wrapper.get('.control').classes()).toContain('invalid')
  })

  it('has no note line without text', () => {
    const wrapper = make()
    expect(wrapper.find('.note').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
  })

  it('disables the input and dims the field', () => {
    const wrapper = make({ disabled: true, hint: 'No database in this project.' })
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.classes()).toContain('off')
  })

  it('sets values in mono when asked', () => {
    expect(make({ mono: true }).get('.control').classes()).toContain('mono')
  })

  it('draws a leading icon and a trailing slot', () => {
    const wrapper = mount(UiField, {
      props: { modelValue: '', label: 'Search', icon: 'search', type: 'search' },
      slots: { trailing: '<kbd>⌘K</kbd>' },
    })
    expect(wrapper.find('svg.lead').exists()).toBe(true)
    expect(wrapper.get('input').attributes('type')).toBe('search')
    expect(wrapper.get('kbd').text()).toBe('⌘K')
  })

  it('passes attributes such as the pinned state to the root', () => {
    const wrapper = make({}).vm.$el as HTMLElement
    expect(wrapper.classList.contains('field')).toBe(true)
    const forced = mount(UiField, {
      props: { modelValue: '', label: 'x' },
      attrs: { 'data-force': 'focus' },
    })
    expect(forced.attributes('data-force')).toBe('focus')
  })
})
