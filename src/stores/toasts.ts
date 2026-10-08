import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastTone = 'ok' | 'neutral' | 'crit'

export interface ToastAction {
  label: string
  /** The keyboard shortcut for the action, shown beside the label (a platform glyph). */
  hint?: string
  /** Runs when the action is pressed; the toast closes after it. */
  run: () => void
}

export interface ToastInput {
  tone?: ToastTone
  title: string
  detail?: string
  action?: ToastAction
  /** Milliseconds before it hides itself; 5 s by default. 0 keeps it until dismissed. */
  duration?: number
}

export interface Toast extends Required<Pick<ToastInput, 'tone' | 'title' | 'duration'>> {
  id: number
  detail?: string
  action?: ToastAction
}

/** The default auto-hide of a toast, from the board "Feedback". */
export const TOAST_MS = 5000

/** A removed project offers Undo for 8 s (board "Project sheet"). */
export const UNDO_MS = 8000

/**
 * Toasts are only for what finishes in the background or confirms an invisible action (a
 * copy). Anything that needs a decision is shown inline, where it can wait.
 */
export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([])
  let next = 1

  function push(input: ToastInput): number {
    const id = next++
    toasts.value.push({
      id,
      tone: input.tone ?? 'neutral',
      title: input.title,
      detail: input.detail,
      action: input.action,
      duration: input.duration ?? TOAST_MS,
    })
    return id
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function clear(): void {
    toasts.value = []
  }

  return { toasts, push, dismiss, clear }
})
