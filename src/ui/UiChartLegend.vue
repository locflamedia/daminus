<!--
  The legend line under a chart: a small swatch and a word for each series or state, so a
  colour is always named. Swatches are 8 px dots or 10 px rounded squares; `ring` draws an
  outline with no fill (the dashed average line of the bar chart); `hatch` is the diagonal
  stripe of an "expected" cell (the colour is ignored). The words come from the
  caller and are rendered as text.
-->
<script setup lang="ts">
import { COLOR_VAR, type ChartColor } from './chart-colors'

export interface LegendItem {
  color: ChartColor
  text: string
  shape?: 'dot' | 'square' | 'ring' | 'hatch'
}

withDefaults(defineProps<{ items: readonly LegendItem[]; size?: 'default' | 'small' }>(), {
  size: 'default',
})
</script>

<template>
  <ul class="legend" :class="`legend-${size}`">
    <li v-for="item in items" :key="item.text" class="item">
      <i
        class="swatch"
        :class="`shape-${item.shape ?? 'dot'}`"
        :style="{ '--swatch': COLOR_VAR[item.color] }"
      />
      {{ item.text }}
    </li>
    <li v-if="$slots.default" class="note"><slot /></li>
  </ul>
</template>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: normal;
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend-small {
  font-size: var(--text-11);
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.note {
  color: var(--ink-3);
}

.swatch {
  display: block;
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--swatch);
}

.shape-square {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.shape-hatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: repeating-linear-gradient(135deg, var(--hatch-1) 0 3px, var(--hatch-2) 3px 6px);
  box-shadow: inset 0 0 0 1px var(--hatch-1);
}

.shape-ring {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--swatch);
}
</style>
