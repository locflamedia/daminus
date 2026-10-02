<!--
  Issues per scan, from the board "Scan history": one column per scan, stacked critical (at
  the bottom), warning and info, 16 px an issue with 2 px between, 22 px wide and radius 5, in
  a 120 px well. The scans being compared are solid and the rest faded; each scan's number
  sits under its column. Each column's description (what the segments add up to) is for
  screen readers and the hover title, so the heights are never the only signal. Columns rise
  from their base, 40 ms apart, the first time the chart appears.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { issueColumns, type IssueCounts } from '@/lib/chart-layout'
import { shouldPlay } from '@/lib/motion'
import { COLOR_VAR } from './chart-colors'
import UiChartLegend, { type LegendItem } from './UiChartLegend.vue'

export interface IssueScan extends IssueCounts {
  id: string
  /** "#12". */
  label: string
  /** "2 critical, 4 warnings": what the column adds up to. */
  description: string
}

const props = withDefaults(
  defineProps<{
    scans: readonly IssueScan[]
    /** Scan ids drawn solid; when empty every column is solid. */
    compared?: readonly string[]
    legend?: readonly LegendItem[]
    label: string
    once?: string
  }>(),
  { compared: () => [], legend: () => [], once: undefined },
)

const play = shouldPlay(props.once)
const picked = computed(() => new Set(props.compared))
const columns = computed(() => issueColumns(props.scans))
const TONE = {
  crit: COLOR_VAR['issue-crit'],
  warn: COLOR_VAR['issue-warn'],
  info: COLOR_VAR['issue-info'],
} as const
</script>

<template>
  <div class="issues">
    <ul class="bars" role="list" :aria-label="label">
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
        <span class="num" aria-hidden="true">{{ scan.label }}</span>
      </li>
    </ul>
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

.bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 120px;
  margin: 0 0 20px;
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

.num {
  position: absolute;
  right: 0;
  bottom: -20px;
  left: 0;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 10px;
  text-align: center;
}

.faded .num {
  color: var(--ink-3);
}
</style>
