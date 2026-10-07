<!--
  The name of a part (a folder, a compose project, a pm2 app) typed by hand or picked from what
  discover found on its server. The list opens while the field has focus and filters as you
  type; what the project already has is shown but cannot be picked. With nothing found the
  field is just a field.
-->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { Suggestion } from '@/lib/sheet-parts'
import UiFloating from '@/ui/UiFloating.vue'
import SheetInput from './SheetInput.vue'

const props = defineProps<{
  modelValue: string
  suggestions: Suggestion[]
  /** The list's heading: "pm2 on vps-sg-1". */
  heading: string
  placeholder: string
  label: string
  tone?: 'none' | 'error' | 'warn'
  field: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string]; pick: [Suggestion]; blur: [] }>()

const { t } = useI18n()
const fmt = useFormat()
const listId = useId()
const focused = ref(false)
const anchor = ref<HTMLElement>()
const active = ref(0)

const shown = computed(() => {
  const needle = props.modelValue.trim().toLowerCase()
  return needle === ''
    ? props.suggestions
    : props.suggestions.filter((s) => s.name.toLowerCase().includes(needle))
})
const open = computed(() => focused.value && props.suggestions.length > 0)
const pickable = computed(() => shown.value.filter((s) => !s.taken))

function note(s: Suggestion): string {
  const n = s.note
  if (n.code === 'pm2')
    return t(
      'projectSheet.parts.suggest.pm2',
      { status: n.text ?? '', n: fmt.number(n.n ?? 0) },
      n.n ?? 0,
    )
  if (n.code === 'compose')
    return t('projectSheet.parts.suggest.compose', { n: n.n ?? 0, total: n.total ?? 0 })
  return n.text ?? ''
}

function choose(s: Suggestion) {
  if (s.taken) return
  emit('pick', s)
  focused.value = false
}

function onKey(event: KeyboardEvent) {
  if (!open.value) return
  const list = pickable.value
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    active.value = (active.value + step + list.length) % Math.max(list.length, 1)
  } else if (event.key === 'Enter' && list[active.value]) {
    event.preventDefault()
    choose(list[active.value] as Suggestion)
  } else if (event.key === 'Escape') {
    // Closes the list only; the sheet stays.
    event.preventDefault()
    focused.value = false
  }
}

function onBlur() {
  // A press on a row runs first (it is `mousedown.prevent`), so blur can close the list.
  focused.value = false
  emit('blur')
}
</script>

<template>
  <div ref="anchor" class="name">
    <SheetInput
      :model-value="modelValue"
      mono
      cell
      bare
      :tone="tone ?? 'none'"
      :placeholder="placeholder"
      :aria-label="label"
      :data-sheet-field="field"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="listId"
      aria-autocomplete="list"
      @update:model-value="(v) => ((active = 0), emit('update:modelValue', v))"
      @focusin="focused = true"
      @keydown="onKey"
      @blur="onBlur"
    />
    <UiFloating
      :open="open"
      :anchor="anchor"
      :trap="false"
      :label="heading"
      min-width="300px"
      :initial-focus="() => anchor?.querySelector('input')"
      @close="focused = false"
    >
      <ul :id="listId" class="list" role="listbox" :aria-label="heading">
        <li class="heading" role="presentation">{{ heading }}</li>
        <li
          v-for="s in shown"
          :key="s.key"
          class="row"
          :class="{ taken: s.taken, on: !s.taken && pickable[active]?.key === s.key }"
          role="option"
          :aria-selected="!s.taken && pickable[active]?.key === s.key"
          :aria-disabled="s.taken || undefined"
          @mousedown.prevent="choose(s)"
        >
          <i class="dot" :class="{ live: s.live }" />
          <span class="mono">{{ s.name }}</span>
          <span class="note">{{ s.taken ? t('projectSheet.parts.suggest.taken') : note(s) }}</span>
        </li>
      </ul>
    </UiFloating>
  </div>
</template>

<style scoped>
.name {
  position: relative;
  min-width: 0;
  flex: 1 1 auto;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 6px;
  list-style: none;
}

.heading {
  padding: 6px 8px 4px;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 var(--space-2);
  border-radius: 8px;
  font-size: var(--text-12);
}

.row.on,
.row:hover:not(.taken) {
  background: var(--menu-hover);
}

.row.taken {
  color: var(--ink-4);
}

.mono {
  overflow: hidden;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
}

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--ink-5);
}

.dot.live {
  background: var(--ok-solid);
}

.note {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}
</style>
