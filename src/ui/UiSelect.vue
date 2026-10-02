<!--
  Select, from the board "Inputs" and the language menu of "Settings · General". A field that
  opens a listbox from itself; typing filters, arrows move, Enter picks, Esc closes and
  returns to the field. Two shapes:

  - default: label, a 32 px field, rows with a tick for the current value and a quiet note
    at the end. The text box is the field itself while the menu is open. `customLabel` adds a
    last row for a value that is not listed: type it and press Enter.
  - language: a 36 px field with the flag, a search box on top of the menu, rows with flag,
    native name, English name and code, then a dimmed "not translated yet" group (each with
    its percentage, not selectable) and a link to help translate.

  The menu is positioned under the field and is not portalled: a clipping ancestor clips it.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import UiFlag from './UiFlag.vue'
import UiIcon from './UiIcon.vue'
import type { FlagCode } from './flags'

export interface SelectOption {
  value: string
  label: string
  /** Quiet note at the end of a default row ("default", "fast"). */
  meta?: string
  /** Second name of a language row (the English name). */
  detail?: string
  /** Short code at the end of a language row (`en`, `zh-Hans`). */
  code?: string
  flag?: FlagCode
  /** Translated share, 0 to 99: a language row with it is dimmed and cannot be picked. */
  progress?: number
}

const CUSTOM = '\u0000custom'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    variant?: 'default' | 'language'
    label?: string
    /** Accessible name when there is no visible label. */
    accessibleName?: string
    searchPlaceholder?: string
    emptyLabel?: string
    /** Heading of the group of rows that carry `progress`. */
    pendingLabel?: string
    /** The link at the end of the language menu; it emits `help`. */
    helpLabel?: string
    /** The last row of a default menu, for a value that is not listed. */
    customLabel?: string
    disabled?: boolean
    /** Starts open (the gallery draws the open menu). */
    defaultOpen?: boolean
  }>(),
  {
    variant: 'default',
    label: undefined,
    accessibleName: undefined,
    searchPlaceholder: undefined,
    emptyLabel: undefined,
    pendingLabel: undefined,
    helpLabel: undefined,
    customLabel: undefined,
    disabled: false,
    defaultOpen: false,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; help: [] }>()

const uid = useId()
const triggerId = `${uid}-trigger`
const listId = `${uid}-list`

const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const input = ref<HTMLInputElement>()
const open = ref(false)
const query = ref('')
const active = ref<string>()

const isLanguage = computed(() => props.variant === 'language')
const selected = computed(() => props.options.find((o) => o.value === props.modelValue))
const shownLabel = computed(() => selected.value?.label ?? props.modelValue)

/** Lower case with the accents taken off, so "viet" finds "Tiếng Việt". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
}

const matches = computed(() => {
  const needle = fold(query.value.trim())
  if (!needle) return props.options
  return props.options.filter((o) =>
    [o.label, o.detail ?? '', o.code ?? '', o.value].some((text) => fold(text).includes(needle)),
  )
})
const ready = computed(() => matches.value.filter((o) => o.progress === undefined))
const pending = computed(() => matches.value.filter((o) => o.progress !== undefined))
const showCustom = computed(() => !isLanguage.value && props.customLabel !== undefined)
/** Values the arrow keys visit, top to bottom. */
const navigable = computed(() => [
  ...ready.value.map((o) => o.value),
  ...(showCustom.value ? [CUSTOM] : []),
])
const empty = computed(() => ready.value.length === 0 && pending.value.length === 0)

function optionId(value: string): string {
  const index = [...ready.value, ...pending.value].findIndex((o) => o.value === value)
  return value === CUSTOM ? `${uid}-custom` : `${uid}-opt-${index}`
}
const activeId = computed(() => (active.value === undefined ? undefined : optionId(active.value)))

watch(navigable, (values) => {
  if (active.value === undefined || !values.includes(active.value)) active.value = values[0]
})

function focusInput() {
  void nextTick(() => input.value?.focus())
}

function openMenu() {
  if (props.disabled || open.value) return
  query.value = ''
  open.value = true
  active.value = navigable.value.includes(props.modelValue) ? props.modelValue : navigable.value[0]
  focusInput()
}

function closeMenu(returnFocus: boolean) {
  if (!open.value) return
  open.value = false
  query.value = ''
  if (returnFocus) void nextTick(() => trigger.value?.focus())
}

function choose(value: string) {
  if (value === CUSTOM) {
    const typed = query.value.trim()
    if (typed) {
      emit('update:modelValue', typed)
      closeMenu(true)
    } else {
      focusInput()
    }
    return
  }
  const option = props.options.find((o) => o.value === value)
  if (!option || option.progress !== undefined) return
  if (value !== props.modelValue) emit('update:modelValue', value)
  closeMenu(true)
}

