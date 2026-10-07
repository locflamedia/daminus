<!--
  Scan history strip of the board "Charts": one project's last scans as a row of 24 px cells
  (radius 3, 3 px apart), each healthy, warning, critical or unreachable, with the project
  name and a plain tally above ("28 healthy · 2 critical"). The tally and each cell's title
  carry the meaning, and a warning cell holds a triangle and a critical one a cross, so colour
  is never the only signal. Given titles, the cells can be focused: the strip is one tab stop,
  left and right (Home, End) walk the cells in order, each with the control ring. Pair it with
  `UiChartLegend`.
-->
<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { moveInGrid } from '@/lib/roving-grid'

export type StripState = 'ok' | 'warn' | 'crit' | 'none'

const props = withDefaults(
  defineProps<{
    name: string
    /** The tally as written: "28 healthy · 2 critical". */
    summary: string
    cells: readonly StripState[]
    /** One short description per cell, for the hover title ("#41 · healthy"). */
    titles?: readonly string[]
  }>(),
  { titles: () => [] },
)

/** Glyphs for the states a colour alone would hide: a warning triangle and a cross. */
const GLYPH: Partial<Record<StripState, string>> = {
  warn: 'M8 2.5 14 13H2z M8 6.5v3 M8 11.2h.01',
  crit: 'M5 5l6 6M11 5l-6 6',
}

const list = ref<HTMLElement | null>(null)
const tab = ref(0)
const readable = () => props.titles.length > 0

async function onKey(e: KeyboardEvent) {
  const next = moveInGrid(e.key, { row: 0, col: tab.value }, 1, props.cells.length, e.ctrlKey)
  if (!next) return
  e.preventDefault()
  tab.value = next.col
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-cell="${next.col}"]`)?.focus()
}
</script>

<template>
  <div class="strip">
    <div class="head">
      <span class="name">{{ name }}</span>
      <span class="summary">{{ summary }}</span>
    </div>
    <div
      ref="list"
      class="cells"
      role="group"
      :aria-label="`${name}: ${summary}`"
      :style="{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }"
      @keydown="onKey"
    >
      <i
        v-for="(state, i) in cells"
        :key="i"
        class="cell"
        :class="`state-${state}`"
        :title="titles[i]"
        :data-cell="i"
        :role="readable() ? 'img' : undefined"
        :aria-label="titles[i]"
        :tabindex="readable() ? (tab === i ? 0 : -1) : undefined"
        @focus="tab = i"
      >
        <svg v-if="GLYPH[state]" class="glyph" viewBox="0 0 16 16" aria-hidden="true">
          <path :d="GLYPH[state]" />
        </svg>
      </i>
    </div>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-12);
  line-height: normal;
}

.name {
  overflow: hidden;
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary {
  color: var(--ink-3);
  white-space: nowrap;
}

.cells {
  display: grid;
  gap: 3px;
  height: 24px;
}

.cell {
  display: grid;
  place-items: center;
  border-radius: 3px;
  outline: none;
}

.cell:focus-visible {
  position: relative;
  z-index: 1;
  box-shadow: var(--control-ring);
}

.glyph {
  width: min(10px, 80%);
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.state-ok {
  background: var(--strip-ok);
}

.state-warn {
  background: var(--strip-warn);
  color: var(--warn-ink);
}

.state-crit {
  background: var(--strip-crit);
  color: var(--crit-ink);
}

.state-none {
  background: var(--strip-none);
}
</style>
