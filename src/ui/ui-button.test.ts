// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import UiButton from './UiButton.vue'

describe('UiButton', () => {
  it('renders its label in a button of the chosen variant and size', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'primary', size: 'small' },
      slots: { default: 'Fix' },
    })
    const button = wrapper.get('button')
    expect(button.text()).toBe('Fix')
    expect(button.attributes('type')).toBe('button')
    expect(button.classes()).toEqual(expect.arrayContaining(['btn', 'btn-primary', 'btn-small']))
  })

  it('has a 40 px size for the one action of a setup screen', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'primary', size: 'large' },
      slots: { default: 'Discover 5 hosts' },
    })
    expect(wrapper.classes()).toContain('btn-large')
  })

  it('defaults to the secondary variant at the default size', () => {
    const wrapper = mount(UiButton, { slots: { default: 'Open SSH' } })
    expect(wrapper.classes()).toContain('btn-secondary')
    expect(wrapper.classes()).not.toContain('btn-small')
  })

  it('emits click once per click and passes other attributes through', async () => {
    const wrapper = mount(UiButton, {
      attrs: { 'data-force': 'hover', 'data-testid': 'go' },
      slots: { default: 'Scan' },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.attributes('data-force')).toBe('hover')
    expect(wrapper.attributes('data-testid')).toBe('go')
  })

  it('keeps a busy button in place: aria-busy, a spinner, no clicks', async () => {
    const wrapper = mount(UiButton, { props: { busy: true }, slots: { default: 'Scan all' } })
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('svg.spinner').exists()).toBe(true)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('swaps the leading icon for the spinner while busy', async () => {
    const wrapper = mount(UiButton, { props: { icon: 'start' }, slots: { default: 'Scan' } })
    expect(wrapper.find('svg.icon').exists()).toBe(true)
    expect(wrapper.find('svg.spinner').exists()).toBe(false)
    await wrapper.setProps({ busy: true })
    expect(wrapper.find('svg.spinner').exists()).toBe(true)
    expect(wrapper.find('svg.icon').exists()).toBe(false)
  })

  it('disables with the native attribute and ignores clicks', async () => {
    const wrapper = mount(UiButton, { props: { disabled: true }, slots: { default: 'Scan' } })
    expect(wrapper.attributes('disabled')).toBeDefined()
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('explains a disabled button: still focusable, aria-disabled, reason as tooltip', async () => {
    const wrapper = mount(UiButton, {
      props: { disabled: true, disabledReason: 'Add a host first' },
      slots: { default: 'Scan' },
    })
    expect(wrapper.attributes('disabled')).toBeUndefined()
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('title')).toBe('Add a host first')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('draws an icon-only button as a square with its label as the tooltip', () => {
    const wrapper = mount(UiButton, {
      props: { icon: 'copy' },
      attrs: { 'aria-label': 'Copy' },
    })
    expect(wrapper.classes()).toContain('btn-icon')
    expect(wrapper.find('.label').exists()).toBe(false)
    expect(wrapper.attributes('aria-label')).toBe('Copy')
    expect(wrapper.attributes('title')).toBe('Copy')
  })

  it('shows the shortcut as a key, lit for the dark button only', () => {
    const primary = mount(UiButton, {
      props: { variant: 'primary', shortcut: '⌘R' },
      slots: { default: 'Scan all' },
    })
    expect(primary.get('kbd').text()).toBe('⌘R')
    expect(primary.get('kbd').classes()).toContain('kbd-on-button')
    const secondary = mount(UiButton, {
      props: { shortcut: '⌘R' },
      slots: { default: 'Scan all' },
    })
    expect(secondary.get('kbd').classes()).toContain('kbd-default')
  })

  it('adds the lifted shadow to the primary only', () => {
    const primary = mount(UiButton, { props: { variant: 'primary', lifted: true } })
    const soft = mount(UiButton, { props: { variant: 'soft', lifted: true } })
    expect(primary.classes()).toContain('btn-lifted')
    expect(soft.classes()).not.toContain('btn-lifted')
  })

  it('renders an inline link as a router link', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const wrapper = mount(UiButton, {
      props: { variant: 'link', to: '/', trailingIcon: 'chevron-right' },
      slots: { default: 'Open' },
      global: { plugins: [router] },
    })
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('/')
    expect(link.text()).toBe('Open')
    expect(link.classes()).toContain('btn-link')
  })
})
