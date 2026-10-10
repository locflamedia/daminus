// What the shared result states need from the running scan, for one project or one server:
// the name the buttons say, the host the scan is reading now (the "Scanning …" note), and a
// scan of just that project or server, or of the hosts that did not answer.
import { type MaybeRefOrGetter, computed, toValue } from 'vue'
import { cardScan, serverScan } from '@/lib/overview-scan'
import { useProjectsStore } from '@/stores/projects'
import { useScanStore } from '@/stores/scan'

export type ResultTarget = { project: string } | { host: string }

export function useResultScan(target: MaybeRefOrGetter<ResultTarget>) {
  const scan = useScanStore()
  const projects = useProjectsStore()

  const saved = computed(() => {
    const t = toValue(target)
    return 'project' in t ? projects.details.find((p) => p.id === t.project) : undefined
  })

  /** The project's saved name (its id until `projects.json` is read), or the host alias. */
  const name = computed(() => {
    const t = toValue(target)
    return 'project' in t ? (saved.value?.name ?? t.project) : t.host
  })

  /** The host being read for this target now; the project's name while only its URLs are. */
  const scanningHost = computed<string | null>(() => {
    const t = toValue(target)
    if ('host' in t) {
      const state = serverScan(t.host, scan.run)
      return state === 'queued' || state === 'reading' ? t.host : null
    }
    if (!saved.value) return null
    const card = cardScan(saved.value, scan.run)
    if (card.phase === 'idle') return null
    return card.reading ?? (card.uptime ? name.value : null)
  })

  /** Scans this project or this server only. */
  function scanThis() {
    if (scan.scanning) return
    const t = toValue(target)
    void scan.start(
      'project' in t ? { projects: [t.project], hosts: [] } : { projects: [], hosts: [t.host] },
    )
  }

  /** Scans the given hosts again. */
  function retry(hosts: readonly string[]) {
    if (scan.scanning || hosts.length === 0) return
    void scan.start({ projects: [], hosts: [...hosts] })
  }

  return { name, scanningHost, busy: computed(() => scan.scanning), scanThis, retry }
}
