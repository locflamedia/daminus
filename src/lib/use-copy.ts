import { onBeforeUnmount, readonly, ref } from 'vue'
import { copyText } from '@/api'

export type CopyState = 'idle' | 'copied' | 'failed'

/** How long "Copied" stays before the button returns to "Copy". */
export const COPIED_MS = 1500

/**
 * Copy-to-clipboard with the two states the canvas draws: the button says Copied for 1.5 s,
 * then goes back. A refused write shows `failed` for the same time, so nothing is silent.
 */
export function useCopy() {
  const state = ref<CopyState>('idle')
  let timer: number | undefined

  async function copy(text: string): Promise<boolean> {
    window.clearTimeout(timer)
    let ok = true
    try {
      await copyText(text)
    } catch {
      ok = false
    }
    state.value = ok ? 'copied' : 'failed'
    timer = window.setTimeout(() => (state.value = 'idle'), COPIED_MS)
    return ok
  }

  onBeforeUnmount(() => window.clearTimeout(timer))
  return { state: readonly(state), copy }
}
