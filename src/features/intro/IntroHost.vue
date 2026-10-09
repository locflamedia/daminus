<script setup lang="ts">
// Mounts the intro over the window when the launch calls for it. The window underneath is
// already drawn; the overlay fades out over it. A click or any key skips (see use-intro.ts).
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IntroStage from './IntroStage.vue'
import { useSettingsStore } from '@/stores/settings'
import { useIntro } from './use-intro'

// The test environment keeps the intro off unless a test asks for it.
const props = defineProps<{ force?: boolean }>()
const router = useRouter()
const { plan, leaving, start, skip, finish } = useIntro()
const settings = useSettingsStore()
const overlay = ref<HTMLElement | null>(null)
const live = import.meta.env.MODE !== 'test' || props.force === true
// A plain cover keeps the app from showing while the launch is being read; it goes the moment
// the decision is no intro, and the stage takes it over when an intro plays.
const covered = ref(live && settings.general.intro !== 'never')
let previousFocus: HTMLElement | null = null

watch(plan, async (now, before) => {
  if (now === null) {
    const back = previousFocus
    previousFocus = null
    if (before !== null && back !== null && back.isConnected) back.focus({ preventScroll: true })
    return
  }
  if (before !== null) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  overlay.value?.focus({ preventScroll: true })
})

onMounted(async () => {
  if (!live) return
  try {
    await router.isReady()
    if (router.currentRoute.value.meta.bare === true) return
    await start()
  } finally {
    covered.value = false
  }
})
</script>

<template>
  <div
    v-if="plan || covered"
    ref="overlay"
    class="intro-host"
    :class="{ leaving }"
    tabindex="-1"
    data-testid="intro-host"
    @click="skip"
  >
    <IntroStage
      v-if="plan"
      :journey="plan.journey"
      :scene="plan.scene"
      :reduced-motion="plan.reducedMotion"
      :freeze-at="plan.freezeAt"
      @done="finish"
    />
  </div>
</template>

<style scoped>
.intro-host {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: #eef0fb;
  outline: none;
  opacity: 1;
  transition: opacity 200ms ease;
}
.intro-host.leaving {
  opacity: 0;
  pointer-events: none;
}
</style>
