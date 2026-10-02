// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiSeg from './UiSeg.vue'

const options = [
  { value: 'all', label: 'All', count: 4 },
  { value: 'issues', label: 'Issues', count: 3 },
  { value: 'healthy', label: 'Healthy' },
]

function make(modelValue = 'all', semantics?: 'tabs' | 'radio') {
  return mount(UiSeg, {
    props: { modelValue, options, label: 'Filter', semantics },
    attachTo: document.body,
  })
}

describe('UiSeg', () => {
  it('is a labelled tablist with the selected tab marked', () => {
    const wrapper = make('issues')
    expect(wrapper.attributes('role')).toBe('tablist')
    expect(wrapper.attributes('aria-label')).toBe('Filter')
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual(['false', 'true', 'false'])
    wrapper.unmount()
  })

  it('shows counts beside the labels', () => {
    const wrapper = make()
    expect(wrapper.findAll('.count').map((c) => c.text())).toEqual(['4', '3'])
    wrapper.unmount()
  })

  it('keeps only the selected segment in the tab order', () => {
    const wrapper = make('healthy')
    expect(wrapper.findAll('button').map((b) => b.attributes('tabindex'))).toEqual([
      '-1',
      '-1',
      '0',
    ])
    wrapper.unmount()
  })

  it('emits the clicked value, and nothing for the current one', async () => {
    const wrapper = make('all')
    await wrapper.findAll('button')[1]?.trigger('click')
    await wrapper.findAll('button')[0]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['issues']])
    wrapper.unmount()
  })

  it('moves with the arrow keys, wraps, and jumps with Home and End', async () => {
    const wrapper = make('all')
    const buttons = wrapper.findAll('button')
    await buttons[0]?.trigger('keydown', { key: 'ArrowRight' })
    await buttons[0]?.trigger('keydown', { key: 'ArrowLeft' })
    await buttons[0]?.trigger('keydown', { key: 'End' })
    await wrapper.setProps({ modelValue: 'healthy' })
    await buttons[2]?.trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:modelValue')).toEqual([
      ['issues'],
      ['healthy'],
      ['healthy'],
      ['all'],
    ])
    wrapper.unmount()
  })

  it('moves focus with the selection', async () => {
    const wrapper = make('all')
    await wrapper.findAll('button')[0]?.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(wrapper.findAll('button')[1]?.element)
    wrapper.unmount()
  })

  it('ignores other keys', async () => {
    const wrapper = make('all')
    await wrapper.findAll('button')[0]?.trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('is a radio group when it stores a choice', () => {
    const wrapper = make('issues', 'radio')
    expect(wrapper.attributes('role')).toBe('radiogroup')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios[0]?.attributes('aria-selected')).toBeUndefined()
    wrapper.unmount()
  })
})
