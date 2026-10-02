<!--
  Checkbox row, from the board "Inputs": used in Setup to pick hosts. The whole 40 px row is
  the target. Box 16, radius 5; unchecked = an inset 1.5 ink-4 ring, checked = ink fill with
  a tick that draws in 180 ms. A disabled row dims and explains itself in its trailing text.
  `indeterminate` (a select-all over a partial selection) is announced as "mixed" and, as on
  the board, drawn as an unchecked box.
-->
<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    /** Set the label in Geist Mono (host names, paths). */
    mono?: boolean
    /** Quiet text at the end of the row. */
    meta?: string
    indeterminate?: boolean
    disabled?: boolean
    /** A standing surface-1 row, like the select-all row above a list. */
    filled?: boolean
  }>(),
  { mono: false, meta: undefined, indeterminate: false, disabled: false, filled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const id = useId()

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label class="check" :class="{ off: disabled, filled }" :for="id">
    <input
      :id="id"
      class="native"
      type="checkbox"
      :checked="modelValue"
      :aria-checked="indeterminate ? 'mixed' : modelValue"
      :disabled="disabled"
      @change="onChange"
    />
    <span class="box" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="m2.2 5.2 1.8 1.8 3.8-4" pathLength="1" />
      </svg>
    </span>
    <span class="label" :class="{ mono }"><slot /></span>
    <span v-if="meta" class="meta">{{ meta }}</span>
  </label>
</template>

<style scoped>
.check {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  position: relative;
  height: var(--h-row);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-13);
  transition: background-color var(--dur-color) var(--ease-state);
}

.check.filled,
.check:is(:hover, [data-force='hover']):not(.off) {
  background: var(--surface-1);
}

.native {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
}

.box {
  display: grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: var(--surface-0);
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
  transition:
    background-color var(--dur-color) var(--ease-state),
    box-shadow var(--dur-color) var(--ease-state);
}

.box svg {
  stroke: var(--btn-ink);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset var(--dur-check) var(--ease-out);
}

.native:checked + .box {
  background: var(--btn);
  box-shadow: none;
}

.native:checked + .box svg {
  stroke-dashoffset: 0;
}

.native:focus-visible + .box,
.check[data-force='focus'] .box {
  box-shadow:
    inset 0 0 0 1.5px var(--ink-4),
    0 0 0 2px var(--surface-0),
    0 0 0 4px var(--accent);
}

.native:checked:focus-visible + .box,
.check[data-force='focus'] .native:checked + .box {
  box-shadow:
    0 0 0 2px var(--surface-0),
    0 0 0 4px var(--accent);
}

.label {
  min-width: 0;
}

.mono {
  font: var(--text-12) var(--font-mono);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.off {
  background: var(--surface-1);
  color: var(--ink-4);
}

.off .box {
  background: var(--surface-3);
  box-shadow: none;
}

.off .native:checked + .box {
  background: color-mix(in srgb, var(--ink-5) 40%, var(--surface-3));
}
</style>
