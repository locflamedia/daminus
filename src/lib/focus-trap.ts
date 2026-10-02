import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Elements inside `root` that Tab can reach, in document order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true' && !el.closest('[inert]'),
  )
}

export interface FocusTrapOptions {
  /** Called when Escape is pressed inside and nothing inside has already handled it. */
  onEscape?: () => void
  /** What takes focus on open; the first focusable element when absent. */
  initialFocus?: (root: HTMLElement) => HTMLElement | null | undefined
  /** Give focus back to the element that had it before opening (default). */
  restoreFocus?: boolean
  /**
   * Where focus goes on close when nothing sensible had it before (WebKit does not focus a
   * button on click, so `activeElement` was the page body).
   */
  restoreTo?: () => HTMLElement | null | undefined
}

/**
 * Keeps Tab inside `root` while `active`, sends Escape to `onEscape`, moves focus in on open
 * and returns it on close. A control inside that handles Escape itself (a select closing its
 * list) calls `preventDefault()` first and the trap leaves that key alone.
 *
 * The trap listens on `root`, not on the document, so a press outside is never captured: a
 * drawer beside the page stays usable with the pointer.
 */
export function useFocusTrap(
  root: Ref<HTMLElement | null | undefined>,
  active: Ref<boolean>,
  options: FocusTrapOptions = {},
): void {
  let previous: HTMLElement | null = null
  let attached: HTMLElement | null = null

  function onKeydown(event: KeyboardEvent) {
    const el = attached
    if (!el) return
    if (event.key === 'Escape') {
      if (event.defaultPrevented) return
      event.preventDefault()
      options.onEscape?.()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusableIn(el)
    if (items.length === 0) {
      event.preventDefault()
      el.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const current = document.activeElement
    if (event.shiftKey && (current === first || current === el)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first?.focus()
    } else if (!el.contains(current)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first)?.focus()
    }
  }

  function release() {
    attached?.removeEventListener('keydown', onKeydown)
    // Give focus back only if it is still in the trap (or lost): a press on another control
    // outside has moved it on purpose.
    const current = document.activeElement
    const lost = !current || current === document.body || !!attached?.contains(current)
    attached = null
    if (options.restoreFocus !== false && lost) {
      const target =
        previous?.isConnected && previous !== document.body ? previous : options.restoreTo?.()
      target?.focus()
    }
    previous = null
  }

  watch(
    [root, active],
    ([el, on]) => {
      if (attached && (attached !== el || !on)) release()
      if (!on || !el || attached === el) return
      previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
      attached = el
      el.addEventListener('keydown', onKeydown)
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      const target = options.initialFocus?.(el) ?? focusableIn(el)[0] ?? el
      // After the next render: a floating box is hidden until it is placed, and a hidden
      // element cannot take focus.
      void nextTick(() => {
        if (attached === el) target.focus()
      })
    },
    { flush: 'post', immediate: true },
  )

  onBeforeUnmount(release)
}
