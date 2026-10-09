<script setup lang="ts">
// Mounts the intro over the window when the launch calls for it. The window underneath is
// already drawn; the overlay fades out over it. A click or any key skips (see use-intro.ts),
// from the moment the cover is up. The overlay is decoration: it takes no focus.
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import IntroStage from './IntroStage.vue'
import { useSettingsStore } from '@/stores/settings'
import { useIntro } from './use-intro'

// The test environment keeps the intro off unless a test asks for it.
const props = defineProps<{ force?: boolean }>()
const router = useRouter()
const overlay = ref<HTMLElement | null>(null)

/** True unless something else sits over the middle of the window. */
function overlayOnTop(): boolean {
  const el = overlay.value
  if (el === null || typeof document.elementFromPoint !== 'function') return true
  const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
  return hit === null || el.contains(hit)
}

const { plan, leaving, start, arm, cancel, skip, finish } = useIntro({ topmost: overlayOnTop })
const settings = useSettingsStore()
const live = import.meta.env.MODE !== 'test' || props.force === true
// A plain cover keeps the app from showing while the launch is being read; it goes the moment
// the decision is no intro, and the stage takes it over when an intro plays.
const covered = ref(live && settings.general.intro !== 'never')

onMounted(async () => {
  if (!live) return
  if (covered.value) arm()
  try {
    await router.isReady()
    if (router.currentRoute.value.meta.bare === true) {
      cancel()
      return
    }
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
    role="presentation"
    aria-hidden="true"
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
  opacity: 1;
  transition: opacity 200ms ease;
}
.intro-host.leaving {
  opacity: 0;
  pointer-events: none;
}
</style>
