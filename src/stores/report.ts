// The latest evaluated report, and the reports already read, kept by scan number. A report
// is `evaluate` over saved scans, so one for scan N never changes; the cache lets screens
// that compare with an older scan ("vs #11") reuse it instead of asking Rust again.
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { type AppError, type Report, isAppError, reportLatest } from '@/api'

const KEEP = 24

export const useReportStore = defineStore('report', () => {
  const latest = shallowRef<Report | null>(null)
  const error = ref<AppError | null>(null)
  const bySeq = new Map<number, Report>()

  function remember(report: Report) {
    if (report.seq == null) return
    bySeq.delete(report.seq)
    bySeq.set(report.seq, report)
    while (bySeq.size > KEEP) {
      const oldest = bySeq.keys().next().value
      if (oldest === undefined) break
      bySeq.delete(oldest)
    }
  }

  /** A report read earlier for scan `seq`, if it is still cached. */
  function cached(seq: number): Report | undefined {
    return bySeq.get(seq)
  }

  let requests = 0

  /**
   * Reads the latest report from Rust; on failure the last good one stays. When reads overlap
   * (the first load at start-up and the one a finished scan asks for) only the one started
   * last may set `latest`, so a slow older answer cannot replace a newer report.
   */
  async function loadLatest() {
    const mine = ++requests
    try {
      const report = await reportLatest()
      remember(report)
      if (mine !== requests) return
      latest.value = report
      error.value = null
    } catch (e) {
      if (mine !== requests) return
      if (isAppError(e)) error.value = e
      else console.error(e)
    }
  }

  return { latest, error, cached, remember, loadLatest }
})
