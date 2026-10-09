// The review sheet's state ("what will be sent"): which sections are in, the question, and the
// preview Rust made for exactly that. Every change asks for a new preview; until it arrives the
// old hash is no longer offered (`sendable` is false), so Send can never carry the hash of
// something other than what is on screen. A preview that comes back after a newer change was
// made is dropped.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  type AppError,
  type PayloadPreview,
  type PreviewScope,
  aiPayloadPreview,
  aiProviders,
  isAppError,
} from '@/api'
import type { SectionId } from '@/api/bindings/SectionId'
import { useAiSend } from '@/features/ai/use-ai-send'

/** Sections a person can switch; the question is always sent. */
export const OPTIONAL_SECTIONS: readonly SectionId[] = [
  'project_config',
  'check_results',
  'diff',
  'server_facts',
  'top_disk_paths',
]

/** What the board has on at the start (Top disk paths off). */
export const DEFAULT_SECTIONS: readonly SectionId[] = [
  'project_config',
  'check_results',
  'diff',
  'server_facts',
]

/** The sheet shows for the first three sends, then offers to stop asking. */
export const REVIEWS_BEFORE_OFFER = 3

export interface ReviewRequest {
  scope: PreviewScope
  question: string
  /** The line under the title: what the question is about ("kho-hang · scan #12 vs #11"). */
  context?: string
  /** The project or server named by "Don't ask again for …". */
  subject?: string
}

export const useAiPayloadStore = defineStore('ai-payload', () => {
  const open = ref(false)
  const scope = ref<PreviewScope>({ kind: 'whole' })
  const question = ref('')
  const context = ref('')
  const subject = ref('')
  const include = ref<SectionId[]>([...DEFAULT_SECTIONS])
  const preview = shallowRef<PayloadPreview | null>(null)
  const loading = ref(false)
  const error = shallowRef<AppError | null>(null)
  const providerName = ref('')
  /** The chosen provider's id, for its logo in the sheet header. */
  const providerId = ref<string | null>(null)
  const model = ref('')
  /** Reviewed sends so far in this window (from `done`); 0 until the first reply. */
  const reviewedSends = ref(0)
  const offerStopAsking = ref(false)
  /** The person's tick on "Don't ask again"; the owner of the setting reads it. */
  const dontAskAgain = ref(false)
  let generation = 0
  const ai = useAiSend()
  // The count and the offer arrive with the end of every send, whoever started it.
  watch(ai.done, (d) => {
    if (d) noteDone(d.reviewedSends, d.offerTurningOffReview)
  })

  /** True when the text on screen is exactly what a send would carry. */
  const sendable = computed(
    () =>
      open.value &&
      !loading.value &&
      error.value === null &&
      preview.value !== null &&
      !ai.busy.value,
  )

  async function refresh() {
    const mine = ++generation
    loading.value = true
    try {
      const next = await aiPayloadPreview(scope.value, {
        question: question.value,
        include: [...include.value],
        hide_hosts: true,
      })
      if (mine !== generation) return
      preview.value = next
      error.value = null
    } catch (e) {
      if (mine !== generation) return
      preview.value = null
      error.value = isAppError(e) ? e : { code: { kind: 'internal' }, retryable: false }
      if (!isAppError(e)) console.error(e)
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  async function readProvider() {
    try {
      const view = await aiProviders()
      const chosen = view.providers.find((p) => p.profile.id === view.provider)
      providerName.value = chosen?.profile.name ?? ''
      providerId.value = chosen?.profile.id ?? null
      model.value = view.model ?? chosen?.profile.models[0] ?? ''
    } catch (e) {
      console.error(e)
    }
  }

  /** Opens the sheet for `request` and previews it. */
  async function review(request: ReviewRequest) {
    scope.value = request.scope
    question.value = request.question
    context.value = request.context ?? ''
    subject.value = request.subject ?? ''
    include.value = [...DEFAULT_SECTIONS]
    preview.value = null
    error.value = null
    dontAskAgain.value = false
    open.value = true
    await Promise.all([readProvider(), refresh()])
  }

  function toggle(id: SectionId) {
    if (id === 'question') return Promise.resolve()
    include.value = include.value.includes(id)
      ? include.value.filter((s) => s !== id)
      : OPTIONAL_SECTIONS.filter((s) => s === id || include.value.includes(s))
    return refresh()
  }

  function setQuestion(text: string) {
    if (text === question.value) return Promise.resolve()
    question.value = text
    return refresh()
  }

  function close() {
    generation += 1
    open.value = false
    loading.value = false
  }

  /**
   * Sends the CURRENT preview and closes the sheet; the Ask drawer shows the reply from
   * `useAiSend()`. Answers false (and stays open) when there is nothing sendable.
   */
  async function send(): Promise<boolean> {
    const current = preview.value
    if (!sendable.value || current === null) return false
    const id = await ai.send(current.hash)
    if (id === null) return false
    close()
    return true
  }

  /** Called with the `done` of a send: the count for "review n of 3" and the stop-asking offer. */
  function noteDone(reviewed: number, offer: boolean) {
    reviewedSends.value = reviewed
    offerStopAsking.value = offer
  }

  return {
    open,
    scope,
    question,
    context,
    subject,
    include,
    preview,
    loading,
    error,
    providerName,
    providerId,
    model,
    reviewedSends,
    offerStopAsking,
    dontAskAgain,
    sendable,
    review,
    refresh,
    toggle,
    setQuestion,
    close,
    send,
    noteDone,
  }
})
