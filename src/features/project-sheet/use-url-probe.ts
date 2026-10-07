// A URL row's live check as a ref: it follows the text of the row and asks the core through
// the probe rules of `sheet-url-probe`.
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { urlCheck } from '@/api'
import { type ProbeState, createUrlProbe } from '@/lib/sheet-url-probe'

export function useUrlProbe(url: Ref<string>): Ref<ProbeState> {
  const state = ref<ProbeState>({ kind: 'idle' })
  const probe = createUrlProbe(urlCheck, (next) => (state.value = next))
  watch(url, (value) => probe.input(value), { immediate: true })
  onBeforeUnmount(probe.stop)
  return state
}
