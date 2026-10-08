// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostOutcome } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import type { ServerCell } from '@/lib/overview-servers'
import { useHostKeyStore } from '@/stores/host-key'
import OverviewServerCell from '@/features/overview/OverviewServerCell.vue'
import type { PanelHost } from '@/features/scan-panel/scan-panel-model'
import ScanPanelHost from '@/features/scan-panel/ScanPanelHost.vue'

const OFFERED = 'ED25519 SHA256:Lm7rC1pQe9Vx3Ns0Kd8Tg2Yh5Bw6Fj4Zu7Ha1Mo2Pa'

let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
  mockCommands(() => null)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  clearMocks()
})

function panelHost(outcome: HostOutcome): PanelHost {
  return {
    host: 'db-main',
    chip: 'failed',
    agentWait: false,
    detail: outcome.state,
    outcome,
    facts: 0,
    projects: ['booking'],
    steps: [],
    progress: 0,
    expanded: false,
    segment: 'failed',
  }
}

function cell(outcome: HostOutcome): ServerCell {
  return {
    host: 'db-main',
    state: 'unreachable',
    level: 'ok',
    disk: null,
    diskTone: 'normal',
    load: null,
    memUsed: null,
    silentDays: null,
    stale: false,
    outcome,
  }
}

const buttonNamed = (name: string) =>
  wrapper?.findAll('button').find((b) => b.text().includes(name))

describe('where the host key screen opens from', () => {
  it('a host of the scan panel whose key failed offers Review host key, with its fingerprint', async () => {
    wrapper = mount(ScanPanelHost, {
      props: { host: panelHost({ state: 'host_key_changed', fp: OFFERED }), canRetry: true },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('host key changed')
    expect(buttonNamed('Retry')).toBeUndefined()
    await buttonNamed('Review host key')?.trigger('click')
    await flushPromises()
    const store = useHostKeyStore()
    expect(store.alias).toBe('db-main')
    expect(store.face).toBe('changed')
    expect(store.info?.offered).toBe(OFFERED)
  })

  it('any other failed host keeps its plain Retry', async () => {
    wrapper = mount(ScanPanelHost, {
      props: { host: panelHost({ state: 'auth_failed' }), canRetry: true },
      global: { plugins: [i18n] },
    })
    expect(buttonNamed('Review host key')).toBeUndefined()
    expect(buttonNamed('Retry')).toBeDefined()
  })

  it('a server of the Overview strip says its key is unknown and offers the review', async () => {
    wrapper = mount(OverviewServerCell, {
      props: {
        cell: cell({ state: 'host_key_unknown', fp: OFFERED }),
        scan: null,
        neutral: false,
      },
      global: { plugins: [i18n], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    expect(wrapper.text()).toContain('host key unknown')
    expect(buttonNamed('Retry')).toBeUndefined()
    await buttonNamed('Review host key')?.trigger('click')
    expect(useHostKeyStore().alias).toBe('db-main')
    expect(useHostKeyStore().face).toBe('unknown')
  })

  it('a server that timed out keeps Retry', () => {
    wrapper = mount(OverviewServerCell, {
      props: { cell: cell({ state: 'timeout' }), scan: null, neutral: false },
      global: { plugins: [i18n], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    expect(buttonNamed('Review host key')).toBeUndefined()
    expect(buttonNamed('Retry')).toBeDefined()
  })
})
