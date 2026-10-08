import { describe, expect, it } from 'vitest'
import type { HistoryView, ScanSummary } from '@/api'
import { snapshotsCard } from './history-snapshots'

function view(kept: number, keep: number | null, bytes = 184_000): HistoryView {
  return {
    scans: Array.from({ length: kept }, (_, i) => ({ seq: i + 1 }) as unknown as ScanSummary),
    keep,
    bytes: BigInt(bytes),
  }
}

describe('snapshots card', () => {
  it('draws one solid cell per kept scan out of the limit', () => {
    expect(snapshotsCard(view(12, 20))).toMatchObject({ kept: 12, keep: 20, on: 12, cells: 20 })
  })

  it('scales a long retention limit down to twenty cells', () => {
    expect(snapshotsCard(view(50, 100))).toMatchObject({ on: 10, cells: 20 })
    expect(snapshotsCard(view(1, 500))).toMatchObject({ on: 1, cells: 20 })
  })

  it('draws no bar when every scan is kept', () => {
    expect(snapshotsCard(view(7, null))).toMatchObject({ keep: null, cells: 0, on: 0 })
  })

  it('has nothing to say before the scans are read', () => {
    expect(snapshotsCard(null)).toBeNull()
  })
})
