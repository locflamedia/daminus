// @vitest-environment happy-dom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n, setI18nLocale } from '@/i18n'
import OverviewChanges from './OverviewChanges.vue'

beforeEach(() => setI18nLocale('en'))

function make(props: Partial<InstanceType<typeof OverviewChanges>['$props']> = {}) {
  return mount(OverviewChanges, {
    props: { rows: [], more: 0, seq: 1, baseline: null, scanning: false, oldDays: null, ...props },
    global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('OverviewChanges', () => {
  it('names the first scan instead of a scan #0 that never ran', () => {
    const text = make().text()
    expect(text).not.toContain('#0')
    expect(text).toContain('Changes in #1')
    expect(text).toContain('There is no earlier scan to compare with yet.')
  })

  it('names the scan it compares with when there is one', () => {
    expect(make({ seq: 2, baseline: 1 }).text()).toContain('Changes since #1')
  })
})
