// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearMocks, mockCommands } from '@/api/testing'
import { setI18nLocale } from '@/i18n'
import { useHostsSettingsStore } from './hosts-settings'
import { useToastStore } from './toasts'

let file: string[] = []
let refuseAlias: string | null = null
const order: string[] = []

beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
  file = []
  refuseAlias = null
  order.length = 0
  mockCommands(async (cmd, args) => {
    if (cmd === 'hosts_set_include') {
      const host = args.host as string
      order.push(`${host}:${String(args.include)}`)
      await new Promise((r) => setTimeout(r, host === 'a' ? 5 : 0))
      if (host === refuseAlias)
        throw { code: { kind: 'io', path: '/x' }, params: {}, retryable: false }
      file = args.include ? file.filter((h) => h !== host) : [...file, host]
      return file
    }
    return null
  })
})

afterEach(() => clearMocks())

describe('hosts settings store', () => {
  it('sends the changes one after the other and ends on the last answer', async () => {
    const store = useHostsSettingsStore()
    void store.setInclude('a', false)
    void store.setInclude('b', false)
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
    expect(order).toEqual(['a:false', 'b:false'])
    expect(store.excluded).toEqual(['a', 'b'])
  })

  it('keeps the other change when one is refused', async () => {
    refuseAlias = 'a'
    const store = useHostsSettingsStore()
    void store.setInclude('a', false)
    void store.setInclude('b', false)
    await new Promise((r) => setTimeout(r, 20))
    expect(store.excluded).toEqual(['b'])
    expect(useToastStore().toasts).toHaveLength(1)
  })
})
