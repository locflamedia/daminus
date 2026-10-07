<!--
  The keyboard form of a column chart, from the board "Chart focus": the chart is one tab stop
  with the control ring around the whole of it (a gap, then 2 px of accent). Focusing it from
  the keyboard opens the card on the newest column; left and right step, Home and End jump,
  Escape closes the card. A dashed ink line runs through the focused column and the card sits
  above it, announcing the same words as a sentence for screen readers. The chart inside
  draws the columns and turns the focused column's label to ink through the slot's `hovered`,
  which is null unless the keyboard holds the cursor.
  The line runs from `--cursor-top` to `--cursor-bottom` (4 px each unless the chart sets
  them). With no cards there is nothing to read out, so the stage is a plain box and the chart keeps
  its own description.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { focusedByKeyboard, stepCursor } from '@/lib/chart-cursor'
import UiChartTip, { type ChartTip } from './UiChartTip.vue'

export interface ColumnAnchor {
  /** Centre of the column, 0 to 100 across the stage. */
  x: number
  /** Top of the column, 0 to 100 down the stage. */
  y: number
}

const props = withDefaults(
  defineProps<{
    label: string
    tips?: readonly ChartTip[]
    anchors?: readonly ColumnAnchor[]
  }>(),
  { tips: () => [], anchors: () => [] },
)

const hovered = defineModel<number | null>('hovered', { default: null })
// True while the keyboard holds the cursor: the dashed line and the ink label are its marks.
const keyboard = ref(false)

const count = computed(() => props.tips.length)
const interactive = computed(() => count.value > 0)
const current = computed(() => {
  const i = hovered.value
  if (i === null || i < 0 || i >= count.value) return null
  return { tip: props.tips[i], at: props.anchors[i] }
})
const tipStyle = computed(() => {
  const at = current.value?.at
  if (!at) return {}
  // Near an edge the card hangs inward so it stays inside the stage.
  const edge = at.x < 25 ? '0%' : at.x > 75 ? '-100%' : '-50%'
  return { left: `${at.x}%`, top: `calc(${at.y}% - 6px)`, translate: `${edge} -100%` }
})
const spoken = computed(() => {
  const tip = current.value?.tip
  if (!tip) return ''
  return tip.spoken ?? [tip.title, tip.value, tip.delta].filter(Boolean).join(', ')
})

function onKey(e: KeyboardEvent) {
  const { next, handled } = stepCursor(e.key, hovered.value, count.value)
  if (!handled) return
  e.preventDefault()
  if (e.key === 'Escape') e.stopPropagation()
  keyboard.value = true
  hovered.value = next
}

function onFocus(e: FocusEvent) {
  const el = e.currentTarget
  if (!(el instanceof Element) || !focusedByKeyboard(el)) return
  keyboard.value = true
  if (hovered.value === null && count.value > 0) hovered.value = count.value - 1
}

function onBlur() {
  keyboard.value = false
  hovered.value = null
}
</script>

<template>
  <div
    class="stage"
    :tabindex="interactive ? 0 : undefined"
    :role="interactive ? 'group' : undefined"
    :aria-roledescription="interactive ? 'chart' : undefined"
    :aria-label="interactive ? label : undefined"
    @keydown="onKey"
    @focus="onFocus"
    @blur="onBlur"
  >
    <slot :hovered="keyboard ? hovered : null" />
    <template v-if="current?.tip && current.at">
      <i v-if="keyboard" class="cursor" :style="{ left: `${current.at.x}%` }" aria-hidden="true" />
      <UiChartTip compact class="place" :tip="current.tip" :style="tipStyle" />
    </template>
    <span class="sr-only" aria-live="polite">{{ spoken }}</span>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  border-radius: 12px;
  outline: none;
}

.stage:focus-visible {
  box-shadow: var(--control-ring);
}

.cursor {
  position: absolute;
  top: var(--cursor-top, 4px);
  bottom: var(--cursor-bottom, 4px);
  width: 1.5px;
  margin-left: -0.75px;
  background: repeating-linear-gradient(to bottom, var(--ink) 0 2px, transparent 2px 5px);
  pointer-events: none;
}

.place {
  z-index: 1;
}
</style>
