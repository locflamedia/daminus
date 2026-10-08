// Settings › Scan: what a scan reads, how long it waits and when a number turns amber or red.
// Every choice applies at once: it is sent to the core (`settings_set_scan` checks the whole
// file again) and the latest report is evaluated again, so a threshold moves the results without
// a new scan. Saves go one after the other, so the file ends as the last choice left it.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type AppError, type ScanSettings, settingsGet, settingsSetScan } from '@/api'
import { currentLocale, t } from '@/i18n'
import { errorText } from '@/lib/issue-text'
import {
  type DiskBand,
  type ScanGroup,
  type SkipPathProblem,
  checkSkipPath,
  withCertDays,
  withDiskBand,
  withGroup,
  withMemory,
  withRestarts,
} from '@/lib/scan-settings'
import { useReportStore } from './report'
import { useToastStore } from './toasts'

/** How long the "Saved" tick stays by the title. */
export const SAVED_MS = 1200

const DEFAULT_SCAN: ScanSettings = {
  disabled_groups: ['code_changes'],
  skip_paths: [
    'node_modules',
    'vendor',
    'storage/framework/cache',
    '.next/cache',
    '/proc',
    '/var/lib/docker/overlay2',
  ],
  large_file_mb: 50,
  connect_timeout_s: 10,
  hosts_at_once: null,
  thresholds: [],
}

/** A copy with no reactive wrappers, which `structuredClone` cannot copy. */
function plain(value: ScanSettings): ScanSettings {
  return JSON.parse(JSON.stringify(value)) as ScanSettings
}

export const useScanSettingsStore = defineStore('scanSettings', () => {
  const scan = ref<ScanSettings>({ ...DEFAULT_SCAN })
  /** The core has answered: until then nothing is sent. */
  const synced = ref(false)
  const saved = ref(false)
  let savedTimer: number | undefined
  let queue: Promise<unknown> = Promise.resolve()
  /** Saves sent and not yet answered: only the last answer is shown, so a click is never undone. */
  let pending = 0

  function adopt(next: ScanSettings) {
    scan.value = plain(next)
  }

  async function load() {
    try {
      adopt((await settingsGet()).scan)
      synced.value = true
    } catch {
      // The defaults stay on screen; nothing is sent until a read succeeds.
    }
  }

  function flashSaved() {
    saved.value = true
    window.clearTimeout(savedTimer)
    savedTimer = window.setTimeout(() => (saved.value = false), SAVED_MS)
  }

  function failureText(error: unknown): string {
    const known = typeof error === 'object' && error !== null && 'code' in error
    return known ? errorText(error as AppError, currentLocale()) : t('settingsScan.saveFailed')
  }

  /** Shows `next` now and sends it after the saves before it. */
  function change(next: ScanSettings) {
    scan.value = next
    if (!synced.value) return
    const send = plain(next)
    pending += 1
    queue = queue
      .then(async () => {
        const answer = (await settingsSetScan(send)).scan
        pending -= 1
        if (pending === 0) adopt(answer)
        flashSaved()
        await useReportStore().loadLatest()
      })
      .catch(async (error: unknown) => {
        pending = Math.max(0, pending - 1)
        useToastStore().push({ tone: 'crit', title: failureText(error) })
        if (pending === 0) await load()
      })
  }

  function setGroup(group: ScanGroup, on: boolean) {
    change(withGroup(scan.value, group, on))
  }

  /** Adds a path to skip; says why when it cannot. */
  function addSkipPath(raw: string): SkipPathProblem | null {
    const checked = checkSkipPath(raw, scan.value.skip_paths)
    if (!checked.ok) return checked.problem
    change({ ...scan.value, skip_paths: [...scan.value.skip_paths, checked.path] })
    return null
  }

  function removeSkipPath(path: string) {
    change({ ...scan.value, skip_paths: scan.value.skip_paths.filter((p) => p !== path) })
  }

  function setLargeFile(mb: number) {
    change({ ...scan.value, large_file_mb: mb })
  }

  function setConnectTimeout(seconds: number) {
    change({ ...scan.value, connect_timeout_s: seconds })
  }

  function setHostsAtOnce(count: number | null) {
    change({ ...scan.value, hosts_at_once: count })
  }

  function setDisk(band: DiskBand) {
    change({ ...scan.value, thresholds: withDiskBand(scan.value.thresholds, band) })
  }

  function setMemory(percent: number) {
    change({ ...scan.value, thresholds: withMemory(scan.value.thresholds, percent) })
  }

  function setCertDays(days: number) {
    change({ ...scan.value, thresholds: withCertDays(scan.value.thresholds, days) })
  }

  function setRestarts(count: number) {
    change({ ...scan.value, thresholds: withRestarts(scan.value.thresholds, count) })
  }

  return {
    scan,
    synced,
    saved,
    load,
    setGroup,
    addSkipPath,
    removeSkipPath,
    setLargeFile,
    setConnectTimeout,
    setHostsAtOnce,
    setDisk,
    setMemory,
    setCertDays,
    setRestarts,
  }
})
