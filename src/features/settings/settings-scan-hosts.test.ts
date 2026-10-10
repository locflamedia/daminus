// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetSettingsMock, settingsAnswer } from '@/api/dev-mock-settings'
import { SetupMock } from '@/api/dev-mock-setup'
import type { HostListing } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useHostsSettingsStore } from '@/stores/hosts-settings'
import { useScanSettingsStore } from '@/stores/scan-settings'
import { useSettingsStore } from '@/stores/settings'
import SettingsHosts from './SettingsHosts.vue'
import SettingsScan from './SettingsScan.vue'

const calls: { cmd: string; args: Record<string, unknown> }[] = []

/** Set to make `hosts_list` say ssh refused the config. */
let configError: unknown = null
/** Set to make `hosts_list` give no `ssh -G` answer for any host. */
let unresolved = false

function install() {
  const setup = new SetupMock('setup', 1000)
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    if (cmd === 'agent_status' && unresolved) return { present: true, has_keys: true, keys: 1 }
    if (cmd === 'hosts_list' && (configError || unresolved)) {
      const listing = setup.handle(cmd, args) as HostListing
      return {
        ...listing,
        ...(configError ? { config_error: configError } : {}),
        entries: unresolved
          ? listing.entries.map((e) => ({ ...e, resolved: null }))
          : listing.entries,
      }
    }
    return (
      settingsAnswer(cmd, args) ??
      setup.handle(cmd, args) ??
      (cmd === 'history_list' ? { scans: [], keep: 20, bytes: 0 } : null)
    )
  })
}

