// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { clearMocks, emitAiEvent, mockCommands } from '@/api/testing'
import { resetAiSend, useAiSend } from './use-ai-send'

afterEach(() => {
  resetAiSend()
  clearMocks()
})

describe('useAiSend', () => {
  it('sends with its own request id and follows only that request, in order', async () => {
    let id = ''
    mockCommands((cmd, args) => {
      if (cmd === 'ai_analyze') id = String(args.requestId)
      return null
    })
    const ai = useAiSend()
    await ai.send('hash-1')
    expect(ai.requestId.value).toBe(id)
    await emitAiEvent({ request_id: 'other', seq: 0, kind: 'summary_delta', text: 'no' })
    await emitAiEvent({ request_id: id, seq: 0, kind: 'summary_delta', text: 'Hel' })
    await emitAiEvent({ request_id: id, seq: 0, kind: 'summary_delta', text: 'again' })
    await emitAiEvent({ request_id: id, seq: 1, kind: 'summary_delta', text: 'lo' })
    await flushPromises()
    expect(ai.summary.value).toBe('Hello')
    expect(ai.status.value).toBe('streaming')
    await emitAiEvent({
      request_id: id,
      seq: 2,
      kind: 'done',
      summary: 'Hello.',
      reviewed_sends: 3,
      offer_turning_off_review: true,
    })
    await flushPromises()
    expect(ai.status.value).toBe('done')
    expect(ai.done.value).toEqual({ reviewedSends: 3, offerTurningOffReview: true })
  })

  it('answers with an error status when nothing was sent', async () => {
    mockCommands((cmd) => {
      if (cmd === 'ai_analyze') throw { code: { kind: 'provider_auth' }, retryable: false }
      return null
    })
    const ai = useAiSend()
    expect(await ai.send('h')).toBeNull()
    expect(ai.status.value).toBe('error')
    expect(ai.error.value?.code.kind).toBe('provider_auth')
  })
})

describe('a second send', () => {
  it('cancels the request that is still running before it starts', async () => {
    const calls: { cmd: string; id: string }[] = []
    mockCommands((cmd, args) => {
      calls.push({ cmd, id: String(args.requestId) })
      return cmd === 'ai_cancel' ? true : null
    })
    const ai = useAiSend()
    const first = await ai.send('h1')
    await emitAiEvent({ request_id: first!, seq: 0, kind: 'summary_delta', text: 'Hi' })
    await flushPromises()
    expect(ai.status.value).toBe('streaming')
    const second = await ai.send('h2')
    expect(calls.filter((c) => c.cmd === 'ai_cancel')).toEqual([{ cmd: 'ai_cancel', id: first }])
    expect(second).not.toBe(first)
    expect(ai.requestId.value).toBe(second)
  })
})
