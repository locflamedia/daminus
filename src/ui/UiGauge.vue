<!--
  Gauge, from the board "Charts": a 270 degree arc open at the bottom, 12 stroke with round
  caps, a gradient from the band's soft to its solid colour and a white knob at the value.
  The big number is in the middle (26 px) with the absolute amount under it, and a label with
  an optional state chip below. The value is one dash offset, so the first sweep (700 ms from
  empty, the number fading in at 60 %) and every later update (300 ms) are the same
  transition of one number, with the knob turning along; Reduce Motion shows the value.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { Band } from '@/lib/chart-bands'
import { gaugeGeometry } from '@/lib/chart-layout'
import { shouldPlay } from '@/lib/motion'

const props = withDefaults(
  defineProps<{
    pct: number | null
    band?: Band
    /** The big number, "92%". */
    value: string
    /** The amount under it, "73.6 of 80 GB". */
    caption?: string
    /** What is measured, "Disk". */
    label: string
    /** What a screen reader hears for the whole gauge. */
    description: string
    once?: string
  }>(),
  { band: 'ok', caption: undefined, once: undefined },
)

const gradient = `gauge-${useId()}`
const play = shouldPlay(props.once)

// The first sweep starts from empty: the arc mounts at 0 and moves to the value next frame
// (700 ms); once it has run, later changes tween in 300 ms.
const shown = ref(play ? 0 : (props.pct ?? 0))
const sweeping = ref(play)
let settle: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (!play) return
  requestAnimationFrame(() => {
    shown.value = props.pct ?? 0
  })
  settle = setTimeout(() => (sweeping.value = false), 800)
})
onBeforeUnmount(() => clearTimeout(settle))
watch(
  () => props.pct,
  (pct) => {
    shown.value = pct ?? 0
  },
)
const geometry = computed(() => gaugeGeometry(shown.value))
const empty = computed(() => props.pct === null)
</script>

<template>
  <div class="gauge" :class="[`band-${band}`, { sweeping }]" role="img" :aria-label="description">
    <div class="art">
      <svg class="svg" viewBox="0 0 140 124" aria-hidden="true">
        <defs>
          <linearGradient :id="gradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" class="from" />
            <stop offset="1" class="to" />
          </linearGradient>
        </defs>
        <path
          class="track"
          :d="geometry.track"
          fill="none"
          stroke-width="12"
          stroke-linecap="round"
        />
        <path
          v-if="!empty"
          class="value-arc"
          :d="geometry.track"
          pathLength="1"
          fill="none"
          stroke-width="12"
          stroke-linecap="round"
          stroke-dasharray="1 2"
          :stroke-dashoffset="geometry.dashOffset"
          :stroke="`url(#${gradient})`"
        />
        <g v-if="!empty" class="knob" :style="{ transform: `rotate(${geometry.knobAngle}deg)` }">
          <circle :cx="geometry.knobStart[0]" :cy="geometry.knobStart[1]" r="4" />
        </g>
      </svg>
      <div
        class="centre"
        :class="{ 'm-late': play }"
        :style="{ '--d': 'calc(var(--dur-gauge) * 0.6)' }"
      >
        <span class="big">{{ value }}</span>
        <span v-if="caption" class="caption">{{ caption }}</span>
      </div>
    </div>
    <span class="foot">
      {{ label }}
      <slot name="state" />
    </span>
  </div>
</template>

<style scoped>
.gauge {
  --from: var(--chart-accent-70);
  --to: var(--accent);

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-2);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.band-warn {
  --from: var(--chart-amber-soft);
  --to: var(--chart-amber);
}

.band-crit {
  --from: var(--chart-rose-soft);
  --to: var(--crit-solid);
}

.band-off {
  --from: var(--chart-grey);
  --to: var(--ink-4);
}

.art {
  position: relative;
  width: 100%;
  max-width: 150px;
}

.svg {
  display: block;
  width: 100%;
}

.from {
  stop-color: var(--from);
}

.to {
  stop-color: var(--to);
}

.track {
  stroke: var(--surface-3);
}

.value-arc {
  transition: stroke-dashoffset var(--dur-tween) var(--ease-out);
}

.knob {
  transform-origin: 70px 70px;
  transition: transform var(--dur-tween) var(--ease-out);
}

.sweeping .value-arc {
  transition-duration: var(--dur-gauge);
}

.sweeping .knob {
  transition-duration: var(--dur-gauge);
}

.knob circle {
  fill: var(--chart-knob);
}

/*
  The number sits in the open ring. On the board the block is 84 px tall, pulled up over the
  drawing by its own height, so its top is 80 px above the foot of the drawing.
*/
.centre {
  position: absolute;
  top: calc(100% - 80px);
  right: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
}

.big {
  font-size: 26px;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.caption {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: normal;
}

/* The board's tile has two 4 px gaps between the drawing and the label (the number's block between). */
.foot {
  display: inline-flex;
  margin-top: var(--space-1);
  align-items: center;
  gap: 6px;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}
</style>
