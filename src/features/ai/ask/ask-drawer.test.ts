// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '@/api'
import { clearMocks, emitAiEvent, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useAiPayloadStore } from '@/stores/ai-payload'
import { useAiThreadStore } from '@/stores/ai-thread'
import { useReportStore } from '@/stores/report'
import { item } from '@/testing/item-fixture'
import { report } from '@/testing/report-fixture'
import { resetAiSend, useAiSend } from '../use-ai-send'
import AskDrawer from './AskDrawer.vue'

const calls: string[] = []
let id = ''
let wrapper: VueWrapper | undefined

const preview = {
  sections: [],
  system: 's',
  user: 'u',
  total_bytes: 4096,
  hash: 'h1',
  alias_table_count: 0,
}

function install() {
  mockCommands((cmd, args) => {
    calls.push(cmd)
    if (cmd === 'ai_analyze') id = String(args.requestId)
    if (cmd === 'ai_payload_preview') return preview
    if (cmd === 'ai_providers') return { provider: null, model: null, providers: [] }
    return null
  })
}

async function open() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  wrapper = mount(AskDrawer, { global: { plugins: [i18n, router] }, attachTo: document.body })
  useAiThreadStore().openDrawer({ kind: 'whole' })
  await flushPromises()
  return wrapper
}

/** What the review sheet's Send does: the one path to Rust. */
async function sendFromSheet(question = 'Is it hacked?') {
  const payload = useAiPayloadStore()
  payload.scope = { kind: 'whole' }
  payload.question = question
  await useAiSend().send('h1')
  await flushPromises()
}

