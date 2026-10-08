// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { settingsGet, settingsSetAppearance, settingsSetGeneral } from './commands'
import { clearMocks, mockCommands } from './testing'

describe('settings command wrappers', () => {
  afterEach(() => clearMocks())

  it('send the section Rust names, and nothing else', async () => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = []
    mockCommands((cmd, args) => {
      calls.push({ cmd, args })
      return null
    })
    const general = {
      language: 'vi',
      ai_language: null,
      scan_on_open: false,
      intro: 'never',
    } as const
    const appearance = {
      theme: 'dark',
      reduce_transparency: false,
      animate_charts: true,
      clear_sky: true,
      streak_badge: true,
      completion_chime: false,
      easter_eggs: true,
    } as const
    await settingsGet()
    await settingsSetGeneral(general)
    await settingsSetAppearance(appearance)
    expect(calls).toEqual([
      { cmd: 'settings_get', args: {} },
      { cmd: 'settings_set_general', args: { general } },
      { cmd: 'settings_set_appearance', args: { appearance } },
    ])
  })
})
