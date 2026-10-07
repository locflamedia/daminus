// Which finds arrived while the screen was open. The rows already there when it opened are
// not new, and a row is marked once, when its key first shows up, so re-rendering never plays
// the arrival again.
import { ref, watch, type Ref } from 'vue'

export function useArrivals(keys: () => string[]): Ref<ReadonlySet<string>> {
  const seen = new Set(keys())
  const arrived = ref<ReadonlySet<string>>(new Set())
  watch(keys, (next) => {
    const fresh = next.filter((k) => !seen.has(k))
    if (fresh.length === 0) return
    fresh.forEach((k) => seen.add(k))
    arrived.value = new Set([...arrived.value, ...fresh])
  })
  return arrived
}
