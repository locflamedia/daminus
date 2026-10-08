// "Mark as expected": saves a rule through Rust, refreshes what the screens read, and offers
// Undo in a toast (button or ⌘Z) for as long as the toast stays. Rust adds the fingerprint, the
// review day and the id; this only sends what the person chose.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type AppError, type CheckKey, type ExpectedRule, isAppError } from '@/api'
import { rulesAdd, rulesRemove } from '@/api'
import { t } from '@/i18n'
import { type ExpectedForm, type MarkLevel, toDraft } from '@/lib/expected-form'
import { formatDate } from '@/lib/format'
import { useHistoryStore } from './history'
import { useReportStore } from './report'
import { UNDO_MS, useToastStore } from './toasts'

// One Undo shortcut at a time for the window, whichever toast it belongs to.
let stopKey: (() => void) | null = null

/** Whether a key press landed in a field where Cmd+Z undoes typing, not the rule. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  )
}

export const useExpectedStore = defineStore('expected', () => {
  const reports = useReportStore()
  const history = useHistoryStore()
  const toasts = useToastStore()
  const saving = ref(false)
  const error = ref<AppError | null>(null)
  async function refresh() {
    await Promise.all([history.load(), reports.loadLatest()])
  }

  function listenForUndo(run: () => void): () => void {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditable(e.target)) return
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        run()
      }
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => stop(), UNDO_MS)
    function stop() {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
    return stop
  }

  /** Takes the rule out again; the toast's action and ⌘Z both end here. */
  async function undo(id: string): Promise<boolean> {
    stopKey?.()
    stopKey = null
    try {
      const gone = await rulesRemove(id)
      await refresh()
      return gone
    } catch (e) {
      error.value = isAppError(e) ? e : null
      if (!isAppError(e)) console.error(e)
      return false
    }
  }

  function announce(rule: ExpectedRule) {
    const until = rule.until ? formatDate(`${rule.until}T00:00:00`) : null
    toasts.push({
      tone: 'ok',
      title: until ? t('expected.toast.until', { date: until }) : t('expected.toast.always'),
      action: { label: t('expected.toast.undo'), run: () => void undo(rule.id) },
      duration: UNDO_MS,
    })
    stopKey?.()
    stopKey = listenForUndo(() => void undo(rule.id))
  }

  /** Saves the rule; `null` and `error` set when Rust refused it (nothing was changed). */
  async function mark(key: CheckKey, form: ExpectedForm, level: MarkLevel) {
    saving.value = true
    error.value = null
    try {
      const rule = await rulesAdd(toDraft(key, form, level))
      await refresh()
      announce(rule)
      return rule
    } catch (e) {
      if (isAppError(e)) error.value = e
      else console.error(e)
      return null
    } finally {
      saving.value = false
    }
  }

  return { saving, error, mark, undo }
})
