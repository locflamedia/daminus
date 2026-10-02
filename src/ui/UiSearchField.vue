<!--
  Search field, from the boards "Components" and "Inputs": a filled field, never outlined,
  with a 16 px search glyph, the text and, at the right, a key hint on its own cap ("⌘K",
  "Esc") or a clear button once there is text. 32 px tall (radius 10) by default and 40 px in
  the command palette. Focus lifts it to white with the 2 px accent ring. It is a labelled
  `search` input; the label is the placeholder's words, read out though not drawn twice.
-->
<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from './UiIcon.vue'
import UiKbd from './UiKbd.vue'

withDefaults(
  defineProps<{
    placeholder?: string
    label: string
    /** The key hint at the right ("⌘K"). */
    hint?: string
    clearable?: boolean
    size?: 'default' | 'large'
    /** The id of the listbox this field drives, when it is a combobox. */
    controls?: string
    activeDescendant?: string
    expanded?: boolean
  }>(),
  {
    placeholder: undefined,
    hint: undefined,
    clearable: false,
    size: 'default',
    controls: undefined,
    activeDescendant: undefined,
    expanded: undefined,
  },
)

const model = defineModel<string>({ default: '' })
const input = ref<HTMLInputElement>()
defineExpose({ focus: () => input.value?.focus() })

const { t } = useI18n()
const id = useId()
</script>

<template>
  <div class="field" :class="`size-${size}`">
    <UiIcon name="search" :size="16" class="glyph" />
    <label :for="id" class="sr-only">{{ label }}</label>
    <input
      :id="id"
      ref="input"
      v-model="model"
      class="input"
      :type="controls ? 'text' : 'search'"
      :role="controls ? 'combobox' : undefined"
      :placeholder="placeholder"
      :aria-controls="controls"
      :aria-activedescendant="activeDescendant"
      :aria-expanded="controls ? expanded : undefined"
      aria-autocomplete="list"
      autocomplete="off"
      spellcheck="false"
    />
    <UiKbd v-if="hint" tone="on-field">{{ hint }}</UiKbd>
    <button
      v-else-if="clearable && model"
      type="button"
      class="clear"
      :aria-label="t('ui.clear')"
      @click="model = ''"
    >
      <UiIcon name="close" :size="12" />
    </button>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  box-sizing: border-box;
  height: var(--h-control);
  padding: 0 var(--space-2) 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink-3);
  transition: background-color var(--dur-color) var(--ease-state);
}

.size-large {
  height: var(--h-row);
}

.field:hover {
  background: var(--surface-2);
}

.field:focus-within {
  background: var(--surface-0);
  box-shadow: var(--focus-ring);
}

.glyph {
  flex: none;
}

.input {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ink);
  font-size: var(--text-13);
  outline: none;
}

.input::placeholder {
  color: var(--ink-3);
}

/* The browser's own clear control would draw a second one. */
.input::-webkit-search-cancel-button {
  display: none;
}

.clear {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  color: var(--ink-3);
}

.clear:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.clear:focus-visible {
  box-shadow: var(--focus-ring);
}
</style>
