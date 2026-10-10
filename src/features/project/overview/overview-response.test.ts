// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n, setI18nLocale } from '@/i18n'
import OverviewResponse from './OverviewResponse.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
})

function make(worst: { seq: number; ms: number | null }, slowCount = 1) {
  return mount(OverviewResponse, {
    props: {
      cells: [{ seq: worst.seq, level: 'crit', ms: worst.ms }],
      median: null,
      worst: { ...worst, level: 'crit' },
      slowCount,
      urls: [],
      exposure: 'none',
    },
    global: { plugins: [i18n, createPinia()] },
  })
}

describe('OverviewResponse', () => {
  it('says the worst scan got no answer instead of printing a dash for its time', () => {
    const text = make({ seq: 1, ms: null }).text()
    expect(text).toContain('1 scan was not healthy; #1 got no answer.')
    expect(text).not.toContain('at —')
  })

  it('names the slowest time when there is one', () => {
    expect(make({ seq: 3, ms: 2400 }, 2).text()).toContain('the slowest was #3 at')
  })
})
