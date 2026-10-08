// What Settings › Data shows, worked out from the folder's numbers: the parts of the bar, the
// curve of size over scans, the typical size of a scan and where the folder levels off.
import type { DataUsage } from '@/api'

export type PartId = 'scans' | 'ai' | 'logs'

/** The bytes of the three parts the bar draws; the small config files count in the total. */
export interface Parts {
  scans: number
  ai: number
  logs: number
}

/** AI replies are not kept on disk yet, so their part is empty until the app stores them. */
export function partsOf(usage: DataUsage): Parts {
  return { scans: usage.scans_bytes, ai: 0, logs: usage.logs_bytes }
}

export function totalBytes(usage: DataUsage): number {
  return usage.scans_bytes + usage.config_bytes + usage.logs_bytes
}

/** The average size of a kept scan; 0 with none. */
export function bytesPerScan(usage: DataUsage): number {
  return usage.scans === 0 ? 0 : usage.scans_bytes / usage.scans
}

/**
 * Where the folder stops growing once `keep` scans are kept; `null` when every scan is kept
 * (it never does) or there is nothing to average yet.
 */
export function levelOff(usage: DataUsage, keep: number | null): number | null {
  const each = bytesPerScan(usage)
  if (keep === null || each === 0) return null
  return Math.round(each * keep + usage.config_bytes + usage.logs_bytes)
}

/** The folder's size after each scan, oldest first: the curve the card draws. */
export function growth(sizes: readonly number[]): number[] {
  let sum = 0
  return sizes.map((size) => (sum += size))
}

/** The biggest of the parts the bar draws, for the "Largest part" tile. */
export function largestPart(usage: DataUsage): { id: PartId; bytes: number } {
  const parts = partsOf(usage)
  const ids: PartId[] = ['scans', 'ai', 'logs']
  return ids
    .map((id) => ({ id, bytes: parts[id] }))
    .reduce((best, next) => (next.bytes > best.bytes ? next : best))
}

/** The retention choices of the board: how many scans, and how long AI replies stay. */
export const KEEP_CHOICES = [10, 20, 50] as const
export const FORGET_CHOICES = [7, 30] as const

/** The segment value of a limit: its number, or `all` for no limit. */
export function choiceValue(limit: number | null): string {
  return limit === null ? 'all' : String(limit)
}

/** The limit a segment stands for. */
export function choiceLimit(value: string): number | null {
  const n = Number(value)
  return value === 'all' || !Number.isInteger(n) ? null : n
}
