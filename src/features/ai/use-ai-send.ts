// One AI send, shared by the review sheet (which starts it) and the Ask drawer (which shows the
// reply). The state lives at module level so both see the same stream. It owns the request id,
// listens to `ai://event` for that id only (a stale or repeated `seq` is dropped), and turns every
// ending into `status` + `error`. Text stays text: nothing here is ever markup.
import { computed, readonly, ref, shallowRef } from 'vue'
import {
  type AiStreamEvent,
  type AppError,
  aiAnalyze,
  aiCancel,
  isAppError,
  onAiEvent,
} from '@/api'
import type { AskedFinding } from '@/stores/ai-thread'

/** `idle` before a send; `sending` until the first event; `streaming` while the reply arrives. */
export type AiSendStatus = 'idle' | 'sending' | 'streaming' | 'done' | 'error' | 'cancelled'

/** What `done` tells: how many sends the user reviewed, and whether to offer to stop asking. */
export interface AiSendDone {
  reviewedSends: number
  offerTurningOffReview: boolean
}

const requestId = ref<string | null>(null)
const summary = ref('')
const findings = shallowRef<AskedFinding[]>([])
const status = ref<AiSendStatus>('idle')
const error = shallowRef<AppError | null>(null)
const done = shallowRef<AiSendDone | null>(null)

let unlisten: (() => void) | null = null
let lastSeq = -1

function stopListening() {
  unlisten?.()
  unlisten = null
}

function apply(event: AiStreamEvent) {
  if (event.request_id !== requestId.value || event.seq <= lastSeq) return
  lastSeq = event.seq
  switch (event.kind) {
    case 'summary_delta':
      status.value = 'streaming'
      summary.value += event.text
      return
    case 'finding':
      status.value = 'streaming'
      findings.value = [...findings.value, { ...event.finding, key: event.key }]
      return
    case 'done':
      summary.value = event.summary
      done.value = {
        reviewedSends: event.reviewed_sends,
        offerTurningOffReview: event.offer_turning_off_review,
      }
      status.value = 'done'
      stopListening()
      return
    case 'error':
      error.value = { code: event.error, retryable: false }
      status.value = 'error'
      stopListening()
      return
    case 'cancelled':
      status.value = 'cancelled'
      stopListening()
      return
  }
}

function newRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}

/** Forgets the last send (a new question, or the drawer closing). Stops a running one first. */
export function resetAiSend() {
  stopListening()
  requestId.value = null
  summary.value = ''
  findings.value = []
  status.value = 'idle'
  error.value = null
  done.value = null
  lastSeq = -1
}

/**
 * Sends the payload named by `previewedHash` (the hash of the CURRENT preview). Resolves with the
 * request id once Rust took it, or `null` when it did not (`status` is `error`, `error` says why).
 */
async function send(previewedHash: string): Promise<string | null> {
  resetAiSend()
  const id = newRequestId()
  requestId.value = id
  status.value = 'sending'
  try {
    // Listen before asking: the first event can arrive before the answer to the command.
    unlisten = await onAiEvent(apply)
    await aiAnalyze(id, previewedHash)
    return id
  } catch (e) {
    stopListening()
    if (requestId.value === id) {
      error.value = isAppError(e) ? e : { code: { kind: 'internal' }, retryable: false }
      status.value = 'error'
    }
    return null
  }
}

/** Stops the running send; it ends with `status === 'cancelled'`. */
async function cancel(): Promise<void> {
  const id = requestId.value
  if (id === null || (status.value !== 'sending' && status.value !== 'streaming')) return
  try {
    await aiCancel(id)
  } catch (e) {
    console.error(e)
  }
}

/** The one send of the window. */
export function useAiSend() {
  return {
    requestId: readonly(requestId),
    summary: readonly(summary),
    findings: readonly(findings),
    status: readonly(status),
    error: readonly(error),
    /** Set by `done`; `offerTurningOffReview` is true from the third reviewed send on. */
    done: readonly(done),
    busy: computed(() => status.value === 'sending' || status.value === 'streaming'),
    send,
    cancel,
    reset: resetAiSend,
  }
}
