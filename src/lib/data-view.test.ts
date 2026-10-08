import { describe, expect, it } from 'vitest'
import type { DataUsage } from '@/api'
import {
  bytesPerScan,
  choiceLimit,
  choiceValue,
  growth,
  largestPart,
  levelOff,
  partsOf,
  totalBytes,
} from './data-view'

const usage: DataUsage = {
  path: '~/x',
  files: 5,
  scans: 2,
  scans_bytes: 2_000,
  config_bytes: 100,
  logs_bytes: 300,
  scan_sizes: [800, 1_200],
}

describe('data view', () => {
  it('counts the config files in the total but draws only three parts', () => {
    expect(totalBytes(usage)).toBe(2_400)
    expect(partsOf(usage)).toEqual({ scans: 2_000, ai: 0, logs: 300 })
  })

  it('averages a scan and says where the folder levels off at a limit', () => {
    expect(bytesPerScan(usage)).toBe(1_000)
    expect(levelOff(usage, 20)).toBe(20_400)
    expect(levelOff(usage, null)).toBeNull()
    expect(levelOff({ ...usage, scans: 0, scans_bytes: 0 }, 20)).toBeNull()
  })

  it('adds the scans up for the curve', () => {
    expect(growth([800, 1_200])).toEqual([800, 2_000])
    expect(growth([])).toEqual([])
  })

  it('names the biggest part', () => {
    expect(largestPart(usage)).toEqual({ id: 'scans', bytes: 2_000 })
    expect(largestPart({ ...usage, scans_bytes: 0 }).id).toBe('logs')
  })

  it('turns a limit into a segment and back, with no limit as "all"', () => {
    expect(choiceValue(20)).toBe('20')
    expect(choiceValue(null)).toBe('all')
    expect(choiceLimit('50')).toBe(50)
    expect(choiceLimit('all')).toBeNull()
  })
})
