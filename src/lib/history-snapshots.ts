// The "Snapshots" card of the sidebar on a project's History tab: how many scans are kept out
// of the retention limit, what they weigh on disk, and a bar of one cell per kept slot. Drawn
// from `HistoryView` alone, so history never grows silently.
import type { HistoryView } from '@/api'

/** The most cells the bar draws; a larger limit scales down to it. */
export const SNAPSHOT_CELLS = 20

export interface SnapshotsCard {
  kept: number
  /** The retention limit, `null` when every scan is kept. */
  keep: number | null
  bytes: number
  /** Cells drawn solid and cells in all; 0 cells when there is no limit to measure against. */
  on: number
  cells: number
}

export function snapshotsCard(view: HistoryView | null): SnapshotsCard | null {
  if (!view) return null
  const kept = view.scans.length
  const keep = view.keep ?? null
  const bytes = Number(view.bytes)
  if (keep === null || keep <= 0) return { kept, keep: null, bytes, on: 0, cells: 0 }
  const cells = Math.min(keep, SNAPSHOT_CELLS)
  const on = kept === 0 ? 0 : Math.min(cells, Math.max(1, Math.round((kept / keep) * cells)))
  return { kept, keep, bytes, on, cells }
}
