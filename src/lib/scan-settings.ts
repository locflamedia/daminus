// Settings › Scan as plain functions: which groups the board lists, the choices of each
// control, and the threshold overrides read and written the way the core applies them
// (`SeverityRule::with_overrides`). Nothing here touches the store or the webview.
import type { CheckGroup, ScanSettings, ThresholdOverride } from '@/api'
import { checkManifest } from '@/lib/check-manifest'

/** The six groups of the board, top to bottom. `system` is always on and is not listed. */
export const SCAN_GROUPS = [
  'disk',
  'containers',
  'databases',
  'security',
  'uptime',
  'code_changes',
] as const satisfies readonly CheckGroup[]
export type ScanGroup = (typeof SCAN_GROUPS)[number]

export const FILE_FLOORS_MB = [10, 50, 200] as const
export const CONNECT_TIMEOUTS_S = [5, 10, 30] as const
/** `null` is Auto: every host together, up to eight. */
export const HOSTS_AT_ONCE = [null, 1, 2, 4] as const
export const MEMORY_STEPS = [80, 90, 95] as const
export const CERT_STEPS_DAYS = [7, 14, 30] as const
export const RESTART_STEPS = [1, 2, 5] as const

/** The range of the disk slider, in percent. */
export const DISK_RANGE = { min: 50, max: 100 } as const

const MAX_SKIP_PATHS = 64
const MAX_SKIP_PATH_CHARS = 200

export function groupsOn(scan: ScanSettings): number {
  return SCAN_GROUPS.filter((g) => !scan.disabled_groups.includes(g)).length
}

export function withGroup(scan: ScanSettings, group: ScanGroup, on: boolean): ScanSettings {
  const rest = scan.disabled_groups.filter((g) => g !== group)
  return { ...scan, disabled_groups: on ? rest : [...rest, group] }
}

export type SkipPathProblem = 'empty' | 'duplicate' | 'invalid'

/** The path as it will be saved, or why it cannot be: the rule the core checks again. */
export function checkSkipPath(
  raw: string,
  existing: readonly string[],
): { ok: true; path: string } | { ok: false; problem: SkipPathProblem } {
  const path = raw.trim()
  if (path === '') return { ok: false, problem: 'empty' }
  const bad =
    path.length > MAX_SKIP_PATH_CHARS ||
    path.startsWith('-') ||
    /[\u0000-\u001f\u007f-\u009f]/.test(path) ||
    existing.length >= MAX_SKIP_PATHS
  if (bad) return { ok: false, problem: 'invalid' }
  if (existing.includes(path)) return { ok: false, problem: 'duplicate' }
  return { ok: true, path }
}

// --- thresholds ------------------------------------------------------------------------------

export const DISK_CHECK = 'disk.fs'
export const MEMORY_CHECK = 'docker.compose'
export const MEMORY_FIELD = 'data.mem_pct'
export const RESTART_FIELD = 'data.restarts'
export const CERT_CHECK = 'url.tls'
export const PM2_CHECK = 'pm2.app'

interface Rule {
  type: string
  field?: string
  warn?: number
  crit?: number
  min?: number
  rules?: Rule[]
}

function ruleOf(check: string): Rule | null {
  const found = checkManifest.checks.find((c) => c.id === check)
  return found ? (found.rule as unknown as Rule) : null
}

function leaf(check: string, field?: string): Rule | null {
  const rule = ruleOf(check)
  if (!rule) return null
  if (rule.type !== 'max_of') return rule
  return rule.rules?.find((r) => r.field === field) ?? null
}

function same(o: ThresholdOverride, check: string, field: string | null): boolean {
  return o.check === check && (o.field ?? null) === field
}

function find(list: readonly ThresholdOverride[], check: string, field: string | null) {
  // The last one wins, as the core applies them in order.
  return [...list].reverse().find((o) => same(o, check, field))
}

/** Puts `next` in the place of an override of the same check and field. */
export function withOverride(
  list: readonly ThresholdOverride[],
  next: ThresholdOverride,
): ThresholdOverride[] {
  const field = next.field ?? null
  const rest = list.filter((o) => !same(o, next.check, field))
  return [...rest, next]
}

export interface DiskBand {
  warn: number
  crit: number
}

/** Where disk turns amber and red: the user's values, else the manifest's. */
export function diskBand(list: readonly ThresholdOverride[]): DiskBand {
  const base = leaf(DISK_CHECK, 'data.pct')
  const own = find(list, DISK_CHECK, null)
  return { warn: own?.warn ?? base?.warn ?? 80, crit: own?.crit ?? base?.crit ?? 90 }
}

export function withDiskBand(list: readonly ThresholdOverride[], band: DiskBand) {
  return withOverride(list, { check: DISK_CHECK, warn: band.warn, crit: band.crit })
}

/** The warn line of container memory, in percent. */
export function memoryStep(list: readonly ThresholdOverride[]): number {
  const own = find(list, MEMORY_CHECK, MEMORY_FIELD)
  return own?.warn ?? leaf(MEMORY_CHECK, MEMORY_FIELD)?.warn ?? 90
}

export function withMemory(list: readonly ThresholdOverride[], percent: number) {
  return withOverride(list, { check: MEMORY_CHECK, field: MEMORY_FIELD, warn: percent })
}

/** Days before expiry at which a certificate turns amber. */
export function certDays(list: readonly ThresholdOverride[]): number {
  const own = find(list, CERT_CHECK, null)
  return own?.warn ?? ruleOf(CERT_CHECK)?.warn ?? 14
}

export function withCertDays(list: readonly ThresholdOverride[], days: number) {
  return withOverride(list, { check: CERT_CHECK, warn: days })
}

/** Restarts between two scans that make a process or container worth a look. */
export function restartStep(list: readonly ThresholdOverride[]): number {
  const own = find(list, PM2_CHECK, RESTART_FIELD)
  return own?.min ?? leaf(PM2_CHECK, RESTART_FIELD)?.min ?? 2
}

/** pm2 counts restarts since the last scan (`min`); Docker counts them above `warn`. */
export function withRestarts(list: readonly ThresholdOverride[], count: number) {
  const pm2 = withOverride(list, { check: PM2_CHECK, field: RESTART_FIELD, min: count })
  return withOverride(pm2, { check: MEMORY_CHECK, field: RESTART_FIELD, warn: count - 1 })
}
