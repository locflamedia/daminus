// A theme or language switch cross-fades the whole window in 200 ms. The View Transitions
// API snapshots the window where it exists; elsewhere colours transition for the length of
// the switch (styles/base.css). Reduce Motion switches instantly.
import { nextTick } from 'vue'
import { prefersReducedMotion } from './motion'

const FADE_MS = 200

interface ViewTransitionDocument {
  startViewTransition?: (update: () => Promise<void> | void) => unknown
}

export function crossFade(update: () => void): void {
  if (prefersReducedMotion()) {
    update()
    return
  }
  const doc = document as Document & ViewTransitionDocument
  if (doc.startViewTransition) {
    doc.startViewTransition(async () => {
      update()
      await nextTick()
    })
    return
  }
  const root = document.documentElement
  root.classList.add('cross-fading')
  update()
  window.setTimeout(() => root.classList.remove('cross-fading'), FADE_MS + 40)
}
