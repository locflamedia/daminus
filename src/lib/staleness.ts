// How old the saved results are. Under a day they are read as current (a grey age in the
// toolbar); over a day they are old: the toolbar says so in amber, the sidebar reads
// "4 d old" and stops colouring anything by severity until the next scan.
const DAY_MS = 86_400_000

export const STALE_AFTER_MS = DAY_MS

/** Whole days since the scan, never below 1; `null` when there is no saved scan or it is not old. */
export function staleDays(scannedAt: string | null | undefined, now: number): number | null {
  if (!scannedAt) return null
  const then = Date.parse(scannedAt)
  if (Number.isNaN(then)) return null
  const age = now - then
  return age >= STALE_AFTER_MS ? Math.max(1, Math.floor(age / DAY_MS)) : null
}