function move(step: 1 | -1) {
  const values = navigable.value
  if (values.length === 0) return
  const at = active.value === undefined ? -1 : values.indexOf(active.value)
  const next =
    at === -1 ? (step === 1 ? 0 : values.length - 1) : (at + step + values.length) % values.length
  active.value = values[next]
  void nextTick(() =>
    document.getElementById(optionId(values[next] ?? ''))?.scrollIntoView?.({ block: 'nearest' }),
  )
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    openMenu()
  }
}

function onInputKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'Enter':
      event.preventDefault()
      if (active.value !== undefined) choose(active.value)
      break
    case 'Escape':
      // Handled here, so the window behind (Settings' own Esc) does not also leave.
      event.preventDefault()
      closeMenu(true)
      break
    case 'Tab':
      closeMenu(false)
      break
  }
}

function onOutsidePointer(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) closeMenu(false)
}

watch(
  open,
  (isOpen) => {
    if (isOpen) document.addEventListener('pointerdown', onOutsidePointer)
    else document.removeEventListener('pointerdown', onOutsidePointer)
  },
  { flush: 'post' },
)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer))

if (props.defaultOpen) {
  open.value = true
  active.value = navigable.value.includes(props.modelValue) ? props.modelValue : navigable.value[0]
}
</script>

<template>
  <div ref="root" class="select" :class="[`select-${variant}`, { open, off: disabled }]">
    <label v-if="label" :for="triggerId" class="label">{{ label }}</label>

    <!-- Closed: a button. Open (default shape): the field itself becomes the text box. -->
    <div v-if="open && !isLanguage" class="field field-typing">
      <input
        :id="triggerId"
        ref="input"
        v-model="query"
        class="typing"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        :aria-controls="listId"
        :aria-activedescendant="activeId"
        :aria-label="label ? undefined : accessibleName"
        :placeholder="shownLabel"
        autocomplete="off"
        spellcheck="false"
        @keydown="onInputKeydown"
      />
      <UiIcon name="chevron-down" :size="14" class="chevron" />
    </div>
    <button
      v-else
      :id="triggerId"
      ref="trigger"
      type="button"
      class="field"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      :aria-label="label ? undefined : accessibleName"
      :disabled="disabled"
      @click="open ? closeMenu(false) : openMenu()"
      @keydown="onTriggerKeydown"
    >
      <UiFlag v-if="selected?.flag" :code="selected.flag" />
      <span class="value">{{ shownLabel }}</span>
      <UiIcon name="chevron-down" :size="14" class="chevron" />
    </button>

    <Transition name="menu">
      <div v-if="open" class="menu">
        <div v-if="isLanguage" class="search">
          <UiIcon name="search" :size="14" />
          <input
            :id="`${uid}-search`"
            ref="input"
            v-model="query"
            class="search-input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-controls="listId"
            :aria-activedescendant="activeId"
            :aria-label="searchPlaceholder ?? accessibleName ?? label"
            :placeholder="searchPlaceholder"
            autocomplete="off"
            spellcheck="false"
            @keydown="onInputKeydown"
          />
        </div>

        <div :id="listId" class="list" role="listbox" :aria-label="label ?? accessibleName">
          <div
            v-for="option in ready"
            :id="optionId(option.value)"
            :key="option.value"
            class="option"
            :class="{ active: active === option.value, selected: option.value === modelValue }"
            role="option"
            :aria-selected="option.value === modelValue"
            @mousedown.prevent
            @mousemove="active = option.value"
            @click="choose(option.value)"
          >
            <template v-if="isLanguage">
              <UiFlag v-if="option.flag" :code="option.flag" />
              <span class="name">{{ option.label }}</span>
              <span v-if="option.detail" class="detail">{{ option.detail }}</span>
              <span class="tail">
                <UiIcon
                  v-if="option.value === modelValue"
                  name="check"
                  :size="14"
                  :stroke="2"
                  class="tick"
                />
                <span v-if="option.code" class="code">{{ option.code }}</span>
              </span>
            </template>
            <template v-else>
              <span class="mark">
                <UiIcon
                  v-if="option.value === modelValue"
                  name="check"
                  :size="14"
                  :stroke="1.8"
                  class="tick"
                />
              </span>
              <span class="name">{{ option.label }}</span>
              <span v-if="option.meta" class="meta">{{ option.meta }}</span>
            </template>
          </div>

          <div
            v-if="showCustom"
            :id="optionId(CUSTOM)"
            class="option option-custom"
            :class="{ active: active === CUSTOM }"
            role="option"
            aria-selected="false"
            @mousedown.prevent
            @mousemove="active = CUSTOM"
            @click="choose(CUSTOM)"
          >
            <span class="mark" />
            <span class="name">{{ customLabel }}</span>
          </div>

          <div v-if="pending.length > 0" role="group" :aria-label="pendingLabel">
            <span v-if="pendingLabel" class="group-label" aria-hidden="true">{{
              pendingLabel
            }}</span>
            <div
              v-for="option in pending"
              :id="optionId(option.value)"
              :key="option.value"
              class="option option-pending"
              role="option"
              aria-selected="false"
              aria-disabled="true"
            >
              <UiFlag v-if="option.flag" :code="option.flag" />
              <span class="name">{{ option.label }}</span>
              <span v-if="option.detail" class="detail">{{ option.detail }}</span>
              <span class="tail">
                <span class="percent">{{ option.progress }}%</span>
                <span v-if="option.code" class="code">{{ option.code }}</span>
              </span>
            </div>
          </div>
        </div>

        <p v-if="empty && emptyLabel" class="empty">{{ emptyLabel }}</p>

        <button v-if="isLanguage && helpLabel" type="button" class="help" @click="emit('help')">
          {{ helpLabel }}
          <UiIcon name="external" :size="14" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.select {
  position: relative;
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

.field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: var(--h-control);
  padding: 0 var(--space-2) 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink);
  font-size: var(--text-13);
  text-align: left;
  transition:
    background-color var(--dur-color) var(--ease-state),
    box-shadow var(--dur-color) var(--ease-state);
}

