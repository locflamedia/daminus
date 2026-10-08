// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import type { ScanSettings } from './bindings/ScanSettings'
import {
  dataClear,
  dataExport,
  dataUsage,
  hostsExcluded,
  hostsSetInclude,
  settingsGet,
  settingsReset,
  settingsSetAppearance,
  settingsSetData,
  settingsSetGeneral,
  settingsSetScan,
} from './commands'
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

  it('send the data section, and nothing with the other data commands', async () => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = []
    mockCommands((cmd, args) => {
      calls.push({ cmd, args })
      return null
    })
    const data = { keep_scans: 50, forget_ai_after_days: null }
    await settingsSetData(data)
    await settingsReset()
    await dataUsage()
    await dataExport()
    await dataClear()
    expect(calls).toEqual([
      { cmd: 'settings_set_data', args: { data } },
      { cmd: 'settings_reset', args: {} },
      { cmd: 'data_usage', args: {} },
      { cmd: 'data_export', args: {} },
      { cmd: 'data_clear', args: {} },
    ])
  })

  it('send the scan section and the host switch as Rust names them', async () => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = []
    mockCommands((cmd, args) => {
      calls.push({ cmd, args })
      return null
    })
    const scan: ScanSettings = {
      disabled_groups: ['code_changes'],
      skip_paths: ['vendor'],
      large_file_mb: 50,
      connect_timeout_s: 10,
      hosts_at_once: null,
      thresholds: [{ check: 'disk.fs', warn: 70, crit: 85 }],
    }
    await settingsSetScan(scan)
    await hostsExcluded()
    await hostsSetInclude('vps-a', false)
    expect(calls.map((c) => c.cmd)).toEqual([
      'settings_set_scan',
      'hosts_excluded',
      'hosts_set_include',
    ])
    expect(calls[2]?.args).toEqual({ host: 'vps-a', include: false })
  })
})
