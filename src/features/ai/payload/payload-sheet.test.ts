// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PreviewOptions } from '@/api'
import { AiMock } from '@/api/dev-mock-ai'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useAiPayloadStore } from '@/stores/ai-payload'
import { resetAiSend, useAiSend } from '../use-ai-send'
import PayloadSheet from './PayloadSheet.vue'
import { kilobytes, maskedCount, pieces } from './payload-lib'

const calls: Array<{ cmd: string; args: Record<string, unknown> }> = []
let mock: AiMock
let failPreview = false
let sendFails = false
let wrapper: VueWrapper | undefined

beforeEach(() => {
  calls.length = 0
  failPreview = false
  sendFails = false
  mock = new AiMock('ai', 1000)
  setActivePinia(createPinia())
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    if (cmd === 'ai_payload_preview' && failPreview) {
      throw { code: { kind: 'internal' }, retryable: false }
    }
    if (cmd === 'ai_analyze' && !sendFails) return null
    return mock.handle(cmd, args)
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
  resetAiSend()
  clearMocks()
})

async function open() {
  wrapper = mount(PayloadSheet, { global: { plugins: [i18n] }, attachTo: document.body })
  const store = useAiPayloadStore()
  await store.review({
    scope: { kind: 'whole' },
    question: 'Is this server hacked?',
    context: 'kho-hang · scan #12',
    subject: 'kho-hang',
  })
  await flushPromises()
  return store
}

const previews = () =>
  calls.filter((c) => c.cmd === 'ai_payload_preview').map((c) => c.args.options as PreviewOptions)
const sendButton = () =>
  [...document.querySelectorAll('button')].find((b) => /Send to/.test(b.textContent ?? ''))
const key = (k: string) =>
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
  )

describe('payload sheet', () => {
  it('lists the sections with sizes and shows the exact text with masked values marked', async () => {
    await open()
    expect(document.body.textContent).toContain('Review before sending to')
    expect(document.querySelectorAll('.sec')).toHaveLength(6)
    expect(document.querySelector('.code')?.textContent).toContain('DATA-4f1c9a2e7b')
    expect(document.querySelector('.mask')?.textContent).toBe('[host-1]')
  })

  it('previews again when a section is toggled and the hash that is sent follows the change', async () => {
    const store = await open()
    const first = store.preview?.hash
    expect(previews().at(-1)?.include).not.toContain('top_disk_paths')
    const row = [...document.querySelectorAll<HTMLInputElement>('.sec .in')].at(-1)
    row!.click()
    await flushPromises()
    expect(previews()).toHaveLength(2)
    expect(previews().at(-1)?.include).toContain('top_disk_paths')
    expect(store.preview?.hash).toBeDefined()
    sendButton()!.click()
    await flushPromises()
    const sent = calls.find((c) => c.cmd === 'ai_analyze')
    expect(sent?.args.previewedHash).toBe(store.preview?.hash)
    expect(first).toBeDefined()
  })

  it('does not offer Send while a new preview is on its way (the old hash is stale)', async () => {
    const store = await open()
    const pending = store.setQuestion('Another question?')
    expect(store.sendable).toBe(false)
    expect(await store.send()).toBe(false)
    await pending
    expect(store.sendable).toBe(true)
    expect(previews().at(-1)?.question).toBe('Another question?')
  })

  it('sends the hash of the current preview, closes, and hands the stream to useAiSend', async () => {
    const store = await open()
    const hash = store.preview!.hash
    sendButton()!.click()
    await flushPromises()
    expect(calls.filter((c) => c.cmd === 'ai_analyze').map((c) => c.args.previewedHash)).toEqual([
      hash,
    ])
    expect(store.open).toBe(false)
    expect(useAiSend().requestId.value).not.toBeNull()
  })

  it('stays open and says why when Rust refuses the send', async () => {
    sendFails = true
    const store = await open()
    sendButton()!.click()
    await flushPromises()
    expect(store.open).toBe(true)
    expect(document.body.textContent).toContain('Nothing was sent')
  })

  it('shows the error of a failed preview and sends nothing', async () => {
    failPreview = true
    const store = await open()
    expect(document.body.textContent).toContain('Couldn’t prepare what would be sent')
    expect(store.sendable).toBe(false)
    expect(sendButton()!.disabled).toBe(true)
    failPreview = false
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Try again'))!
      .click()
    await flushPromises()
    expect(store.sendable).toBe(true)
    expect(calls.some((c) => c.cmd === 'ai_analyze')).toBe(false)
  })

  it('counts the reviews: "review n of 3", then offers to stop asking once done says so', async () => {
    const store = await open()
    expect(document.querySelector('.count')).toBeNull()
    expect(document.querySelector('.ask')).toBeNull()
    store.noteDone(1, false)
    await flushPromises()
    expect(document.querySelector('.count')?.textContent).toBe('review 2 of 3')
    store.noteDone(3, true)
    await flushPromises()
    expect(document.querySelector('.count')).toBeNull()
    expect(document.querySelector('.ask')?.textContent).toContain('Don’t ask again for kho-hang')
  })

  it('closes on Escape without sending anything', async () => {
    const store = await open()
    key('Escape')
    await flushPromises()
    expect(store.open).toBe(false)
    expect(calls.some((c) => c.cmd === 'ai_analyze')).toBe(false)
  })

  it('shows what the model or the server said as text, never as markup', async () => {
    const store = await open()
    store.preview = {
      ...store.preview!,
      user: '<img src=x onerror=alert(1)> [redacted:key]',
    }
    await flushPromises()
    expect(document.querySelector('.code img')).toBeNull()
    expect(document.querySelector('.code')?.textContent).toContain('<img src=x')
  })
})

