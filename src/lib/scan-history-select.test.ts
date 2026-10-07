import { describe, expect, it } from 'vitest'
import type { ScanSummary } from '@/api'
import { defaultSelection, pairOf, reconcile, toggleSelection } from './scan-history-select'

const scans = [1, 2, 3].map((seq) => ({ seq }) as ScanSummary)

describe('selection of two scans', () => {
  it('starts on the newest scan and the one before it', () => {
    expect(defaultSelection(scans)).toEqual([2, 3])
    expect(defaultSelection(scans.slice(0, 1))).toEqual([1])
    expect(defaultSelection([])).toEqual([])
  })

  it('adds a pick, takes a picked row back, and drops the older choice at the third', () => {
    expect(toggleSelection([], 5)).toEqual([5])
    expect(toggleSelection([2, 3], 3)).toEqual([2])
    expect(toggleSelection([2, 3], 1)).toEqual([3, 1])
  })

  it('compares the older with the newer whatever order they were picked in', () => {
    expect(pairOf([3, 1])).toEqual({ older: 1, newer: 3 })
    expect(pairOf([3])).toBeNull()
  })

  it('forgets scans that are no longer kept', () => {
    expect(reconcile([1, 3], scans)).toEqual([1, 3])
    expect(reconcile([1, 9], scans)).toEqual([2, 3])
  })
})
