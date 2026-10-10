// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n, setI18nLocale } from '@/i18n'
import ConfigPreview from './components/ConfigPreview.vue'

beforeEach(() => setI18nLocale('en'))

describe('ConfigPreview', () => {
  it('sizes the alias column to the longest alias, so a short panel cuts HostName first', () => {
    const wrapper = mount(ConfigPreview, {
      props: {
        ready: true,
        rows: [
          { alias: 'apollo-test', hostName: '103.75.186.31', user: 'root', key: 'id_rsa' },
          {
            alias: 'db',
            hostName: 'does-not-exist.daminus.invalid',
            user: 'nobody-here',
            key: null,
          },
        ],
        skips: [],
      },
      global: { plugins: [i18n] },
    })
    const style = wrapper.find('.preview').attributes('style') ?? ''
    expect(style).toContain('--alias: 11ch')
  })
})