.field:hover {
  background: var(--surface-2);
}

.field:focus-visible,
.open .field {
  background: var(--surface-0);
  box-shadow: var(--focus-ring);
}

.value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex: none;
  margin-left: auto;
  color: var(--ink-3);
}

.typing {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: var(--text-13);
}

/* The current value stays readable as ink while the box waits for typing. */
.typing::placeholder {
  color: var(--ink);
  opacity: 1;
}

.typing:focus-visible,
.search-input:focus-visible {
  box-shadow: none;
}

.select-language .field {
  height: 36px;
  padding: 0 10px;
  gap: 10px;
}

.select-language.open .field {
  background: var(--surface-0);
  box-shadow: 0 0 0 2px var(--accent-mid);
}

.select-language .field:focus-visible {
  box-shadow: var(--focus-ring);
}

.off .field {
  color: var(--ink-4);
}

/* The menu: radius 14, padding 6, rows 32, overlay shadow, opens from the field. */
.menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: var(--radius-md);
  background: var(--surface-pop);
  box-shadow: var(--shadow-overlay);
  transform-origin: top left;
}

.select-language .menu {
  right: 0;
  left: auto;
  width: 340px;
  max-width: 100vw;
  transform-origin: top right;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
}

.option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 var(--space-2);
  border-radius: 8px;
  color: var(--ink);
  font-size: var(--text-13);
  white-space: nowrap;
}

.option.active,
.option.selected {
  background: var(--menu-hover);
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 14px;
  height: 14px;
}

.tick {
  color: var(--accent-ink);
}

.option-custom .name {
  color: var(--ink-3);
}

/* Language rows: flag, native name, English name; code and tick at the end. */
.select-language .option {
  gap: 10px;
  height: 34px;
  padding: 0 10px;
}

.select-language .option.active {
  background: var(--accent-soft);
}

.select-language .option.selected:not(.active) {
  background: transparent;
}

.detail {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.tail {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}

.code {
  color: var(--ink-3);
  font: var(--text-11) var(--font-mono);
}

.group-label {
  display: block;
  padding: var(--space-2) 10px var(--space-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.option-pending {
  opacity: 0.55;
}

.percent {
  display: inline-flex;
  align-items: center;
  height: var(--h-kbd);
  padding: 0 6px;
  border-radius: 5px;
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: 10px;
  font-weight: var(--weight-medium);
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 10px;
  margin-bottom: var(--space-1);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--ink-4);
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: var(--text-12);
}

.search-input::placeholder {
  color: var(--ink-3);
}

.empty {
  padding: var(--space-2) 10px;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.help {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 34px;
  padding: 0 10px;
  margin-top: var(--space-1);
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  text-align: left;
}

.help :deep(.icon) {
  margin-left: auto;
}

.help:hover {
  color: var(--accent-ink-hover);
}

.menu-enter-active {
  transition:
    opacity var(--dur-popover) var(--ease-out),
    transform var(--dur-popover) var(--ease-out);
}

.menu-leave-active {
  transition: opacity var(--dur-menu-close) var(--ease-state);
}

.menu-enter-from {
  opacity: 0;
  transform: scale(0.98);
}

.menu-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .menu-enter-from {
    transform: none;
  }
}
</style>
