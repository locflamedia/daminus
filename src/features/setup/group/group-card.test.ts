// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n, setI18nLocale } from '@/i18n'
import { vEnter } from '@/lib/motion'
import { emptyDraft } from '@/lib/setup-model'
import GroupCard from './GroupCard.vue'

function card(replaces: boolean) {
  const draft = { ...emptyDraft('blue'), id: 'shop', name: 'shop', urls: ['https://shop.example'] }
  return mount(GroupCard, {
    props: { draft, attention: false, replaces, keepId: 'shop-2', index: 0 },
    global: { plugins: [i18n, createPinia()], directives: { enter: vEnter } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
})

describe('the project card header', () => {
  it('tags a new project New', () => {
    const wrapper = card(false)
    expect(wrapper.find('.new').exists()).toBe(true)
    expect(wrapper.find('.saved').exists()).toBe(false)
  })

  it('drops the New tag when the Already saved chip shows', () => {
    const wrapper = card(true)
    expect(wrapper.find('.saved').text()).toContain('Already saved')
    expect(wrapper.find('.new').exists()).toBe(false)
  })

  it('carries the whole URL in a title so a cut one can still be read', () => {
    const chip = card(false).find('.url')
    expect(chip.attributes('title')).toBe('https://shop.example')
  })
})
