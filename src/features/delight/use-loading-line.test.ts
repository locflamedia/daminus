// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useScanStore } from '@/stores/scan'
import { useSettingsStore } from '@/stores/settings'
import { useLoadingLine } from './use-loading-line'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (k: string) => k }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('the loading line timer', () => {
  it('runs only while a line is shown', async () => {
    const set = vi.spyOn(window, 'setInterval')
    const scope = effectScope()
    scope.run(() => useLoadingLine())
    const scan = useScanStore()
    const settings = useSettingsStore()
    settings.appearance.easter_eggs = false
    scan.run = { scan_id: 's', started_at: '', next_seq: 0, hosts: {} }
    await nextTick()
    expect(set).not.toHaveBeenCalled()
    settings.appearance.easter_eggs = true
    await nextTick()
    expect(set).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})
