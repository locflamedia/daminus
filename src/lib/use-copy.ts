import { onBeforeUnmount, readonly, ref } from 'vue'
import { copyText } from '@/api'

export type CopyState = 'idle' | 'copied' | 'failed'

/** How long "Copied" stays before the button returns to "Copy". */
export const COPIED_MS = 1600

/**
 * Copy-to-clipboard with the three faces the canvas draws. A good write reads Copied for
 * 1.6 s, then the button goes back. A refused write reads Failed and stays until the pointer
 * (or the keyboard) comes back to the button, so nothing is silent and the person can try
 * again; the text next to it is never hidden, so it can still be selected by hand.
 */
export function useCopy() {
  const state = ref<CopyState>('idle')
  let timer: number | undefined
  let away = false

  async function copy(text: string): Promise<boolean> {
    window.clearTimeout(timer)
    let ok = true
    try {
      await copyText(text)
    } catch {
      ok = false
    }
    away = false
    state.value = ok ? 'copied' : 'failed'
    if (ok) timer = window.setTimeout(() => (state.value = 'idle'), COPIED_MS)
    return ok
  }

  /** The pointer or focus left the button: a failure may now be cleared by the next visit. */
  function leave() {
    if (state.value === 'failed') away = true
  }

  /** The pointer or focus came (back) to the button. */
  function enter() {
    if (state.value === 'failed' && away) {
      state.value = 'idle'
      away = false
    }
  }

  onBeforeUnmount(() => window.clearTimeout(timer))
  return { state: readonly(state), copy, enter, leave }
}
