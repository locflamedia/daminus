<!--
  The CPU line of a service card (board "Project · Containers"): a thin curve over the last
  scans with no dot and no fill. It is revealed once, left to right.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { sparkline } from '@/lib/chart-geometry'
import { shouldPlay } from '@/lib/motion'

const props = defineProps<{ values: readonly number[]; tone: 'accent' | 'warn'; once?: string }>()

const play = shouldPlay(props.once)
const spark = computed(() => sparkline(props.values, { width: 110, height: 28, last: 12 }))
</script>

<template>
  <svg
    v-if="spark"
    class="line"
    :class="[tone, { reveal: play }]"
    :viewBox="`0 0 ${spark.width} ${spark.height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="spark.line" fill="none" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<style scoped>
.line {
  display: block;
  width: 100%;
  height: 20px;
  overflow: visible;
}

.line path {
  stroke: var(--accent);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.line.warn path {
  stroke: var(--chart-amber);
}

.reveal {
  animation: cpu-reveal var(--dur-draw) var(--ease-in-out) both;
}

@keyframes cpu-reveal {
  from {
    clip-path: inset(-4px 100% -4px 0);
  }

  to {
    clip-path: inset(-4px -4px -4px 0);
  }
}
</style>
