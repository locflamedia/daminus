// Whether the scan panel is open, and what it shows once the scan it followed has ended. The
// run itself lives in the scan store; this keeps a copy of the last run so the panel can still
// list how each host fared (and offer a retry of the ones that failed) after the scan is over.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import type { ScanRun, ScanScope } from '@/api'
import { scanHosts } from '@/lib/overview-scan'
import { useScanStore, type ScanEnd } from './scan'

export const useScanPanelStore = defineStore('scan-panel', () => {
  const scan = useScanStore()
  const open = ref(false)
  /** The run as it stood when it ended; `null` while a scan runs or none ran. */
  const finished = shallowRef<ScanRun | null>(null)
  const endedAt = ref<number | null>(null)
  const end = ref<ScanEnd | null>(null)

  /** What the panel lists: the live run, else the one that just ended. */
  const run = computed(() => scan.run ?? finished.value)
  const failedHosts = computed(() =>
    scanHosts(finished.value)
      .filter((h) => h.chip === 'failed')
      .map((h) => h.host),
  )

  function show() {
    open.value = true
  }

  /** "Keep in background": the panel goes away, the scan keeps running. */
  function close() {
    open.value = false
  }

  /** ⌘B: tuck the panel away while it is open, bring it back while a scan runs. */
  function toggle() {
    if (open.value) close()
    else if (scan.scanning || finished.value) show()
  }

  /** Starts a scan and shows the panel; a retry of one host passes its scope. */
  async function start(scope?: ScanScope) {
    finished.value = null
    endedAt.value = null
    end.value = null
    open.value = true
    await scan.start(scope)
  }

  watch(
    () => scan.run,
    (now, before) => {
      if (now) {
        finished.value = null
        endedAt.value = null
        end.value = null
        return
      }
      if (!before) return
      finished.value = JSON.parse(JSON.stringify(before)) as ScanRun
      endedAt.value = Date.now()
      end.value = scan.lastEnd
      // A scan that read everything has nothing left to say: the results speak.
      if (failedHosts.value.length === 0) {
        open.value = false
        finished.value = null
      }
    },
  )

  return { open, run, finished, endedAt, end, failedHosts, show, close, toggle, start }
})
