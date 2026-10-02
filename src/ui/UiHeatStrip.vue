<!--
  Scan history strip of the board "Charts": one project's last scans as a row of 24 px cells
  (radius 3, 3 px apart), each healthy, warning, critical or unreachable, with the project
  name and a plain tally above ("28 healthy · 2 critical"). The tally and each cell's title
  carry the meaning, so colour is never the only signal. Pair it with `UiChartLegend`.
-->
<script setup lang="ts">
export type StripState = 'ok' | 'warn' | 'crit' | 'none'

withDefaults(
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
</script>

<template>
  <div class="strip">
    <div class="head">
      <span class="name">{{ name }}</span>
      <span class="summary">{{ summary }}</span>
    </div>
    <div class="cells" :style="{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }">
      <i
        v-for="(state, i) in cells"
        :key="i"
        class="cell"
        :class="`state-${state}`"
        :title="titles[i]"
      />
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
  display: block;
  border-radius: 3px;
}

.state-ok {
  background: var(--strip-ok);
}

.state-warn {
  background: var(--strip-warn);
}

.state-crit {
  background: var(--strip-crit);
}

.state-none {
  background: var(--strip-none);
}
</style>
