<!--
  Heatmap of the board "Project · History": one row per check group, one column per scan, 20 px
  cells (radius 5, 4 px apart). Each state has a glyph as well as a tint, so colour is never
  the only signal: nothing for ok, a bold "!" for a warning, "×" for critical, a dash for not
  run and a tick on hatching for "expected" (a finding the user marked as known, never ok and never
  hidden). The scans being compared are ringed and their numbers are accent and bold. Given
  titles, the cells can be focused: the map is one tab stop, the arrows walk the cells (Home
  and End go to the ends of the row), and each focused cell takes the control ring and says
  its title. The cells pop in column by column the first time the chart appears (90 ms a
  column, 30 ms a row). Labels and descriptions come from the caller.
-->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { shouldPlay } from '@/lib/motion'
import { moveInGrid } from '@/lib/roving-grid'
import UiChartLegend, { type LegendItem } from './UiChartLegend.vue'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icon-paths'

export type HeatState = 'ok' | 'warn' | 'crit' | 'none' | 'expected'

export interface HeatRow {
  id: string
  label: string
  icon: IconName
  cells: readonly HeatState[]
  /** Hover titles per cell, "#8 · Disk · warning". */
  titles?: readonly string[]
}

export interface HeatColumn {
  id: string
  /** "#8". */
  label: string
}

const props = withDefaults(
  defineProps<{
    columns: readonly HeatColumn[]
    rows: readonly HeatRow[]
    /** Column ids drawn ringed (the two scans being compared). */
    selected?: readonly string[]
    legend?: readonly LegendItem[]
    /** A line at the right of the legend, "Ringed columns are the two scans being compared". */
    note?: string
    label: string
    once?: string
  }>(),
  { selected: () => [], legend: () => [], note: undefined, once: undefined },
)

const play = shouldPlay(props.once)
const picked = computed(() => new Set(props.selected))

const root = ref<HTMLElement | null>(null)
const tab = ref({ row: 0, col: 0 })
const focusable = (row: HeatRow, c: number) => row.titles?.[c] !== undefined

async function onKey(e: KeyboardEvent) {
  const next = moveInGrid(e.key, tab.value, props.rows.length, props.columns.length, e.ctrlKey)
  if (!next) return
  e.preventDefault()
  tab.value = next
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-cell="${next.row}-${next.col}"]`)?.focus()
}

/** The mark each state carries as text, bold 10 px: "!" for a warning, "×" critical, "–" not run. */
const MARK: Partial<Record<HeatState, string>> = { warn: '!', crit: '×', none: '–' }
/** The tick drawn for "expected" (a finding the user marked as known), over its hatching. */
const TICK = 'm3.5 8.4 3 3L12.5 5'
</script>

<template>
  <div ref="root" class="heatmap" role="grid" :aria-label="label" @keydown="onKey">
    <div class="grid head" role="row" :style="{ '--cols': columns.length }">
      <span aria-hidden="true" />
      <span
        v-for="column in columns"
        :key="column.id"
        role="columnheader"
        class="col"
        :class="{ picked: picked.has(column.id) }"
      >
        {{ column.label }}
      </span>
    </div>
    <div
      v-for="(row, r) in rows"
      :key="row.id"
      class="grid"
      role="row"
      :style="{ '--cols': columns.length }"
    >
      <span class="name" role="rowheader"
        ><UiIcon :name="row.icon" :size="14" />{{ row.label }}</span
      >
      <span
        v-for="(state, c) in row.cells"
        :key="c"
        class="cell"
        role="gridcell"
        :class="[`state-${state}`, { ringed: picked.has(columns[c]?.id ?? ''), 'm-pop': play }]"
        :style="{ '--d': `${c * 90 + r * 30}ms` }"
        :title="row.titles?.[c]"
        :aria-label="row.titles?.[c]"
        :data-cell="`${r}-${c}`"
        :tabindex="focusable(row, c) ? (tab.row === r && tab.col === c ? 0 : -1) : undefined"
        @focus="tab = { row: r, col: c }"
      >
        <template v-if="MARK[state]">{{ MARK[state] }}</template>
        <svg v-else-if="state === 'expected'" class="glyph" viewBox="0 0 16 16" aria-hidden="true">
          <path :d="TICK" />
        </svg>
      </span>
    </div>
    <div v-if="legend.length > 0 || note" class="foot">
      <UiChartLegend :items="legend" size="small" />
      <span v-if="note" class="note">{{ note }}</span>
    </div>
  </div>
</template>

<style scoped>
.heatmap {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.grid {
  display: grid;
  grid-template-columns: 132px repeat(var(--cols), minmax(0, 1fr));
  gap: 4px;
  align-items: center;
}

.head {
  height: 16px;
}

.col {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-badge-10);
  text-align: center;
}

.picked {
  color: var(--accent-ink);
  font-weight: var(--weight-semibold);
}

.name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  color: var(--ink-2);
  font-size: var(--text-12);
  white-space: nowrap;
}

.name :deep(.icon) {
  color: var(--ink-3);
}

.cell {
  display: grid;
  place-items: center;
  height: 20px;
  border-radius: 5px;
  outline: none;
  font-size: var(--text-badge-10);
  font-weight: 700;
}

.cell:focus-visible {
  position: relative;
  z-index: 1;
  box-shadow: var(--control-ring);
}

.ringed {
  box-shadow:
    0 0 0 2px var(--surface-0),
    0 0 0 3.5px var(--accent);
}

.glyph {
  width: 10px;
  height: 10px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.state-ok {
  background: var(--heat-ok);
}

.state-warn {
  background: var(--heat-warn);
  color: var(--warn-ink);
}

.state-crit {
  background: var(--heat-crit);
  color: var(--crit-ink);
}

.state-none {
  background: var(--heat-none);
  color: var(--ink-4);
}

.state-expected {
  background: repeating-linear-gradient(135deg, var(--hatch-1) 0 3px, var(--hatch-2) 3px 6px);
  color: var(--accent-ink);
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-left: 136px;
  line-height: normal;
}

.note {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
