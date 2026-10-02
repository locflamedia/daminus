<!--
  Sparkline, from the boards "Charts" and "Data display": the last nine scans on their own
  min-to-max scale, a monotone curve of 2 px, a soft fill and a white dot at the newest value,
  no axis. Accent normally, amber or rose when the value is past a threshold, dashed grey
  when the reading is stale. With fewer than three scans nothing is drawn (the card shows the
  value alone). The line draws once when it arrives (600 ms), the fill fades in after it and
  the dot settles; Reduce Motion shows the final drawing.

  The curve is drawn in a 240 unit wide box that stretches to the tile, with a stroke that
  does not scale; the dot is a plain element so it stays round at any width.
-->
<script setup lang="ts">
import { computed, useId } from 'vue'
import { sparkline } from '@/lib/chart-geometry'
import { shouldPlay } from '@/lib/motion'

export type SparkTone = 'accent' | 'warn' | 'crit' | 'stale'

const props = withDefaults(
  defineProps<{
    values: readonly number[]
    tone?: SparkTone
    height?: number
    /** Share of the series' range left above and below the line. */
    headroom?: number
    /** When set, the arrival plays only the first time this key is seen. */
    once?: string
    /** A description for screen readers; without it the drawing is decorative. */
    label?: string
  }>(),
  { tone: 'accent', height: 24, headroom: 0.15, once: undefined, label: undefined },
)

const gradient = `spark-${useId()}`
const spark = computed(() =>
  sparkline(props.values, { height: props.height, headroom: props.headroom }),
)
const play = shouldPlay(props.once)
const dot = computed(() => {
  const end = spark.value?.end
  if (!end || !spark.value) return {}
  return { left: `${(end[0] / spark.value.width) * 100}%`, top: `${end[1]}px` }
})
</script>

<template>
  <div
    v-if="spark"
    class="spark"
    :class="`tone-${tone}`"
    :style="{ height: `${height}px` }"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <svg
      class="svg"
      :viewBox="`0 0 ${spark.width} ${spark.height}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="stop" stop-opacity=".22" />
          <stop offset="1" class="stop" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path
        class="fill"
        :class="{ 'm-fill': play }"
        :style="{ '--d': '300ms' }"
        :d="spark.fill"
        :fill="`url(#${gradient})`"
      />
      <path
        v-if="tone === 'stale'"
        class="line"
        :d="spark.line"
        fill="none"
        stroke-dasharray="3 4"
      />
      <path
        v-else
        class="line"
        :class="{ 'm-draw': play }"
        pathLength="1"
        :d="spark.line"
        fill="none"
      />
    </svg>
    <i class="dot" :class="{ 'm-pop': play }" :style="{ ...dot, '--d': '500ms' }" />
  </div>
</template>

<style scoped>
.spark {
  --spark: var(--accent);

  position: relative;
  width: 100%;
}

.tone-warn {
  --spark: var(--chart-amber);
}

.tone-crit {
  --spark: var(--crit-solid);
}

.tone-stale {
  --spark: var(--ink-4);
}

.svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.stop {
  stop-color: var(--spark);
}

.line {
  stroke: var(--spark);
  stroke-width: 2;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.dot {
  position: absolute;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  background: var(--chart-knob);
  box-shadow: inset 0 0 0 2px var(--spark);
}
</style>