async function mountView(view: typeof SettingsScan | typeof SettingsHosts) {
  const pinia = createPinia()
  setActivePinia(pinia)
  install()
  const settings = useSettingsStore()
  settings.init()
  await settings.load()
  const host = document.createElement('div')
  host.id = 'settings-actions'
  document.body.append(host)
  const wrapper = mount(view, { global: { plugins: [pinia, i18n] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  resetSettingsMock()
  configError = null
  unresolved = false
  calls.length = 0
  localStorage.clear()
  setI18nLocale('en')
})

afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Settings › Scan', () => {
  it('draws the six groups, the skipped paths, the limits and the thresholds', async () => {
    const wrapper = await mountView(SettingsScan)
    const text = wrapper.text()
    for (const word of [
      'Disk and large files',
      'Code changes',
      'node_modules',
      'Add path',
      'Connect timeout',
      'Hosts at once',
      'Warn 80%',
      'Critical 90%',
      'Container memory',
      'What runs on each host',
    ]) {
      expect(text).toContain(word)
    }
  })

  it('turns a group off at once and sends the whole section', async () => {
    const wrapper = await mountView(SettingsScan)
    const switches = wrapper.findAll('input[type="checkbox"]')
    await switches[0]?.setValue(false)
    await flushPromises()
    const sent = calls.find((c) => c.cmd === 'settings_set_scan')
    expect(sent).toBeDefined()
    const scan = sent?.args.scan as { disabled_groups: string[] }
    expect(scan.disabled_groups).toContain('disk')
    expect(wrapper.text()).toContain('Saved')
    expect(calls.some((c) => c.cmd === 'report_latest')).toBe(true)
  })

  it('writes a threshold as an override the core applies, and reads it back', async () => {
    const wrapper = await mountView(SettingsScan)
    const store = useScanSettingsStore()
    store.setCertDays(30)
    store.setMemory(95)
    store.setDisk({ warn: 70, crit: 85 })
    await flushPromises()
    const saved = (await settingsAnswer('settings_get', {})) as {
      scan: { thresholds: { check: string; warn?: number; field?: string }[] }
    }
    const checks = saved.scan.thresholds.map((o) => o.check)
    expect(checks).toEqual(['url.tls', 'docker.compose', 'disk.fs'])
    const slider = wrapper.findAll('[role="slider"]')
    expect(slider.map((s) => s.attributes('aria-valuenow'))).toEqual(['70', '85'])
  })

  it('adds and removes a skipped path, and refuses what the core would refuse', async () => {
    const wrapper = await mountView(SettingsScan)
    const store = useScanSettingsStore()
    expect(store.addSkipPath('--help')).toBe('invalid')
    expect(store.addSkipPath('  ')).toBe('empty')
    expect(store.addSkipPath('vendor')).toBe('duplicate')
    expect(store.addSkipPath('storage/logs')).toBeNull()
    await flushPromises()
    expect(wrapper.text()).toContain('storage/logs')
    await wrapper.get('button[aria-label="Stop skipping storage/logs"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('storage/logs')
  })

  it('shows the commands only of the groups that are on', async () => {
    const wrapper = await mountView(SettingsScan)
    expect(wrapper.text()).not.toContain('git -C /srv/*')
    useScanSettingsStore().setGroup('code_changes', true)
    await flushPromises()
    expect(wrapper.text()).toContain('git -C /srv/* status --porcelain')
  })
})

describe('Settings › Hosts', () => {
  it('lists the hosts with the projects that use them and opens the first one', async () => {
    const wrapper = await mountView(SettingsHosts)
    const text = wrapper.text()
    expect(text).toContain('vps-sg-2')
    expect(text).toContain('Left out (')
    expect(text).toContain('Include in scans')
    expect(text).toContain('HostName')
  })

  it('leaves a host out of scans and puts it back', async () => {
    const wrapper = await mountView(SettingsHosts)
    const store = useHostsSettingsStore()
    await wrapper.get('input[type="checkbox"]').setValue(false)
    await flushPromises()
    const sent = calls.find((c) => c.cmd === 'hosts_set_include')
    expect(sent?.args).toEqual({ host: store.selected, include: false })
    expect(store.excluded).toEqual([store.selected])
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(store.excluded).toEqual([])
  })

  it('reads the ssh config again on Reload config', async () => {
    await mountView(SettingsHosts)
    const before = calls.filter((c) => c.cmd === 'hosts_list').length
    const buttons = [...document.querySelectorAll('button')]
    buttons.find((b) => b.textContent?.includes('Reload config'))?.click()
    await flushPromises()
    expect(calls.filter((c) => c.cmd === 'hosts_list').length).toBeGreaterThan(before)
  })

  it('says which line of the ssh config ssh refused', async () => {
    configError = {
      error: {
        code: { kind: 'ssh_config_invalid', path: '/u/.ssh/config', line: 6 },
        retryable: false,
      },
      excerpt: [{ number: 6, text: '  Port 99999' }],
    }
    const wrapper = await mountView(SettingsHosts)
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('Could not read your SSH config')
    expect(alert.text()).toContain('ssh stops at line 6 of /u/.ssh/config')
    expect(alert.text()).toContain('Port 99999')
    expect(wrapper.text()).toContain('vps-sg-2')
  })

  it('says Not read in the connection rows when ssh could not resolve the host', async () => {
    configError = {
      error: {
        code: { kind: 'ssh_config_invalid', path: '/u/.ssh/config', line: 6 },
        retryable: false,
      },
      excerpt: [],
    }
    unresolved = true
    const wrapper = await mountView(SettingsHosts)
    const rows = wrapper.findAll('.fields dd')
    // HostName, User, Port, IdentityFile, ProxyJump: never the defaults (alias, port 22).
    expect(rows.slice(0, 5).map((r) => r.text().split(' · ')[0])).toEqual(Array(5).fill('Not read'))
    expect(rows.slice(0, 5).every((r) => r.classes('not-read'))).toBe(true)
    // Source comes from Daminus's own read of the file and stays.
    expect(rows[5]?.text()).toMatch(/config, line \d+/)
    // What Daminus knows itself stays beside Not read: the agent's keys.
    expect(rows[3]?.text()).toMatch(/^Not read · /)
    // The list does not show the alias as if it were the address either.
    const targets = wrapper.findAll('.target').map((t) => t.text())
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.every((t) => t === 'Not read')).toBe(true)
  })

  it('says why an entry is left out when the list is opened', async () => {
    const wrapper = await mountView(SettingsHosts)
    await wrapper.get('button[aria-label="Show or hide the entries left out"]').trigger('click')
    expect(wrapper.text()).toContain('a pattern, sets defaults for many hosts')
  })
})
