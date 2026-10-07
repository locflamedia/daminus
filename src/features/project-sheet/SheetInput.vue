<!--
  A text field of the project sheet, as the board draws it: filled (grey), 32 px with radius
  10, or 28 px with radius 8 as a cell inside a row. Focus lifts the fill to white with a 2 px
  ring; an error draws a red ring and a warning an amber one (kept while focused), so the field and the message
  under it read together. Everything not listed here goes to the `input`.
-->
<script setup lang="ts">
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    modelValue: string
    mono?: boolean
    cell?: boolean
    /** A glyph before the text. */
    icon?: IconName
    tone?: 'none' | 'error' | 'warn'
    /** The text is the value of a row: no fill until hover or focus. */
    bare?: boolean
  }>(),
  { mono: false, cell: false, icon: undefined, tone: 'none', bare: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>()
defineSlots<{ before?: () => unknown; after?: () => unknown }>()
</script>

<template>
  <span class="input" :class="{ mono, cell, bare, [`tone-${tone}`]: tone !== 'none' }">
    <slot name="before" />
    <UiIcon v-if="icon" :name="icon" :size="14" class="glyph" />
    <input
      v-bind="$attrs"
      class="text"
      type="text"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      :value="modelValue"
      :aria-invalid="tone === 'error' || undefined"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="emit('blur')"
    />
    <slot name="after" />
  </span>
</template>

<style scoped>
.input {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  height: var(--h-control);
  padding: 0 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  font-size: var(--text-13);
  transition:
    background-color var(--dur-color) var(--ease-state),
    box-shadow var(--dur-color) var(--ease-state);
}

.input.cell {
  height: var(--h-control-sm);
  border-radius: 8px;
}

.input.mono {
  font-family: var(--font-mono);
  font-size: var(--text-12);
}

.input.bare:not(:focus-within, :hover) {
  background: transparent;
}

.input.bare {
  padding: 0 6px;
}

.tone-error {
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--crit-solid) 45%, transparent);
}

.tone-warn {
  box-shadow: inset 0 0 0 1.5px var(--warn-solid);
}

.input:focus-within {
  background: var(--field-focus-bg);
  box-shadow: var(--field-focus-ring);
}

/* A field with a problem keeps its problem ring while it has focus: red or amber, not blue. */
.tone-error:focus-within {
  box-shadow: inset 0 0 0 1.5px var(--crit-solid);
}

.tone-warn:focus-within {
  box-shadow: inset 0 0 0 1.5px var(--warn-solid);
}

.glyph {
  flex: none;
  color: var(--ink-4);
}

.tone-error .glyph {
  color: var(--crit-ink);
}

.text {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  letter-spacing: inherit;
  outline: none;
  text-overflow: ellipsis;
}

.text:focus-visible {
  box-shadow: none;
}

.text::placeholder {
  color: var(--ink-placeholder);
}
</style>
