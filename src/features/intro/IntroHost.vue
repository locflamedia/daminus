<script setup lang="ts">
// Mounts the intro over the window when the launch calls for it. The window underneath is
// already drawn; the overlay fades out over it. A click or any key skips (see use-intro.ts).
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IntroStage from './IntroStage.vue'
import { useIntro } from './use-intro'

// The test environment keeps the intro off unless a test asks for it.
const props = defineProps<{ force?: boolean }>()
const router = useRouter()
const { plan, leaving, start, skip, finish } = useIntro()
const overlay = ref<HTMLElement | null>(null)

watch(plan, async (now) => {
  if (now === null) return
  await nextTick()
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  overlay.value?.focus({ preventScroll: true })
})

onMounted(async () => {
  if (import.meta.env.MODE === 'test' && props.force !== true) return
  await router.isReady()
  if (router.currentRoute.value.meta.bare === true) return
  await start()
})
</script>

<template>
  <div
    v-if="plan"
    ref="overlay"
    class="intro-host"
    :class="{ leaving }"
    tabindex="-1"
    data-testid="intro-host"
    @click="skip"
  >
    <IntroStage
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
  outline: none;
  opacity: 1;
  transition: opacity 200ms ease;
}
.intro-host.leaving {
  opacity: 0;
  pointer-events: none;
}
</style>
