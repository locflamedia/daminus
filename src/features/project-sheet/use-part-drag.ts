// Moving a part by hand: a pointer drag on its grip, or the keys on the grip (Space picks it
// up, arrows move it, Space or Escape puts it down; Alt with an arrow moves it at once).
// The row order is changed live while dragging, so the rows make room as the pointer passes.
import { nextTick, ref, type Ref } from 'vue'
import { dropIndex } from '@/lib/sheet-reorder'

export function usePartDrag(
  list: Ref<HTMLElement | null | undefined>,
  keys: () => string[],
  reorder: (from: number, to: number) => void,
) {
  const dragging = ref<string | null>(null)
  const grabbed = ref<string | null>(null)

  const listEl = () => list.value?.querySelector<HTMLElement>('[data-parts-list]')

  /** Vertical middles of the rows, from their layout (a row mid-animation still counts). */
  function middles(): number[] {
    const rows = [...(listEl()?.querySelectorAll<HTMLElement>(':scope > [data-part]') ?? [])]
    return rows.map((row) => row.offsetTop + row.offsetHeight / 2)
  }

  function onPointerDown(event: PointerEvent, key: string) {
    if (event.button !== 0) return
    // Not text selection, and no focus change: the row moves under the pointer.
    event.preventDefault()
    dragging.value = key
    const top = () => listEl()?.getBoundingClientRect().top ?? 0
    // On the document, not the grip: a row that moves is re-inserted and would lose a capture.
    const move = (e: PointerEvent) => {
      const from = keys().indexOf(key)
      const to = dropIndex(middles(), e.clientY - top())
      if (from !== -1 && to !== from) reorder(from, to)
    }
    const stop = () => {
      dragging.value = null
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', stop)
      document.removeEventListener('pointercancel', stop)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop)
    document.addEventListener('pointercancel', stop)
  }

  function refocus(key: string) {
    void nextTick(() => document.querySelector<HTMLElement>(`[data-handle="${key}"]`)?.focus())
  }

  function onKeydown(event: KeyboardEvent, key: string) {
    const at = keys().indexOf(key)
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      grabbed.value = grabbed.value === key ? null : key
      return
    }
    if (event.key === 'Escape' && grabbed.value === key) {
      event.preventDefault()
      grabbed.value = null
      return
    }
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (step === 0 || (grabbed.value !== key && !event.altKey)) return
    event.preventDefault()
    const to = at + step
    if (to < 0 || to >= keys().length) return
    reorder(at, to)
    refocus(key)
  }

  /** Focus going to another control puts the part down; a part re-inserted by the move keeps it. */
  function onBlur(event: FocusEvent) {
    if (event.relatedTarget) grabbed.value = null
  }

  return { dragging, grabbed, onPointerDown, onKeydown, onBlur }
}
