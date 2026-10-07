<!--
  The soft curve of the project tabs (size over scans, project size, a service's memory): a
  2 px monotone line on a faint fill, a dot at the newest value, and optionally a dashed line
  at a limit. It draws once when it arrives. The values are described for screen readers by the
  caller; the drawing is decorative.
-->
<script setup lang="ts">
import { computed, useId } from 'vue'
import { areaPath, linePoints, monotonePath, paddedDomain } from '@/lib/chart-geometry'
import { shouldPlay } from '@/lib/motion'

const props = withDefaults(
  defineProps<{
    values: readonly number[]
    tone?: 'amber' | 'lilac' | 'accent'
    height?: number
    /** A dashed line at this value; the domain grows to hold it. */
    limit?: number
    limitLabel?: string
    label: string
    once?: string
  }>(),
  { tone: 'accent', height: 110, limit: undefined, limitLabel: undefined, once: undefined },
)

const W = 300
const gradient = `curve-${useId()}`
const play = shouldPlay(props.once)
const BOX = computed(() => ({ x0: 4, x1: W - 4, y0: 12, y1: props.height - 8 }))
const domain = computed<[number, number]>(() => {
  const all = props.limit === undefined ? [...props.values] : [...props.values, props.limit, 0]
  return paddedDomain(all, 0.1, 0.05)
})
const points = computed(() => linePoints([...props.values], BOX.value, domain.value))
const limitY = computed(() => {
  if (props.limit === undefined) return null
  const [lo, hi] = domain.value
  return BOX.value.y1 - ((props.limit - lo) / (hi - lo)) * (BOX.value.y1 - BOX.value.y0)
})
const end = computed(() => points.value[points.value.length - 1])
</script>

<template>
  <div
    v-if="values.length > 1"
    class="curve"
    :class="tone"
    :style="{ height: `${height}px` }"
    role="img"
    :aria-label="label"
  >
    <svg
      class="svg"
      :class="{ reveal: play }"
      :viewBox="`0 0 ${W} ${height}`"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient :id="gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="stop" stop-opacity=".16" />
          <stop offset="1" class="stop" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path
        v-if="limitY !== null"
        class="limit"
        :d="`M0 ${limitY} H${W}`"
        stroke-dasharray="4 5"
        vector-effect="non-scaling-stroke"
      />
      <path
        class="fill"
        :class="{ 'm-fade-in': play }"
        :d="areaPath(points, BOX.y1)"
        :fill="`url(#${gradient})`"
      />
      <path class="line" :d="monotonePath(points)" fill="none" vector-effect="non-scaling-stroke" />
    </svg>
    <i
      v-if="end"
      class="dot"
      :style="{ left: `${(end[0] / W) * 100}%`, top: `${(end[1] / height) * 100}%` }"
    />
    <span v-if="limitLabel && limitY !== null" class="limit-label">{{ limitLabel }}</span>
  </div>
</template>

<style scoped>
/* The line is revealed left to right: a dash animation cannot follow a stroke that does not scale. */
.reveal {
  animation: curve-reveal var(--dur-draw) var(--ease-in-out) both;
}

@keyframes curve-reveal {
  from {
    clip-path: inset(-8px 100% -8px 0);
  }

  to {
    clip-path: inset(-8px -8px -8px 0);
  }
}

.curve {
  position: relative;
  width: 100%;
  --c: var(--accent);
}

.curve.amber {
  --c: var(--chart-amber);
}

.curve.lilac {
  --c: var(--chart-lilac);
}

.svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.stop {
  stop-color: var(--c);
}

.line {
  stroke: var(--c);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.limit {
  stroke: var(--crit-solid);
  stroke-width: 1.2;
  fill: none;
}

.dot {
  position: absolute;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border-radius: var(--radius-full);
  background: var(--c);
  box-shadow: 0 0 0 2px var(--surface-0);
}

.limit-label {
  position: absolute;
  top: 0;
  right: 0;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--surface-0) 80%, transparent);
  color: var(--crit-ink);
  font-size: 10px;
  font-weight: var(--weight-semibold);
}
</style>
