<!--
  Scan complete (board "Delight", tile 3), drawn over the Scan button: six grains of dust
  drift into it and, as the label turns to "Done in 58 s", a ring spreads from it. Plays once
  per finished scan; the label itself is the button's own (see `useDelightStore().settled`).
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { currentDev } from './delight-gate'
import { useDelightStore } from './delight-store'

const store = useDelightStore()
const dev = currentDev()
const dustId = ref<number | null>(null)
let timer: number | undefined

/** Grain from the intro: where each starts (px from the button's centre), size, colour, delay. */
const DUST = [
  { x: -90, y: -70, size: 4, color: '#f7d052', d: 0 },
  { x: 80, y: -80, size: 3, color: '#8fa2ff', d: 30 },
  { x: -40, y: -95, size: 3, color: '#cfe0ff', d: 60 },
  { x: 110, y: -30, size: 4, color: '#f7d052', d: 90 },
  { x: -120, y: -10, size: 3, color: '#8fa2ff', d: 45 },
  { x: 30, y: -100, size: 3, color: '#f7d052', d: 75 },
]

watch(
  () => store.completion,
  (done) => {
    if (!done?.dust) return
    dustId.value = done.id
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (dustId.value = null), 900)
  },
)
onMounted(() => {
  if (dev.kind === 'complete') timer = window.setTimeout(() => store.devComplete(), 300)
})
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <span class="fx" aria-hidden="true">
    <span v-if="store.settled && store.completion?.settle" class="ring" />
    <template v-if="dustId !== null">
      <i
        v-for="(g, i) in DUST"
        :key="`${dustId}-${i}`"
        class="dust"
        :style="{
          '--x': `${g.x}px`,
          '--y': `${g.y}px`,
          '--d': `${g.d}ms`,
          width: `${g.size}px`,
          height: `${g.size}px`,
          background: g.color,
        }"
      />
    </template>
  </span>
</template>

<style scoped>
.fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ring {
  position: absolute;
  inset: -3px;
  border-radius: calc(var(--radius-sm) + 3px);
  box-shadow: 0 0 0 2px var(--wash-1);
  opacity: 0;
  animation: ring 900ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.dust {
  --x: 0px;
  --y: 0px;
  --d: 0ms;

  position: absolute;
  top: 50%;
  left: 50%;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  opacity: 0;
  animation: dust 700ms cubic-bezier(0.3, 0.7, 0.3, 1) both;
  animation-delay: var(--d);
}

@keyframes ring {
  0% {
    opacity: 0;
    transform: scale(0.95);
  }

  14% {
    opacity: 0.8;
  }

  100% {
    opacity: 0;
    transform: scale(1.25);
  }
}

@keyframes dust {
  0% {
    opacity: 0;
    transform: translate(var(--x), var(--y));
  }

  15% {
    opacity: 0.9;
  }

  64% {
    opacity: 0.9;
    transform: translate(0, 0);
  }

  72%,
  100% {
    opacity: 0;
    transform: translate(0, 0) scale(0.3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fx {
    display: none;
  }
}
</style>
