<!--
  Issues per scan, from the board "Scan history": one column per scan, stacked critical (at
  the bottom), warning and info, 16 px an issue with 2 px between, 22 px wide and radius 5, in
  a 120 px well. The scans being compared are solid and the rest faded; each scan's number
  sits under its column. Each column's description (what the segments add up to) is for
  screen readers and the hover title, so the heights are never the only signal. Given a card
  per scan the chart takes keyboard focus (see `UiColumnStage`): the card opens on the focused
  column, its number turns ink and the same words are announced. Columns rise from their base,
  40 ms apart, the first time the chart appears. While a scan runs, `live` adds a hatched
  column at the end with its label ("#13 · running"), from board 30.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { issueColumns, type IssueCounts } from '@/lib/chart-layout'
import { shouldPlay } from '@/lib/motion'
import { COLOR_VAR } from './chart-colors'
import UiChartLegend, { type LegendItem } from './UiChartLegend.vue'
import type { ChartTip } from './UiChartTip.vue'
import UiColumnStage from './UiColumnStage.vue'

export interface IssueScan extends IssueCounts {
  id: string
  /** "#12". */
  label: string
  /** "2 critical, 4 warnings": what the column adds up to. */
  description: string
  /** The card and the announced sentence; with one per scan the chart can take focus. */
  tip?: ChartTip
}

const props = withDefaults(
  defineProps<{
    scans: readonly IssueScan[]
    /** Scan ids drawn solid; when empty every column is solid. */
    compared?: readonly string[]
    legend?: readonly LegendItem[]
    label: string
    once?: string
    /** The label of the scan running now, drawn as a hatched column after the saved ones. */
    live?: string | null
  }>(),
  { compared: () => [], legend: () => [], once: undefined, live: null },
)

const hovered = defineModel<number | null>('hovered', { default: null })

const play = shouldPlay(props.once)
const picked = computed(() => new Set(props.compared))
const columns = computed(() => issueColumns(props.scans))
const tips = computed(() => {
  const all = props.scans.map((scan) => scan.tip)
  return all.every((tip) => tip !== undefined) ? (all as ChartTip[]) : []
})
const WELL = 120
const GAP = 2
const LABEL = 20
const anchors = computed(() =>
  columns.value.map((segments, i) => {
    const stack =
      segments.reduce((sum, s) => sum + s.height, 0) + GAP * Math.max(0, segments.length - 1)
    const count = props.scans.length + (props.live ? 1 : 0)
    return { x: ((i + 0.5) / count) * 100, y: ((WELL - stack) / (WELL + LABEL)) * 100 }
  }),
)
const TONE = {
  crit: COLOR_VAR['issue-crit'],
  warn: COLOR_VAR['issue-warn'],
  info: COLOR_VAR['issue-info'],
} as const
</script>

<template>
  <div class="issues">
    <UiColumnStage
      v-model:hovered="hovered"
      class="well"
      :label="label"
      :tips="tips"
      :anchors="anchors"
    >
      <template #default="{ hovered: at }">
        <ul class="bars" role="list" :aria-label="tips.length > 0 ? undefined : label">
          <li
            v-for="(scan, i) in scans"
            :key="scan.id"
            class="column"
            :class="{ faded: compared.length > 0 && !picked.has(scan.id) }"
            :title="`${scan.label}: ${scan.description}`"
          >
            <span class="sr-only">{{ scan.label }}: {{ scan.description }}</span>
            <i
              v-for="segment in columns[i]"
              :key="segment.tone"
              class="segment"
              :class="{ 'm-bar': play }"
              :style="{
                height: `${segment.height}px`,
                background: TONE[segment.tone],
                '--d': `${i * 40}ms`,
              }"
              aria-hidden="true"
            />
            <span class="num" :class="{ now: at === i }" aria-hidden="true">{{ scan.label }}</span>
          </li>
          <li v-if="live" class="column live">
            <i class="segment hatch" aria-hidden="true" />
            <span class="num">{{ live }}</span>
          </li>
        </ul>
      </template>
    </UiColumnStage>
    <UiChartLegend v-if="legend.length > 0" :items="legend" size="small" />
  </div>
</template>

<style scoped>
.issues {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.well {
  --cursor-top: 0;
  --cursor-bottom: 20px;

  padding-bottom: 20px;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 120px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.column {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column-reverse;
  align-items: center;
  gap: 2px;
  height: 100%;
}

.segment {
  display: block;
  width: 22px;
  border-radius: 5px;
  transform-origin: bottom;
}

.faded .segment {
  opacity: 0.55;
}

.hatch {
  height: 100%;
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 25%, transparent) 0 4px,
    color-mix(in srgb, var(--accent) 8%, transparent) 4px 8px
  );
  box-shadow: inset 0 0 0 1.5px var(--accent);
}

.live .num {
  right: auto;
  left: 50%;
  color: var(--accent-ink);
  white-space: nowrap;
  transform: translateX(-50%);
}

.num {
  position: absolute;
  right: 0;
  bottom: -20px;
  left: 0;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-badge-10);
  text-align: center;
}

.faded .num {
  color: var(--ink-3);
}

.num.now {
  color: var(--ink);
}
</style>
