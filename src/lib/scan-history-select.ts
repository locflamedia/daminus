// Which two scans the compare card shows. The list starts on the newest scan and the one
// before it; picking a row adds it, and a third pick drops the older choice.
import type { ScanSummary } from '@/api'

export function defaultSelection(scans: readonly ScanSummary[]): number[] {
  return scans.slice(-2).map((s) => s.seq)
}

export function toggleSelection(selected: readonly number[], seq: number): number[] {
  if (selected.includes(seq)) return selected.filter((s) => s !== seq)
  return selected.length >= 2 ? [selected[1] ?? seq, seq] : [...selected, seq]
}

/** The older and the newer of two picked scans; `null` until two are picked. */
export function pairOf(selected: readonly number[]): { older: number; newer: number } | null {
  const [a, b] = selected
  if (a === undefined || b === undefined) return null
  return { older: Math.min(a, b), newer: Math.max(a, b) }
}

/** Keeps the picks that are still kept scans; falls back to the default when none is left. */
export function reconcile(selected: readonly number[], scans: readonly ScanSummary[]): number[] {
  const kept = selected.filter((seq) => scans.some((s) => s.seq === seq))
  return kept.length === 2 ? kept : defaultSelection(scans)
}
