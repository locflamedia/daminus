// Arrow-key movement over a grid of focusable cells (a scan strip is a grid of one row, the
// heatmap one of several). Only one cell is a tab stop at a time, the one last focused, so a
// chart of a hundred cells is a single stop and the arrows walk the cells in reading order.

export interface Cell {
  row: number
  col: number
}

/**
 * The cell `key` moves to from `at` in a grid of `rows` by `cols`, or null when the key is not
 * a movement key or there is nowhere to go (the edge stays put). Home and End go to the start
 * and end of the row; Control with them goes to the first and last cell of the grid.
 */
export function moveInGrid(
  key: string,
  at: Cell,
  rows: number,
  cols: number,
  ctrl = false,
): Cell | null {
  if (rows <= 0 || cols <= 0) return null
  const last = { row: rows - 1, col: cols - 1 }
  switch (key) {
    case 'ArrowLeft':
      return at.col > 0 ? { row: at.row, col: at.col - 1 } : null
    case 'ArrowRight':
      return at.col < last.col ? { row: at.row, col: at.col + 1 } : null
    case 'ArrowUp':
      return at.row > 0 ? { row: at.row - 1, col: at.col } : null
    case 'ArrowDown':
      return at.row < last.row ? { row: at.row + 1, col: at.col } : null
    case 'Home':
      return ctrl ? { row: 0, col: 0 } : { row: at.row, col: 0 }
    case 'End':
      return ctrl ? last : { row: at.row, col: last.col }
    default:
      return null
  }
}
