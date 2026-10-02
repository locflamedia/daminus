<!--
  Stacked bar of the board "Data display": 12 tall, radius 6, 2 px between the parts, and a
  legend with a swatch, the name and the amount of each. At most five parts in a fixed ramp
  (accent, accent 70, lilac, blush) with grey for "other"; it shows a part of a whole, never
  change over time. Names and amounts are written in the legend, so the colours only help.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_VAR, STACK_OTHER, STACK_RAMP, type ChartColor } from './chart-colors'

export interface StackPart {
  id: string
  label: string
  value: number
  /** The amount as written, "640 MB". */
  display: string
  /** The grey part that holds everything else; always last. */
  other?: boolean
  mono?: boolean
}

const props = withDefaults(
  defineProps<{ parts: readonly StackPart[]; label: string; legend?: boolean }>(),
  {
    legend: true,
  },
)

const items = computed(() => {
  let step = 0
  return props.parts
    .filter((part) => part.value > 0)
    .map((part) => {
      const color: ChartColor = part.other
        ? STACK_OTHER
        : (STACK_RAMP[Math.min(step++, STACK_RAMP.length - 1)] ?? STACK_OTHER)
      return { part, color: COLOR_VAR[color] }
    })
})
</script>

<template>
  <div class="stack">
    <div class="bar" role="img" :aria-label="label">
      <i
        v-for="{ part, color } in items"
        :key="part.id"
        class="seg"
        :style="{ flex: `${part.value} 1 0%`, background: color }"
      />
    </div>
    <ul v-if="legend" class="list">
      <li v-for="{ part, color } in items" :key="part.id" class="row">
        <i class="swatch" :style="{ background: color }" />
        <span class="name" :class="{ mono: part.mono }">{{ part.label }}</span>
        <b class="amount">{{ part.display }}</b>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.bar {
  display: flex;
  gap: 2px;
  overflow: hidden;
  height: 12px;
  border-radius: 6px;
}

.seg {
  display: block;
  min-width: 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--text-12);
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.swatch {
  display: block;
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 3px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-family: var(--font-mono);
}

.amount {
  margin-left: auto;
  font-weight: var(--weight-medium);
  white-space: nowrap;
}
</style>
