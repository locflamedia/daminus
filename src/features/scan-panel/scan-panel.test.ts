// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScanRun } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useProjectsStore } from '@/stores/projects'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useScanStore } from '@/stores/scan'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import ScanPanel from './ScanPanel.vue'

const bundle = timeline as unknown as ResultsBundle
const idle = { facts: 0, dropped: 0 }
const reached = { ...idle, state: 'finished' as const, outcome: { state: 'reached' as const } }

function midScan(): ScanRun {
  return {
    scan_id: 's1',
    started_at: new Date(Date.now() - 44_000).toISOString(),
    next_seq: 5,
    hosts: {
      '@local': reached,
      'vps-hn-3': { ...reached, facts: 14 },
      'vps-sg-1': { ...reached, facts: 9 },
      'vps-sg-2': { ...idle, state: 'running', step: 'containers' },
      'db-main': { ...idle, state: 'queued' },
      'legacy-shop': {
        ...idle,
        state: 'finished',
        outcome: { state: 'timeout' },
      },
    },
  }
}

const calls: Array<{ cmd: string; args: Record<string, unknown> }> = []
const mounted: Array<{ unmount: () => void }> = []

async function mountPanel() {
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    if (cmd === 'scan_start') return { scan_id: 's2', joined: false }
    if (cmd === 'scan_stop') return true
    if (cmd === 'history_list') return { ...bundle.history, bytes: 0 }
    if (cmd === 'rules_list') return []
    return null
  })
  const wrapper = mount(ScanPanel, { global: { plugins: [i18n] }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  calls.length = 0
  setActivePinia(createPinia())
  setI18nLocale('en')
  useProjectsStore().details = bundle.projects
})
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  clearMocks()
  document.body.replaceChildren()
})

function panelText(): string {
  return document.body.querySelector('aside')?.textContent ?? ''
}

describe('Scan panel while a scan runs', () => {
  it('stays shut until it is asked for', async () => {
    useScanStore().run = midScan()
    await mountPanel()
    expect(document.body.querySelector('aside')).toBeNull()
  })

  it('counts the hosts done in words and says what has failed', async () => {
    useScanStore().run = midScan()
    useScanPanelStore().show()
    await mountPanel()
    expect(panelText()).toContain('2 of 5 hosts done · 1 could not be scanned')
    expect(panelText()).toContain('Running')
    expect(panelText()).toContain('Read-only commands. Nothing is installed or changed.')
  })

  it('draws a segment per host in the state of the host', async () => {
    useScanStore().run = midScan()
    useScanPanelStore().show()
    await mountPanel()
    const segments = [...document.body.querySelectorAll('.segments li')].map((li) => li.className)
    expect(segments).toEqual(['done', 'done', 'reading', 'waiting', 'failed'])
  })

  it('lists each host with its projects and opens only the host being read into its steps', async () => {
    useScanStore().run = midScan()
    useScanPanelStore().show()
    await mountPanel()
    const rows = [...document.body.querySelectorAll('.hosts > li')]
    expect(rows).toHaveLength(5)
    expect(rows[0]?.textContent).toContain('vps-hn-3')
    expect(rows[0]?.textContent).toContain('kho-hang')
    expect(rows[0]?.textContent).toContain('14 checks')
    expect(rows[2]?.textContent).toContain('tiemtra · booking')
    const steps = [...(rows[2]?.querySelectorAll('.step') ?? [])].map((s) => s.textContent?.trim())
    expect(steps).toEqual([
      expect.stringContaining('Connect'),
      expect.stringContaining('Host facts'),
      expect.stringContaining('Disk'),
      expect.stringContaining('Containers'),
      expect.stringContaining('Databases'),
      expect.stringContaining('Security'),
    ])
    expect(rows[3]?.querySelectorAll('.step')).toHaveLength(0)
    expect(rows[3]?.textContent).toContain('waiting for a slot')
  })

  it('says why a host failed and keeps its retry off until the scan ends', async () => {
    useScanStore().run = midScan()
    useScanPanelStore().show()
    await mountPanel()
    const failed = document.body.querySelectorAll('.hosts > li')[4]
    expect(failed?.textContent).toContain('no project · timed out')
    const retry = failed?.querySelector('button')
    expect(retry?.getAttribute('aria-disabled')).toBe('true')
  })

  it('lists what finished hosts read', async () => {
    useScanStore().run = midScan()
    useScanPanelStore().show()
    await mountPanel()
    expect(panelText()).toContain('Found so far')
    expect(panelText()).toContain('kho-hang: 14 checks read')
    expect(panelText()).toContain('tiemtra: 9 checks read')
  })

  it('stops the scan from "Stop scan"', async () => {
    useScanStore().run = midScan()
    useScanPanelStore().show()
    await mountPanel()
    const stop = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Stop scan'),
    )
    stop?.click()
    await flushPromises()
    expect(calls.some((c) => c.cmd === 'scan_stop')).toBe(true)
  })

  it('tucks away with "Keep in background" and the scan goes on', async () => {
    useScanStore().run = midScan()
    const panel = useScanPanelStore()
    panel.show()
    await mountPanel()
    const keep = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Keep in background'),
    )
    keep?.click()
    await flushPromises()
    expect(panel.open).toBe(false)
    expect(useScanStore().scanning).toBe(true)
  })

  it('closes on esc and comes back on ⌘B', async () => {
    useScanStore().run = midScan()
    const panel = useScanPanelStore()
    panel.show()
    await mountPanel()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    expect(panel.open).toBe(false)
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', metaKey: true, cancelable: true }),
    )
    expect(panel.open).toBe(true)
  })
})

describe('Scan panel after the scan ended', () => {
  async function ended() {
    const scan = useScanStore()
    const panel = useScanPanelStore()
    scan.run = midScan()
    panel.show()
    const wrapper = await mountPanel()
    scan.lastEnd = 'done'
    scan.run = null
    await flushPromises()
    return { wrapper, panel }
  }

  it('stays open with the failed host and a retry that works', async () => {
    const { panel } = await ended()
    expect(panel.open).toBe(true)
    expect(panelText()).toContain('Scan finished')
    expect(panelText()).not.toContain('Read-only commands')
    const retry = document.body.querySelector('.hosts > li:last-child button')
    expect(retry?.getAttribute('aria-disabled')).toBeNull()
    ;(retry as HTMLButtonElement).click()
    await flushPromises()
    const start = calls.find((c) => c.cmd === 'scan_start')
    expect(start?.args.scope).toEqual({ projects: [], hosts: ['legacy-shop'] })
  })

  it('closes from its one button', async () => {
    const { panel } = await ended()
    const close = [...document.body.querySelectorAll('footer button')].find((b) =>
      b.textContent?.includes('Close'),
    )
    close?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(panel.open).toBe(false)
  })

  it('says the scan was stopped when it was', async () => {
    const scan = useScanStore()
    const panel = useScanPanelStore()
    scan.run = midScan()
    panel.show()
    await mountPanel()
    scan.lastEnd = 'cancelled'
    scan.run = null
    await flushPromises()
    expect(panelText()).toContain('Scan stopped')
  })
})
