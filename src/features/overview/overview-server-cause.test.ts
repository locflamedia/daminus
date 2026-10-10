// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HostOutcome } from '@/api'
import { i18n, setI18nLocale } from '@/i18n'
import type { ServerCell } from '@/lib/overview-servers'
import OverviewServerCell from './OverviewServerCell.vue'

function cell(outcome: HostOutcome, silentDays: number | null = null): ServerCell {
  return {
    host: 'db-main',
    state: 'unreachable',
    level: 'ok',
    disk: null,
    diskTone: 'normal',
    load: null,
    memUsed: null,
    silentDays,
    stale: false,
    outcome,
  }
}

function detail(outcome: HostOutcome, silentDays: number | null = null): string {
  const wrapper = mount(OverviewServerCell, {
    props: { cell: cell(outcome, silentDays), scan: null, neutral: false },
    global: { plugins: [i18n], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  const text = wrapper.text()
  wrapper.unmount()
  return text
}

beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
})

describe('a server of the Overview strip that could not be scanned', () => {
  it('says why, not Unreachable, when the network was fine', () => {
    expect(detail({ state: 'auth_failed' })).toContain('Key refused')
    expect(detail({ state: 'not_in_config' })).toContain('Not in ~/.ssh/config')
    expect(detail({ state: 'timeout' })).toContain('Timed out')
    expect(detail({ state: 'auth_failed' })).not.toContain('Unreachable')
  })

  it('keeps how long a host has been silent for a network failure', () => {
    const text = detail({ state: 'unreachable', cause: 'connect_timeout' }, 3)
    expect(text).toContain(i18n.global.t('overviewScreen.servers.unreachableFor', { n: 3 }))
  })

  it('says it in Vietnamese', () => {
    setI18nLocale('vi')
    expect(detail({ state: 'auth_failed' })).toContain('Khoá bị từ chối')
    expect(detail({ state: 'not_in_config' })).toContain('Không có trong ~/.ssh/config')
  })
})
