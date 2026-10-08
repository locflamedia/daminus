// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDataMock } from '@/api/dev-mock-data'
import { resetSettingsMock, settingsAnswer } from '@/api/dev-mock-settings'
import { clearMocks, mockCommands } from '@/api/testing'
import { setI18nLocale } from '@/i18n'
import { useDataStore } from './data'
import { useToastStore } from './toasts'

const sent: { cmd: string; args: Record<string, unknown> }[] = []
let refuse: string | null = null

beforeEach(() => {
  setActivePinia(createPinia())
  sent.length = 0
  refuse = null
  resetSettingsMock()
  resetDataMock()
  setI18nLocale('en')
  mockCommands((cmd, args) => {
    sent.push({ cmd, args })
    if (cmd === refuse) throw { code: { kind: 'io', path: '/x' }, params: {}, retryable: false }
    if (cmd === 'history_list') return { scans: [], keep: 20, bytes: 0 }
    return settingsAnswer(cmd, args) ?? null
  })
})

afterEach(() => clearMocks())

describe('data store', () => {
  it('reads the folder, the limits and the oldest scan together', async () => {
    const data = useDataStore()
    await data.load()
    expect(data.loaded).toBe(true)
    expect(data.usage?.scans).toBe(12)
    expect(data.retention).toEqual({ keep_scans: 20, forget_ai_after_days: 30 })
    expect(data.oldest).toBeNull()
  })

  it('sends each choice whole and in the order it was made', async () => {
    const data = useDataStore()
    await data.load()
    data.setKeep(50)
    data.setForget(null)
    await flushPromises()
    const sentData = sent.filter((c) => c.cmd === 'settings_set_data').map((c) => c.args.data)
    expect(sentData).toEqual([
      { keep_scans: 50, forget_ai_after_days: 30 },
      { keep_scans: 50, forget_ai_after_days: null },
    ])
  })

  it('keeps what it knew when a later read fails, and says nothing more', async () => {
    const data = useDataStore()
    await data.load()
    refuse = 'data_usage'
    await data.load()
    expect(data.usage?.scans).toBe(12)
    expect(useToastStore().toasts).toHaveLength(0)
  })

  it('says so when the folder cannot be shown or an export fails', async () => {
    const data = useDataStore()
    refuse = 'reveal_config_dir'
    await data.reveal()
    refuse = 'data_export'
    await data.exportAll()
    expect(data.exported).toBeNull()
    expect(data.exporting).toBe(false)
    expect(useToastStore().toasts.map((t) => t.tone)).toEqual(['crit', 'crit'])
  })

  it('forgets the exported file name once the history is gone', async () => {
    const data = useDataStore()
    await data.exportAll()
    expect(data.exported).toBe('daminus-scans.json')
    await data.clearHistory()
    expect(data.exported).toBeNull()
  })

  it('sends nothing before the first successful read', async () => {
    const data = useDataStore()
    data.setKeep(50)
    await flushPromises()
    expect(sent.filter((c) => c.cmd === 'settings_set_data')).toHaveLength(0)
  })

  it('reads the report, the history and the scan settings again after the history is deleted or the settings reset', async () => {
    const data = useDataStore()
    await data.load()
    sent.length = 0
    await data.clearHistory()
    expect(sent.map((c) => c.cmd)).toEqual(
      expect.arrayContaining(['data_clear', 'report_latest', 'history_list', 'rules_list']),
    )
    sent.length = 0
    await data.resetAll()
    expect(sent.map((c) => c.cmd)).toEqual(
      expect.arrayContaining(['settings_reset', 'settings_get', 'report_latest', 'history_list']),
    )
  })

  it('does not undo a newer choice when an earlier save fails', async () => {
    const data = useDataStore()
    await data.load()
    refuse = 'settings_set_data'
    data.setKeep(50)
    refuse = null
    data.setForget(null)
    await flushPromises()
    expect(data.retention.forget_ai_after_days).toBeNull()
  })
})
