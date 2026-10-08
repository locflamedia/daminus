// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostKeyInfo } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useHostKeyStore } from '@/stores/host-key'
import HostKeyDialog from './HostKeyDialog.vue'

const OFFERED = 'ED25519 SHA256:Lm7rC1pQe9Vx3Ns0Kd8Tg2Yh5Bw6Fj4Zu7Ha1Mo2Pa'
const RECORDED = 'ED25519 SHA256:q3F8vN2kLx7Tq0Ybe1WmZc4R9sPdH6uJt5Ao8Gk9Xk'

let wrapper: ReturnType<typeof mount> | undefined
let looks: string[] = []

function show(info: HostKeyInfo | null, answer: HostKeyInfo | null = info) {
  setActivePinia(createPinia())
  looks = []
  mockCommands((cmd, args) => {
    if (cmd === 'host_key_check') looks.push(String(args.host))
    return cmd === 'host_key_check' ? answer : null
  })
  const store = useHostKeyStore()
  void store.open('db-main', info)
  wrapper = mount(HostKeyDialog, { global: { plugins: [i18n] }, attachTo: document.body })
  return store
}

const text = () => document.body.textContent ?? ''
const commands = () =>
  [...document.body.querySelectorAll('.command .text')].map((c) => c.textContent?.trim())
const buttons = () => [...document.body.querySelectorAll('button')].map((b) => b.textContent ?? '')

beforeEach(() => setI18nLocale('en'))
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  clearMocks()
  document.body.replaceChildren()
})

describe('host key screen', () => {
  it('first connection: the offered fingerprint, `ssh db-main`, Retry and Skip, no Trust', async () => {
    show({ state: 'unknown', offered: OFFERED, known: [] })
    await flushPromises()
    expect(text()).toContain('db-main · first connection, key unknown')
    expect(text()).toContain('SHA256:Lm7r')
    expect(text()).toContain('ED25519')
    expect(commands()).toEqual(['ssh db-main'])
    expect(buttons().some((b) => b.includes('Retry db-main'))).toBe(true)
    expect(buttons().some((b) => b.includes('Skip host'))).toBe(true)
    expect(buttons().some((b) => /trust(?! button)/i.test(b))).toBe(false)
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('changed key: both fingerprints, the warning, the three steps and both commands', async () => {
    show(
      { state: 'changed', offered: OFFERED, known: [RECORDED] },
      { state: 'changed', offered: OFFERED, known: [RECORDED] },
    )
    await flushPromises()
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(text()).toContain('db-main is not the server it was')
    expect(text()).toContain('SHA256:q3F8')
    expect(text()).toContain('SHA256:Lm7r')
    expect(text()).toContain('≠')
    expect(text()).toContain('This may be someone pretending to be db-main.')
    expect(document.body.querySelectorAll('ol li')).toHaveLength(3)
    expect(commands()).toEqual(['ssh-keygen -R db-main', 'ssh db-main'])
    expect(text()).toContain('Daminus never edits known_hosts.')
    expect(buttons().some((b) => b.includes('Keep it blocked'))).toBe(true)
    expect(buttons().some((b) => b.includes('Skip this scan'))).toBe(true)
    expect(document.body.querySelectorAll('.idn')).toHaveLength(2)
  })

  it('unavailable: no fingerprint box and no comparison, only the command', async () => {
    show({ state: 'unknown', offered: null, known: [] })
    await flushPromises()
    expect(text()).toContain('db-main · fingerprint unavailable')
    expect(document.body.querySelector('.fp')).toBeNull()
    expect(text()).toContain('See it yourself')
    expect(commands()).toEqual(['ssh db-main'])
  })

  it('explains why there is no Trust button, on request', async () => {
    show({ state: 'changed', offered: OFFERED, known: [RECORDED] })
    await flushPromises()
    expect(text()).not.toContain('never writes it')
    const why = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Why not a Trust button?'),
    )
    why?.click()
    await flushPromises()
    expect(text()).toContain('never writes it')
  })

  it('first connection: Retry first, Skip host as a ghost, and no link to the Trust button', async () => {
    show({ state: 'unknown', offered: OFFERED, known: [] })
    await flushPromises()
    const foot = [...document.body.querySelectorAll('.foot button')]
    expect(foot.map((b) => b.textContent?.trim())).toEqual(['Retry db-main', 'Skip host'])
    expect(foot[1]?.classList.contains('btn-ghost')).toBe(true)
  })

  it('changed key: the host is set in mono and focus starts on Keep it blocked', async () => {
    show({ state: 'changed', offered: OFFERED, known: [RECORDED] })
    await flushPromises()
    expect(document.body.querySelector('h2 .mono')?.textContent).toBe('db-main')
    expect(document.activeElement?.textContent).toContain('Keep it blocked')
    expect(document.body.querySelector('.layer.wide.shakes')).not.toBeNull()
  })

  it('Retry looks again and says what it found under the buttons', async () => {
    const store = show(
      { state: 'unknown', offered: OFFERED, known: [] },
      { state: 'unknown', offered: OFFERED, known: [] },
    )
    await flushPromises()
    const retry = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Retry db-main'),
    )
    retry?.click()
    await flushPromises()
    expect(looks).toEqual(['db-main', 'db-main'])
    expect(store.result).toBe('still_unknown')
    const line = document.body.querySelector('.result')
    expect(line?.textContent).toContain('Still unknown · known_hosts has no entry for db-main yet')
    expect(line?.textContent).toContain('Did Terminal ask you to type yes?')
  })

  it('says the key was accepted when the lookup now knows it', async () => {
    show(
      { state: 'unknown', offered: OFFERED, known: [] },
      { state: 'known', offered: OFFERED, known: [OFFERED] },
    )
    await flushPromises()
    const store = useHostKeyStore()
    await store.retry()
    await flushPromises()
    expect(document.body.querySelector('.result')?.textContent).toContain(
      'Key accepted · db-main is trusted now',
    )
  })

  it('Keep it blocked closes the screen and leaves the host as it was', async () => {
    const store = show({ state: 'changed', offered: OFFERED, known: [RECORDED] })
    await flushPromises()
    const keep = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Keep it blocked'),
    )
    keep?.click()
    await flushPromises()
    expect(store.isOpen).toBe(false)
  })

  it('speaks Vietnamese', async () => {
    setI18nLocale('vi')
    show({ state: 'changed', offered: OFFERED, known: [RECORDED] })
    await flushPromises()
    expect(text()).toContain('db-main không còn là máy chủ cũ')
    expect(text()).toContain('Giữ chặn')
  })
})