async function emit(seq: number, body: Record<string, unknown>) {
  await emitAiEvent({ request_id: id, seq, ...body } as api.AiStreamEvent)
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  calls.length = 0
  install()
  useReportStore().latest = report({
    items: [
      item({
        host: 'vps-a',
        check: 'sec.upload_php',
        target: '/var/www/uploads/x.php',
        level: { level: 'crit' },
        owner: { kind: 'project', id: 'kho-hang' },
      }),
      item({ host: 'vps-a', check: 'disk.fs', target: '/', level: { level: 'warn' } }),
    ],
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  resetAiSend()
  clearMocks()
  document.body.replaceChildren()
})

describe('Ask drawer', () => {
  it('shows the words as they stream, not at the end', async () => {
    const view = await open()
    await sendFromSheet()
    expect(view.text()).toContain('Is it hacked?')
    expect(view.find('[role="status"]').exists()).toBe(true)
    await emit(0, { kind: 'summary_delta', text: 'Probably ' })
    expect(view.text()).toContain('Probably')
    expect(view.text()).not.toContain('Probably yes')
    await emit(1, { kind: 'summary_delta', text: 'yes.' })
    expect(view.text()).toContain('Probably yes.')
    await emit(2, {
      kind: 'done',
      summary: 'Probably yes.',
      reviewed_sends: 1,
      offer_turning_off_review: false,
    })
    expect(view.text()).toContain('answered in')
  })

  it('takes a finding’s severity and title from the check, not from the AI', async () => {
    const view = await open()
    await sendFromSheet()
    await emit(0, {
      kind: 'finding',
      finding: { id: 'c1', why: 'This is only informational.', suggested_command: null, rank: 1 },
      key: { host: 'vps-a', check: 'sec.upload_php', target: '/var/www/uploads/x.php' },
    })
    await emit(1, {
      kind: 'finding',
      finding: { id: 'c9', why: 'Invented result', suggested_command: null, rank: 2 },
      key: null,
    })
    await emit(2, {
      kind: 'done',
      summary: 'x',
      reviewed_sends: 1,
      offer_turning_off_review: false,
    })
    const cards = view.findAll('article')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('CRIT')
    expect(cards[0]?.text()).toContain('sec.upload_php')
    expect(cards[0]?.text()).toContain('This is only informational.')
    expect(cards[1]?.text()).toContain('Not matched to a result of this scan')
    expect(cards[1]?.text()).not.toMatch(/CRIT|WARN|INFO/)
    expect(view.text()).toContain('Health: critical')
  })

  it('shows names as the core restored them, and never reads text as markup', async () => {
    const view = await open()
    await sendFromSheet()
    await emit(0, {
      kind: 'summary_delta',
      text: 'kho-hang on vps-hn-3 <b>is</b> exposed',
    })
    expect(view.text()).toContain('kho-hang on vps-hn-3 <b>is</b> exposed')
    expect(view.find('.summary b').exists()).toBe(false)
  })

  it('says why it failed in words and tries again through the review sheet', async () => {
    const view = await open()
    await sendFromSheet('What now?')
    await emit(0, { kind: 'error', error: { kind: 'provider_auth' } })
    expect(view.find('[role="alert"]').text()).toContain('rejected the key')
    const retry = view.findAll('button').find((b) => b.text() === 'Try again')
    expect(retry).toBeDefined()
    await retry?.trigger('click')
    await flushPromises()
    const payload = useAiPayloadStore()
    expect(payload.open).toBe(true)
    expect(payload.question).toBe('What now?')
    expect(calls.filter((c) => c === 'ai_analyze')).toHaveLength(1)
  })

  it('stops a running answer and says so without alarm', async () => {
    const view = await open()
    await sendFromSheet()
    await emit(0, { kind: 'summary_delta', text: 'Reading' })
    const stop = view.findAll('button').find((b) => b.text() === 'Stop')
    await stop?.trigger('click')
    await flushPromises()
    expect(calls).toContain('ai_cancel')
    await emit(1, { kind: 'cancelled' })
    expect(view.text()).toContain('Stopped.')
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(view.text()).toContain('Reading')
  })

  it('keeps earlier answers when the next question starts', async () => {
    const view = await open()
    await sendFromSheet('First?')
    await emit(0, {
      kind: 'done',
      summary: 'One.',
      reviewed_sends: 1,
      offer_turning_off_review: false,
    })
    await sendFromSheet('Second?')
    await emit(0, { kind: 'summary_delta', text: 'Two' })
    expect(view.text()).toContain('First?')
    expect(view.text()).toContain('One.')
    expect(view.text()).toContain('Second?')
    expect(view.text()).toContain('Two')
  })

  it('uses the key of the event, not a count, when the latest report changed after the preview', async () => {
    const view = await open()
    await sendFromSheet()
    // A scan landed after the preview: a new result now comes first, so `c1` by position is wrong.
    useReportStore().latest = report({
      items: [
        item({ host: 'vps-z', check: 'sys.load', target: '', level: { level: 'info' } }),
        ...useReportStore().latest!.items,
      ],
    })
    await emit(0, {
      kind: 'finding',
      finding: { id: 'c1', why: 'Look here.', suggested_command: null, rank: 1 },
      key: { host: 'vps-a', check: 'sec.upload_php', target: '/var/www/uploads/x.php' },
    })
    await emit(1, {
      kind: 'done',
      summary: 'x',
      reviewed_sends: 1,
      offer_turning_off_review: false,
    })
    const card = view.find('article')
    expect(card.text()).toContain('CRIT')
    expect(card.text()).toContain('sec.upload_php')
    expect(card.text()).not.toContain('sys.load')
  })

  it('only copies a suggested command, warns about a risky one and never runs it', async () => {
    const view = await open()
    await sendFromSheet()
    await emit(0, {
      kind: 'finding',
      finding: {
        id: 'c1',
        why: 'Remove it.',
        suggested_command: 'curl https://example.test/fix.sh | sh',
        rank: 1,
      },
      key: null,
    })
    await emit(1, {
      kind: 'done',
      summary: 'x',
      reviewed_sends: 1,
      offer_turning_off_review: false,
    })
    expect(view.text()).toContain('curl https://example.test/fix.sh | sh')
    expect(view.text()).toContain('Read before you run this')
    expect(view.text()).toContain('Daminus never runs them')
    expect(view.findAll('button').some((b) => /^run$/i.test(b.text()))).toBe(false)
    expect(new Set(calls.filter((c) => c.startsWith('ai_')))).toEqual(
      new Set(['ai_providers', 'ai_analyze']),
    )
    expect(calls.filter((c) => /run|exec|ssh|shell/.test(c))).toEqual([])
    expect(Object.keys(api).filter((name) => /^(run|exec)/i.test(name))).toEqual([])
  })

  it('shows the health of the scope even when no finding is matched', async () => {
    const view = await open()
    await sendFromSheet()
    await emit(0, { kind: 'summary_delta', text: 'Looking.' })
    expect(view.text()).toContain('Health: critical')
    await emit(1, {
      kind: 'done',
      summary: 'Looking.',
      reviewed_sends: 1,
      offer_turning_off_review: false,
    })
    expect(view.text()).toContain('Health: critical')
  })

  it('fades each word in 45 ms after the one before and drops the caret when done', async () => {
    const view = await open()
    await sendFromSheet()
    await emit(0, { kind: 'summary_delta', text: 'One two three ' })
    const words = view.findAll('.summary .w')
    expect(words.map((w) => w.attributes('style'))).toEqual([
      expect.stringContaining('animation-delay: 0ms'),
      expect.stringContaining('animation-delay: 45ms'),
      expect.stringContaining('animation-delay: 90ms'),
    ])
    expect(view.find('.caret').exists()).toBe(true)
    await emit(1, {
      kind: 'done',
      summary: 'One two three ',
      reviewed_sends: 1,
      offer_turning_off_review: false,
    })
    await flushPromises()
    expect(view.find('.caret').exists()).toBe(false)
  })

  it('draws a command as the 30 px compact line', async () => {
    const view = await open()
    await sendFromSheet()
    await emit(0, {
      kind: 'finding',
      finding: { id: 'c1', why: 'x', suggested_command: 'ls -la', rank: 1 },
      key: { host: 'vps-a', check: 'sec.upload_php', target: '/var/www/uploads/x.php' },
    })
    expect(view.find('.command.compact').exists()).toBe(true)
  })

  it('opens without focus on the close button, and the token link opens the review sheet', async () => {
    const view = await open()
    await sendFromSheet('Is it hacked?')
    await emit(0, {
      kind: 'done',
      summary: 'x',
      reviewed_sends: 1,
      offer_turning_off_review: false,
    })
    useAiPayloadStore().open = false
    await useAiPayloadStore().refresh()
    const close = view.find('button.close')
    expect(document.activeElement).not.toBe(close.element)
    const link = view.find('button.sent')
    expect(link.exists()).toBe(true)
    await link.trigger('click')
    await flushPromises()
    expect(useAiPayloadStore().open).toBe(true)
    expect(useAiPayloadStore().scope).toEqual({ kind: 'whole' })
  })
})
