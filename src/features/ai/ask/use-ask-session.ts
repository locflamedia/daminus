// The Ask drawer's engine: it turns a question into a review (the sheet shows what would be
// sent), follows the one send of the window (`use-ai-send`) and writes what streams in into the
// thread store, so earlier answers stay when the next one starts. It sends nothing itself: only
// the review sheet's Send button reaches Rust, and nothing here can run a suggested command.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Item } from '@/api'
import { i18n } from '@/i18n'
import { useAiSend } from '@/features/ai/use-ai-send'
import { useAiPayloadStore } from '@/stores/ai-payload'
import { useAiThreadStore, type AiTurn } from '@/stores/ai-thread'
import { useOverviewStore } from '@/stores/overview'
import { useReportStore } from '@/stores/report'
import { type AskScope, inScope } from './ask-scope'

/** What a scope is called in words ("kho-hang", "vps-sg-2", or the whole report). */
export function useScopeName(scope: () => AskScope) {
  const { t } = useI18n()
  return computed(() => {
    const s = scope()
    return s.kind === 'project' ? s.id : s.kind === 'server' ? s.host : t('aiAsk.everything')
  })
}

/** Opens the review sheet for `question` about `scope`; Send there is the only way out. */
export function openReview(scope: AskScope, question: string) {
  const report = useReportStore().latest
  const baseline = useOverviewStore().baselineSeq
  const name = scope.kind === 'project' ? scope.id : scope.kind === 'server' ? scope.host : ''
  const { t } = i18n.global
  const parts = [name, report?.seq != null ? t('aiAsk.scanNo', { n: report.seq }) : '']
    .filter((p) => p !== '')
    .join(' · ')
  const vs = baseline !== null && parts !== '' ? ` ${t('aiAsk.vs', { n: baseline })}` : ''
  void useAiPayloadStore().review({ scope, question, context: parts + vs, subject: name })
}

/** Follows the send and keeps the thread; call once, where the drawer lives. */
export function useAskSession() {
  const ai = useAiSend()
  const thread = useAiThreadStore()
  const payload = useAiPayloadStore()
  let begun: string | null = null

  watch(
    [ai.status, ai.summary, ai.findings, ai.error],
    () => {
      const status = ai.status.value
      const id = ai.requestId.value
      if (status === 'idle' || id === null) return
      if (id !== begun) {
        begun = id
        const seq = useReportStore().latest?.seq ?? null
        thread.begin(payload.scope, payload.question, seq)
      }
      const active = thread.activeId
      if (active === null) return
      thread.write(active, {
        summary: ai.summary.value,
        findings: [...ai.findings.value],
        status: status === 'sending' ? 'waiting' : status,
        error: ai.error.value,
      })
    },
    { flush: 'sync' },
  )

  const busy = computed(() => ai.busy.value)

  const ask = openReview

  /** The same question again; the person reviews what is sent once more. */
  function retry(turn: AiTurn) {
    ask(turn.scope, turn.question)
  }

  return { busy, ask, retry, cancel: ai.cancel }
}

/** How many results of the scope are critical or warn and still active, for the context chip. */
export function severityMix(items: readonly Item[] | undefined, scope: AskScope) {
  let crit = 0
  let warn = 0
  for (const item of items ?? []) {
    if (!inScope(item, scope) || item.disposition.kind !== 'active') continue
    if (item.severity.level === 'crit') crit += 1
    else if (item.severity.level === 'warn') warn += 1
  }
  return { crit, warn }
}
