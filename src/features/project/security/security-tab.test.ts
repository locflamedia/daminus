// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { securityRows, severityMix } from '@/lib/security-rows'
import { secItem } from '@/testing/security-items'
import SecurityChecksCard from './SecurityChecksCard.vue'

let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function card(
  items: Parameters<typeof securityRows>[0],
  disabled: Parameters<typeof securityRows>[1] = [],
) {
  setActivePinia(createPinia())
  const rows = securityRows(items, disabled, 12, 'en')
  wrapper = mount(SecurityChecksCard, {
    props: { rows, mix: severityMix(rows), meta: '9 checks', play: false },
    global: { plugins: [i18n] },
  })
  return wrapper
}

describe('Checks this scan', () => {
  it('lists all nine checks even when none was reported', () => {
    expect(card([]).findAll('li')).toHaveLength(9)
  })

  it('says how far a partial miner check got and that it needs permission', () => {
    const miner = secItem({
      check: 'sec.miner',
      level: { level: 'unknown', reason: 'needs_perm' },
      data: { seen: 41, total: 212 },
      unknown: 'needs_perm',
    })
    const text = card([miner]).findAll('li')[0]?.text() ?? ''
    expect(text).toContain('41 of 212')
    expect(text).toContain('needs permission')
    expect(text).not.toContain('none')
  })

  it('writes off in Settings for a group that is switched off', () => {
    const text = card([], ['code_changes']).text()
    expect(text).toContain('off in Settings')
  })

  it('counts critical checks', () => {
    const php = secItem({
      check: 'sec.upload_php',
      target: '/a/uploads/x.php',
      level: { level: 'crit' },
      value: 1,
      data: { total: 137, mtime: 1, size: 1 },
    })
    const view = card([php])
    expect(view.find('.big').text()).toBe('1')
    expect(view.text()).toContain('137 files')
  })
})
