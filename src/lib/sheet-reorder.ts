// Reordering a list of parts: the same moves for the pointer drag, the keys and the row menu.

/** A copy of `list` with the item at `from` moved to index `to` (both clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list]
  const target = Math.min(Math.max(to, 0), list.length - 1)
  const out = [...list]
  const [item] = out.splice(from, 1)
  out.splice(target, 0, item as T)
  return out
}

/** Moves one place up (`-1`) or down (`1`); the list is unchanged at its ends. */
export function moveBy<T>(list: readonly T[], index: number, step: -1 | 1): T[] {
  return moveItem(list, index, index + step)
}

/** Whether `index` can move by `step` inside a list of `length`. */
export function canMove(length: number, index: number, step: -1 | 1): boolean {
  const to = index + step
  return index >= 0 && index < length && to >= 0 && to < length
}

/**
 * The index a dragged row should take when the pointer is at `y`: the row whose middle is the
 * first one below the pointer. `middles` are the rows' vertical centres, top to bottom.
 */
export function dropIndex(middles: readonly number[], y: number): number {
  const at = middles.findIndex((mid) => y < mid)
  return at === -1 ? Math.max(middles.length - 1, 0) : at
}
