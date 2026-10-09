<!--
  Clear sky (board "Delight", tile 1): when a scan ends with every project clear, the night
  sky of the painting shows around the summary for 1.8 s and its own stars twinkle once, then
  it fades. Sits behind the summary (which gets a pane of the surface colour over it, as the
  board's card does), never takes a click, and plays once per finished scan, never on load.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import sky from '@/assets/delight/starry-sky.jpg'
import { currentDev } from './delight-gate'
import { useDelightStore } from './delight-store'
import { SKY_ASPECT, SKY_MS, SKY_STARS } from './sky-stars'

const store = useDelightStore()
const dev = currentDev()
const playing = ref(false)
const hold = ref(false)
let timer: number | undefined

function play(keep: boolean) {
  window.clearTimeout(timer)
  hold.value = keep
  playing.value = true
  if (!keep) timer = window.setTimeout(() => (playing.value = false), SKY_MS + 100)
}

watch(
  () => store.completion,
  (done) => {
    if (done?.sky) play(false)
  },
)
onMounted(() => {
  if (dev.kind === 'sky') timer = window.setTimeout(() => play(dev.hold), 300)
})
onBeforeUnmount(() => window.clearTimeout(timer))

/** Shows the strip of the crop where the stars are densest. */
const BAND_TOP = 0.03
</script>

<template>
  <div v-if="playing" class="sky" :class="{ hold }" aria-hidden="true">
    <div
      class="field"
      :style="{
        backgroundImage: `url(${sky})`,
        aspectRatio: String(SKY_ASPECT),
        transform: `translateY(-${BAND_TOP * 100}%)`,
      }"
    >
      <i
        v-for="(s, i) in SKY_STARS"
        :key="i"
        class="glow"
        :style="{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, '--d': `${s.delayMs}ms` }"
      />
    </div>
    <span class="veil" />
  </div>
</template>

<style scoped>
.sky {
  position: absolute;
  inset: -10px -26px;
  z-index: -1;
  overflow: hidden;
  border-radius: 16px;
  background: #16244f;
  pointer-events: none;
  animation: sky 1800ms cubic-bezier(0.65, 0, 0.35, 1) both;
}

.field {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background-size: 100% 100%;
}

/* The summary reads on a pane of the surface colour; the sky shows round it and through it. */
.veil {
  position: absolute;
  inset: 10px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-0) 86%, transparent);
  backdrop-filter: blur(8px);
}

.glow {
  --d: 0ms;

  position: absolute;
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgb(255 236 160 / 95%),
    rgb(255 214 102 / 35%) 40%,
    rgb(255 214 102 / 0%) 70%
  );
  mix-blend-mode: screen;
  opacity: 0;
  animation: tw 1800ms cubic-bezier(0.23, 1, 0.32, 1) both;
  animation-delay: var(--d);
}

.hold,
.hold .glow {
  animation: none;
  opacity: 1;
}

@keyframes sky {
  0%,
  12% {
    opacity: 0;
  }

  30%,
  78% {
    opacity: 1;
  }

  94%,
  100% {
    opacity: 0;
  }
}

@keyframes tw {
  0%,
  30% {
    opacity: 0;
    transform: scale(0.6);
  }

  38% {
    opacity: 1;
    transform: scale(1.15);
  }

  52%,
  70% {
    opacity: 0.7;
    transform: none;
  }

  86%,
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sky {
    display: none;
  }
}
</style>
