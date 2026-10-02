// The sample series the gallery draws, taken from the values printed on the boards, so each
// chart can be put next to its board. None of it is real data and none of it ships.
import type { HeatState } from '@/ui/UiHeatmap.vue'
import type { StripState } from '@/ui/UiHeatStrip.vue'

/** Database size over 14 scans (board "Charts"). */
export const DB_SIZE = [
  6.71, 6.78, 6.84, 6.9, 6.95, 6.98, 7.06, 7.13, 7.19, 7.24, 7.28, 7.33, 7.36, 8.43,
]

/** Days since 13 Sep of each scan: two scans share a day. */
export const DB_DAYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10, 11, 12]

/** The number of the first scan drawn; the hovered scan on the board is #37. */
export const DB_FIRST_SCAN = 27

/** The scan number under the first bar of the duration chart; the last is #42. */
export const SCAN_FIRST = 29
/** The compact history chart of the Data display board: nine scans, the last one past the threshold. */
export const DB_COMPACT = [6.98, 7.06, 7.13, 7.19, 7.24, 7.28, 7.33, 7.36, 8.43]

export const SCAN_DURATION = [2.9, 3.1, 2.7, 3.4, 2.6, 2.8, 3.0, 2.4, 2.5, 2.3, 2.6, 2.4, 3.0, 2.2]

export const MEMORY_ONE = [62, 64, 63, 66, 68, 67, 70, 72, 71, 74, 76, 75, 79, 81]
export const MEMORY_TWO = [44, 46, 45, 47, 45, 44, 46, 48, 47, 46, 45, 47, 46, 47]

export interface SparkSample {
  id: string
  values: number[]
  value: string
  tone: 'accent' | 'warn' | 'stale'
  delta: 'flat' | 'warn' | 'ok'
}

export const SPARKS: SparkSample[] = [
  {
    id: 'latency',
    values: [150, 146, 152, 149, 147, 151, 148, 146, 148],
    value: '148',
    tone: 'accent',
    delta: 'flat',
  },
  {
    id: 'database',
    values: [7.19, 7.24, 7.28, 7.3, 7.33, 7.34, 7.36, 7.4, 8.43],
    value: '8.43',
    tone: 'warn',
    delta: 'warn',
  },
  {
    id: 'files',
    values: [1.1, 1.12, 1.15, 1.16, 1.19, 1.2, 1.22, 1.23, 1.24],
    value: '1.24',
    tone: 'stale',
    delta: 'warn',
  },
  {
    id: 'memory',
    values: [70, 72, 71, 74, 76, 75, 79, 80, 81],
    value: '81',
    tone: 'warn',
    delta: 'warn',
  },
  {
    id: 'ssl',
    values: [71, 67, 63, 59, 55, 51, 47, 44, 41],
    value: '41',
    tone: 'accent',
    delta: 'flat',
  },
  {
    id: 'logs',
    values: [700, 760, 810, 830, 850, 852, 212, 214, 212],
    value: '212',
    tone: 'accent',
    delta: 'ok',
  },
]

/** Scan history strips, one letter a scan: h healthy, w warning, c critical, u unreachable. */
export const STRIPS: { name: string; pattern: string }[] = [
  { name: 'tiemtra-web', pattern: 'hhhhhhhhhhhhhhhhhhhhhhhhhhhhcc' },
  { name: 'kho-hang', pattern: 'hhhhhhhhhhhhhhhhhwwhhhhhhhhhww' },
  { name: 'api-booking', pattern: 'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh' },
  { name: 'noibo-crm', pattern: 'hhhhhhhhhhhhhhhhhhhhhhhhhuuuuu' },
]

export const STRIP_STATE: Record<string, StripState> = { h: 'ok', w: 'warn', c: 'crit', u: 'none' }

/** The history heatmap: five check groups over twelve scans (o ok, w warn, c crit, n not run). */
export const HEAT_ROWS: {
  id: string
  icon: 'uptime' | 'pulse' | 'database' | 'container' | 'shield'
  pattern: string
}[] = [
  { id: 'uptime', icon: 'uptime', pattern: 'oooooooooooo' },
  { id: 'response', icon: 'pulse', pattern: 'oooooooowcwo' },
  { id: 'disk', icon: 'database', pattern: 'ooooooooowww' },
  { id: 'containers', icon: 'container', pattern: 'ooooooooowww' },
  { id: 'security', icon: 'shield', pattern: 'nnnooooooooo' },
]

export const HEAT_STATE: Record<string, HeatState> = {
  o: 'ok',
  w: 'warn',
  c: 'crit',
  n: 'none',
  e: 'expected',
}

/** Issues per scan (board "Scan history"): critical, warning, info of scans #1 to #12. */
/** The day of September each of those twelve scans ran, as the Scan history list gives it. */
export const ISSUE_DAYS = [15, 16, 17, 17, 18, 19, 20, 21, 22, 24, 25, 26]

export const ISSUES: { crit: number; warn: number; info: number }[] = [
  { crit: 0, warn: 2, info: 1 },
  { crit: 0, warn: 2, info: 1 },
  { crit: 0, warn: 3, info: 1 },
  { crit: 0, warn: 3, info: 0 },
  { crit: 1, warn: 3, info: 0 },
  { crit: 1, warn: 2, info: 1 },
  { crit: 1, warn: 2, info: 1 },
  { crit: 2, warn: 2, info: 1 },
  { crit: 2, warn: 3, info: 1 },
  { crit: 2, warn: 4, info: 1 },
  { crit: 2, warn: 3, info: 1 },
  { crit: 2, warn: 4, info: 0 },
]
