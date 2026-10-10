// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import UiChip from './UiChip.vue'
import UiChipMorph from './UiChipMorph.vue'
import UiTag from './UiTag.vue'

describe('UiChip', () => {
  it('is a 22 px pill whose tone follows the prop', () => {
    for (const tone of ['ok', 'warn', 'crit', 'info', 'neutral', 'plain'] as const) {
      const wrapper = mount(UiChip, { props: { tone }, slots: { default: 'Needs a look' } })
      expect(wrapper.classes()).toContain(`chip-${tone}`)
      expect(wrapper.text()).toBe('Needs a look')
    }
    expect(mount(UiChip).classes()).toContain('chip-neutral')
  })

  it('shows a 12 px glyph, or a spinner while busy, never both', () => {
    const icon = mount(UiChip, { props: { icon: 'warn' }, slots: { default: 'OOM' } })
    expect(icon.find('svg.icon').exists()).toBe(true)
    expect(icon.find('svg.icon').attributes('width')).toBe('12')

    const busy = mount(UiChip, {
      props: { icon: 'warn', busy: true },
      slots: { default: 'Scanning' },
    })
    expect(busy.find('svg.spinner').exists()).toBe(true)
    expect(busy.find('svg.icon').exists()).toBe(false)
  })

  it('renders server text as text, never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)><b>bold</b>'
    const wrapper = mount(UiChip, { slots: { default: () => hostile } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.text()).toBe(hostile)
  })
})

describe('UiChip size', () => {
  it('stays 22 px by default; large adds the 24 px class', () => {
    expect(mount(UiChip).classes()).not.toContain('chip-large')
    expect(mount(UiChip, { props: { size: 'large' } }).classes()).toContain('chip-large')
  })
})

describe('UiTag', () => {
  it('is a plain fact label by default', () => {
    const wrapper = mount(UiTag, { slots: { default: 'pm2' } })
    expect(wrapper.text()).toBe('pm2')
    expect(wrapper.classes()).not.toContain('mono')
    expect(wrapper.find('.swatch').exists()).toBe(false)
  })

  it('takes a swatch colour from the caller, and the mono and plain forms', () => {
    const wrapper = mount(UiTag, {
      props: { swatch: 'rgb(240, 83, 64)', mono: true, plain: true },
      slots: { default: 'DB_HOST' },
    })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['mono', 'plain']))
    expect(wrapper.get('.swatch').attributes('style')).toContain('rgb(240, 83, 64)')
    expect(wrapper.get('.swatch').attributes('aria-hidden')).toBe('true')
  })

  it('renders text as text', () => {
    const wrapper = mount(UiTag, { slots: { default: () => '<img src=x onerror=alert(1)>' } })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})

describe('UiChipMorph', () => {
  it('keeps the word in its own box, so a squeezed chip cuts it with an ellipsis', () => {
    const wrapper = mount(UiChipMorph, {
      props: { label: 'Không có trong config', tone: 'neutral' },
    })
    const words = wrapper.findAll('.word')
    expect(words.map((w) => w.text())).toEqual(['Không có trong config', 'Không có trong config'])
  })
})

describe('UiChipMorph width', () => {
  it('rounds the measured label up, so a fraction of a pixel never cuts the word', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 76.4,
    } as DOMRect)
    const wrapper = mount(UiChipMorph, {
      props: { label: '2 critical', tone: 'crit', dot: true, large: true },
    })
    await wrapper.vm.$nextTick()
    expect((wrapper.element as HTMLElement).style.width).toBe('77px')
    rect.mockRestore()
  })
})
