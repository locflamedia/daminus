<!--
  Segmented control, from the board "Inputs": two to six options that filter or switch views
  in place (more than six: use a select). The selected segment lifts on a white pill; counts
  stay in ink-3. Arrow keys move and select (Home and End jump); only the selected segment is
  in the tab order. `semantics` is "tabs" for views and filters, "radio" for a stored choice.
-->
<script setup lang="ts">
import { nextTick, ref } from 'vue'

export interface SegOption {
  value: string
  label: string
  count?: number | string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SegOption[]
    /** The group's accessible name (a segmented control has no visible label). */
    label: string
    semantics?: 'tabs' | 'radio'
  }>(),
  { semantics: 'tabs' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const buttons = ref<HTMLButtonElement[]>([])

function select(value: string) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}

function onKeydown(event: KeyboardEvent, index: number) {
  const last = props.options.length - 1
  let next: number
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
    next = index === 0 ? last : index - 1
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = last
  else return
  event.preventDefault()
  const option = props.options[next]
  if (!option) return
  select(option.value)
  void nextTick(() => buttons.value[next]?.focus())
}
</script>

<template>
  <div class="seg" :role="semantics === 'tabs' ? 'tablist' : 'radiogroup'" :aria-label="label">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      :ref="(el) => (buttons[index] = el as HTMLButtonElement)"
      type="button"
      class="segment"
      :class="{ on: option.value === modelValue }"
      :role="semantics === 'tabs' ? 'tab' : 'radio'"
      :aria-selected="semantics === 'tabs' ? option.value === modelValue : undefined"
      :aria-checked="semantics === 'radio' ? option.value === modelValue : undefined"
      :tabindex="option.value === modelValue ? 0 : -1"
      @click="select(option.value)"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
      <span v-if="option.count !== undefined" class="count">{{ option.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  align-self: flex-start;
  height: var(--h-control);
  padding: 3px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.segment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 var(--space-3);
  border-radius: 7px;
  background: transparent;
  color: var(--ink-3);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  transition:
    background-color var(--dur-color) var(--ease-state),
    color var(--dur-color) var(--ease-state),
    box-shadow var(--dur-color) var(--ease-state);
}

.segment:is(:hover, [data-force='hover']) {
  color: var(--ink);
}

.segment.on {
  background: var(--seg-on);
  color: var(--ink);
  box-shadow: var(--shadow-seg);
}

.segment:is(:focus-visible, [data-force='focus']) {
  box-shadow: var(--focus-ring);
}

.count {
  color: var(--ink-3);
}
</style>
