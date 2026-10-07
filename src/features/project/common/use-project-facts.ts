// The raw facts of some checks over the last scans, read again when a scan ends. The history
// store keeps one read per set of checks; this only waits for it and exposes the list.
import { computed, ref, watch } from 'vue'
import { useHistoryStore } from '@/stores/history'
import { useReportStore } from '@/stores/report'

export function useProjectFacts(checks: readonly string[]) {
  const history = useHistoryStore()
  const reports = useReportStore()
  const key = [...checks].sort().join(',')
  const loading = ref(true)
  const facts = computed(() => history.factsNow.get(key) ?? [])

  watch(
    () => reports.latest?.seq,
    async () => {
      loading.value = true
      await history.factsOf(checks)
      loading.value = false
    },
    { immediate: true },
  )

  return { facts, loading }
}