describe('payload sheet, as drawn on the board', () => {
  it('is a plain card, focuses the panel (not the esc key) and sets the model in mono', async () => {
    const store = await open()
    store.model = 'claude-sonnet-5'
    await flushPromises()
    expect(document.querySelector('.tray.plain')).not.toBeNull()
    await flushPromises()
    expect(document.activeElement).toBe(document.querySelector('.tray'))
    expect(document.querySelector('.context .mono')).not.toBeNull()
  })

  it('writes sizes in KB with one decimal', async () => {
    await open()
    const sizes = [...document.querySelectorAll('.sec .kb')].map((e) => e.textContent ?? '')
    expect(sizes.length).toBeGreaterThan(0)
    for (const t of sizes) expect(t).toMatch(/^\d+\.\d KB$/)
  })

  it('shows the final masked count when it is read', async () => {
    await open()
    expect(document.querySelector('.stats .sr')?.textContent).toBe(
      String(
        maskedCount(`${useAiPayloadStore().preview!.system}\n${useAiPayloadStore().preview!.user}`),
      ),
    )
  })
})

describe('payload lib', () => {
  it('colours the parts of a JSON line and keeps masked values apart', () => {
    const ps = pieces('  "ip": "[ip-1]", "n": 12 }')
    expect(ps.map((p) => p.text).join('')).toBe('  "ip": "[ip-1]", "n": 12 }')
    expect(ps.find((p) => p.text === '"ip"')?.kind).toBe('key')
    expect(ps.find((p) => p.masked)?.text).toBe('[ip-1]')
    expect(ps.find((p) => p.text === '12')?.kind).toBe('num')
    expect(pieces('plain text')[0]?.kind).toBe('plain')
    expect(kilobytes(100)).toBe(0.1)
    expect(kilobytes(10035)).toBe(9.8)
  })

  it('finds masked values', () => {
    expect(maskedCount('a [host-1] b [ip-2] c [redacted:key] d')).toBe(3)
    expect(pieces('x [ip-1]').map((p) => p.masked)).toEqual([false, true])
  })
})
