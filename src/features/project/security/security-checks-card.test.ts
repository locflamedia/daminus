// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n, setI18nLocale } from '@/i18n'
import { securityRows, severityMix } from '@/lib/security-rows'
import { secItem } from '@/testing/security-items'
import SecurityChecksCard from './SecurityChecksCard.vue'

afterEach(() => setI18nLocale('en'))

function card() {
  const exposed = secItem({
    check: 'url.exposed',
    target: 'http://shop.test',
    level: { level: 'unknown', reason: 'unreachable' },
    unknown: 'unreachable',
  })
  const rows = securityRows([exposed], [], 4, 'vi')
  return mount(SecurityChecksCard, {
    props: { rows, mix: severityMix(rows), meta: '9', play: false },
    global: { plugins: [i18n] },
  })
}

describe('SecurityChecksCard', () => {
  it('says in the app language why a check could not answer', () => {
    setI18nLocale('vi')
    const text = card().text()
    expect(text).toContain('chưa kiểm tra · mất kết nối')
    expect(text).not.toContain('unreachable')
  })
})
