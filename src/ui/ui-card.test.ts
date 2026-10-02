// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import UiCard from './UiCard.vue'

const source = readFileSync(join(process.cwd(), 'src/ui/UiCard.vue'), 'utf8')
const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? ''

describe('UiCard', () => {
  it('is one white card by default', () => {
    const wrapper = mount(UiCard, { slots: { default: '<p>body</p>' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['card', 'card-neutral']))
    expect(wrapper.find('.tray').exists()).toBe(false)
    expect(wrapper.text()).toBe('body')
  })

  it.each(['ok', 'warn', 'crit', 'info'] as const)('washes the %s card from its tint', (tone) => {
    const wrapper = mount(UiCard, { props: { tone } })
    expect(wrapper.classes()).toContain(`card-${tone}`)
    expect(style).toContain(`.card-${tone} {`)
    expect(style).toContain(`var(--card-wash-${tone})`)
  })

  it('wraps itself in the glass tray and drops its own shadow there', () => {
    const wrapper = mount(UiCard, { props: { tray: true } })
    expect(wrapper.classes()).toContain('tray')
    expect(wrapper.get('.card').classes()).toEqual(expect.arrayContaining(['flat', 'card-neutral']))
  })

  it('renders as the element asked for', () => {
    expect(mount(UiCard).element.tagName).toBe('DIV')
    expect(mount(UiCard, { props: { as: 'section' } }).element.tagName).toBe('SECTION')
    const tray = mount(UiCard, { props: { as: 'article', tray: true } })
    expect(tray.element.tagName).toBe('ARTICLE')
    expect(tray.get('.card').element.tagName).toBe('DIV')
  })

  it('lifts on hover only when asked, in the tray form too', () => {
    expect(mount(UiCard).classes()).not.toContain('m-lift')
    expect(mount(UiCard, { props: { lift: true } }).classes()).toContain('m-lift')
    expect(
      mount(UiCard, { props: { lift: true, tray: true } })
        .get('.card')
        .classes(),
    ).toContain('m-lift')
  })

  it('has no border, and no edge on one side only', () => {
    expect(style).not.toMatch(/\bborder(-(left|right|top|bottom|inline|block)[\w-]*)?\s*:/)
    expect(style).not.toMatch(/\boutline\s*:/)
  })
})
