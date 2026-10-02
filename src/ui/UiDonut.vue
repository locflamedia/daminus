<!--
  Donut of the board "Charts" (what fills a disk): an 18 stroke ring with round caps, 6 degrees
  between segments, the largest first from 12 o'clock, at most five segments and the rest as
  grey "other"; the total sits in the hole and the legend names each part with its amount,
  largest first and "other" last. Segments draw once when the chart arrives (600 ms, 80 ms
  apart); Reduce Motion shows them drawn.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { donutSegments } from '@/lib/chart-layout'
import { shouldPlay } from '@/lib/motion'
import { COLOR_VAR, type ChartColor } from './chart-colors'

export interface DonutPart {
  id: string
  label: string
  value: number
  /** The amount as written, "18.2 GB". */
  display: string
  color: ChartColor
  other?: boolean
}

const props = withDefaults(
  defineProps<{
    parts: readonly DonutPart[]
    /** The total in the hole, "73.6". */
    value: string
    /** Under it, "of 80 GB". */
    caption?: string
    label: string
    once?: string
  }>(),
  { caption: undefined, once: undefined },
)

const play = shouldPlay(props.once)
const segments = computed(() => donutSegments(props.parts))
// The legend reads the named parts in order and "other" last.
const legend = computed(() => [
  ...props.parts.filter((part) => !part.other),
  ...props.parts.filter((part) => part.other),
])
</script>

<template>
  <div class="donut">
    <svg class="svg" viewBox="0 0 170 170" role="img" :aria-label="label">
      <circle class="ring" cx="85" cy="85" r="64" fill="none" stroke-width="18" />
      <path
        v-for="(segment, i) in segments"
        :key="segment.part.id"
        :class="{ 'm-draw': play }"
        :style="{ stroke: COLOR_VAR[segment.part.color], '--d': `${i * 80}ms` }"
        pathLength="1"
        :d="segment.d"
        fill="none"
        stroke-width="18"
        stroke-linecap="round"
      />
      <text class="total" x="85" y="84" text-anchor="middle">{{ value }}</text>
      <text v-if="caption" class="caption" x="85" y="102" text-anchor="middle">{{ caption }}</text>
    </svg>
    <ul class="legend">
      <li v-for="part in legend" :key="part.id" class="row">
        <i class="swatch" :style="{ background: COLOR_VAR[part.color] }" />
        <span class="name">{{ part.label }}</span>
        <b class="amount">{{ part.display }}</b>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.donut {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
}

.svg {
  display: block;
  width: 170px;
  height: 170px;
}

.svg text {
  font-family: var(--font-sans);
}

.ring {
  stroke: var(--surface-1);
}

.total {
  fill: var(--ink);
  font-size: 22px;
  letter-spacing: -0.02em;
}

.caption {
  fill: var(--ink-3);
  font-size: 11px;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-12);
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
}

.swatch {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 4px;
}

.name {
  overflow: hidden;
  color: var(--ink-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount {
  font-weight: var(--weight-medium);
}
</style>
