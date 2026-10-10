<!--
  Text field, from the board "Inputs": filled, never outlined. The label always sits above
  (11/500, gap 6), the field is 32 px, radius 10, padding 12; help, success or error sits
  below in the same 12 px line. Focus lifts the fill to white with a 2 px accent ring; an
  error tints the field and names itself in text (never colour alone); `mono` is for values
  you could paste into a terminal. Hover and focus can be pinned with `data-force` on the
  field (it falls through to the root) for the gallery. Every field holds a host, a path, a key
  or a search, so macOS never autocorrects, capitalises or spell-checks what is typed.
-->
<script setup lang="ts">
import { computed, useId } from 'vue'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icon-paths'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    placeholder?: string
    /** Neutral help below the field. */
    hint?: string
    /** Shown instead of the hint when a value checked out (green). */
    success?: string
    /** Shown instead of the hint or success text, and marks the field invalid. */
    error?: string
    mono?: boolean
    disabled?: boolean
    type?: 'text' | 'search' | 'url' | 'password'
    /** A 16 px glyph inside the field, before the text (the magnifier of a search field). */
    icon?: IconName
  }>(),
  {
    placeholder: undefined,
    hint: undefined,
    success: undefined,
    error: undefined,
    mono: false,
    disabled: false,
    type: 'text',
    icon: undefined,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
defineSlots<{ trailing?: () => unknown }>()

const id = useId()
const noteId = `${id}-note`

const note = computed(() => props.error ?? props.success ?? props.hint)
const tone = computed(() => (props.error ? 'error' : props.success ? 'success' : 'hint'))

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="field" :class="{ off: disabled }">
    <label :for="id" class="label">{{ label }}</label>
    <div class="control" :class="{ invalid: !!error, mono }">
      <UiIcon v-if="icon" :name="icon" :size="16" class="lead" />
      <input
        :id="id"
        class="input"
        :type="type"
        :autocomplete="type === 'password' ? 'off' : undefined"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="note ? noteId : undefined"
        @input="onInput"
      />
      <slot name="trailing" />
    </div>
    <span v-if="note" :id="noteId" class="note" :class="`note-${tone}`">{{ note }}</span>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.label {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: var(--lh-11);
}

.control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink-3);
  transition:
    background-color var(--dur-color) var(--ease-state),
    box-shadow var(--dur-color) var(--ease-state);
}

.control:hover,
.field[data-force='hover'] .control {
  background: var(--surface-2);
}

.control:focus-within,
.field[data-force='focus'] .control {
  background: var(--field-focus-bg);
  box-shadow: var(--field-focus-ring);
}

.control.invalid {
  background: var(--field-error-bg);
  box-shadow: var(--field-error-ring);
}

.input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: var(--text-13);
}

.mono .input {
  font: var(--text-12) var(--font-mono);
}

/* The control already rings on focus; the global keyboard ring would draw a second one. */
.input:focus-visible {
  box-shadow: none;
}

.input::placeholder {
  color: var(--ink-placeholder);
}

.note {
  min-height: var(--lh-12);
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: var(--lh-12);
}

.note-success {
  color: var(--ok-ink);
}

.note-error {
  color: var(--crit-ink);
}

.off .label,
.off .note {
  color: var(--ink-off);
}

.off .control {
  background: var(--surface-1);
}

.off .input,
.off .input::placeholder {
  color: var(--ink-off);
}
</style>
