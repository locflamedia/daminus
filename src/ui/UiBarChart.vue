<!--
  Bar chart of the board "Charts" (scan duration): full-radius pills on a faint full-height
  track, so empty space still reads as scale. The latest bar is the accent gradient and the
  earlier ones a pale accent; a dashed line marks the average. Bars rise from their base
  (500 ms, 40 ms apart, the latest last) the first time the chart appears. The first and last
  labels sit under the axis. Values, labels and the description come from the caller. With
  `tips` the chart takes keyboard focus (see `UiColumnStage`): one card per bar, and every bar
  carries the same words as its title.
-->
<script setup lang="ts">
import { computed, useId } from 'vue'
import { barLayout } from '@/lib/chart-layout'
import { shouldPlay } from '@/lib/motion'
import UiChartLegend, { type LegendItem } from './UiChartLegend.vue'
import type { ChartTip } from './UiChartTip.vue'
import UiColumnStage from './UiColumnStage.vue'

const props = withDefaults(
  defineProps<{
    values: readonly number[]
    /** Label under the first and the last bar, "#29" and "#42". */
    labels?: { first: string; last: string }
    showAverage?: boolean
    legend?: readonly LegendItem[]
    /** One card per bar; with them the chart can be focused and read bar by bar. */
    tips?: readonly ChartTip[]
    label: string
    once?: string
  }>(),
  { labels: undefined, showAverage: true, legend: () => [], tips: () => [], once: undefined },
)

const hovered = defineModel<number | null>('hovered', { default: null })

const VIEW = { width: 380, height: 176 }
const gradient = `bar-${useId()}`
const play = shouldPlay(props.once)
const layout = computed(() => barLayout(props.values))
const last = computed(() => props.values.length - 1)
const interactive = computed(() => props.tips.length > 0)
const anchors = computed(() =>
  layout.value.bars.map((bar) => ({
    x: ((bar.x + bar.w / 2) / VIEW.width) * 100,
    y: (bar.y / VIEW.height) * 100,
  })),
)
</script>

<template>
  <div class="bars">
    <UiColumnStage v-model:hovered="hovered" :label="label" :tips="tips" :anchors="anchors">
      <template #default="{ hovered: at }">
        <svg
          class="svg"
          :viewBox="`0 0 ${VIEW.width} ${VIEW.height}`"
          :role="interactive ? undefined : 'img'"
          :aria-label="interactive ? undefined : label"
          :aria-hidden="interactive ? 'true' : undefined"
        >
          <defs>
            <linearGradient :id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" class="top" />
              <stop offset="1" class="bottom" />
            </linearGradient>
          </defs>
          <line
            v-if="showAverage && values.length > 0"
            class="average"
            x1="8"
            x2="372"
            :y1="layout.avgY"
            :y2="layout.avgY"
            stroke-dasharray="3 5"
            stroke-linecap="round"
          />
          <g v-for="(bar, i) in layout.bars" :key="i">
            <title v-if="tips[i]">
              {{ tips[i]?.spoken ?? `${tips[i]?.title}, ${tips[i]?.value}` }}
            </title>
            <rect class="track" :x="bar.x" y="16" :width="bar.w" height="144" :rx="bar.w / 2" />
            <rect
              class="bar"
              :class="[i === last ? 'latest' : 'earlier', { 'm-bar': play }]"
              :style="{
                '--d': `${i * 40}ms`,
                ...(i === last ? { fill: `url(#${gradient})` } : {}),
              }"
              :x="bar.x"
              :y="bar.y"
              :width="bar.w"
              :height="bar.h"
              :rx="bar.r"
            />
          </g>
          <template v-if="labels">
            <text class="axis" :class="{ now: at === 0 }" x="8" y="174">{{ labels.first }}</text>
            <text class="axis" :class="{ now: at === last }" x="372" y="174" text-anchor="end">
              {{ labels.last }}
            </text>
          </template>
        </svg>
      </template>
    </UiColumnStage>
    <UiChartLegend v-if="legend.length > 0" :items="legend" size="small" />
  </div>
</template>

<style scoped>
.bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.svg {
  display: block;
  width: 100%;
  height: auto;
}

.svg text {
  font-family: var(--font-sans);
}

.top {
  stop-color: var(--chart-bar-top);
}

.bottom {
  stop-color: var(--accent);
}

.track {
  fill: var(--surface-1);
}

.earlier {
  fill: var(--chart-bar-old);
}

.average {
  stroke: var(--ink-4);
}

.axis {
  fill: var(--ink-3);
  font-size: var(--text-11);
}

.axis.now {
  fill: var(--ink);
}
</style>
