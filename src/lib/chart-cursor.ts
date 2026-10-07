// The keyboard form of a chart that has a cursor: left and right step the focused point, Home
// and End jump to the first and last, Escape dismisses the card. Pure, so every chart (the
// history line, the bar chart, the issue columns) moves the same way and the keys are tested
// without a DOM.

export interface CursorStep {
  /** The point the cursor lands on, or null when the card closes. */
  next: number | null
  /** Whether the key was a cursor key at all, so the caller can stop the browser's own use of it. */
  handled: boolean
}

/**
 * Where the cursor goes for `key`, given `at` (null while nothing is focused) over `count`
 * points. The first arrow press lands on the newest point, which is where a reader starts.
 */
export function stepCursor(key: string, at: number | null, count: number): CursorStep {
  const none: CursorStep = { next: at, handled: false }
  if (count <= 0) return none
  const last = count - 1
  switch (key) {
    case 'ArrowLeft':
      return { next: at === null ? last : Math.max(0, at - 1), handled: true }
    case 'ArrowRight':
      return { next: at === null ? last : Math.min(last, at + 1), handled: true }
    case 'Home':
      return { next: 0, handled: true }
    case 'End':
      return { next: last, handled: true }
    // Escape only counts while a card is open, so it still reaches a dialog around the chart.
    case 'Escape':
      return at === null ? none : { next: null, handled: true }
    default:
      return none
  }
}

/** True when the browser would show a focus ring for the focused element (keyboard focus). */
export function focusedByKeyboard(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return false
  }
}
