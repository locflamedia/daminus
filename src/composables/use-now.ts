import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

/** The current time in ms, refreshed every `everyMs`, so an age on screen keeps counting. */
export function useNow(everyMs = 60_000) {
  const now = ref(Date.now())
  let timer: number | undefined
  onMounted(() => {
    now.value = Date.now()
    timer = window.setInterval(() => (now.value = Date.now()), everyMs)
  })
  onBeforeUnmount(() => window.clearInterval(timer))
  return readonly(now)
}
