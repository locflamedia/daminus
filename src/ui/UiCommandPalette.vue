<!--
  Command palette, from the board "Inputs" (search and command palette): ⌘K anywhere. A card
  (radius 14, padding 6, the pop shadow) 560 wide, centred in the window with its top placed
  so a typical result list is centred at a third of the window height, over a light scrim.
  A 40 px search field with an Esc cap, then groups (Projects, Servers, Commands) of 36 px
  rows: a status dot or a 14 px glyph, the label with the part that matches in bold (never
  highlighted), and "⏎ open" on the active row. Typing filters; ↑ ↓ move, Enter picks, Esc or
  a press on the scrim closes. It is an ARIA combobox over a listbox; labels render as text.

  The owner passes the groups and decides what picking an id does (open a project, run a
  scan); an empty result says so with the query. It fills the nearest positioned ancestor, as
  the dialog does, and scales in .98 to 1 with a fade in 200 ms (the fade only under Reduce
  Motion).
-->
<script setup lang="ts">
import { computed, nextTick, ref, toRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '@/lib/focus-trap'
import { matchParts } from '@/lib/micro'
import UiIcon from './UiIcon.vue'
import UiKbd from './UiKbd.vue'
import UiSearchField from './UiSearchField.vue'
import UiStatusDot, { type DotState } from './UiStatusDot.vue'
import type { IconName } from './icon-paths'

export interface PaletteItem {
  id: string
  label: string
  /** A status dot for projects and servers... */
  dot?: DotState
  /** ...or a 14 px glyph for commands. */
  icon?: IconName
  /** Extra words that also match (a project's domain, a server's address). */
  keywords?: readonly string[]
}

export interface PaletteGroup {
  id: string
  label: string
  items: readonly PaletteItem[]
}

const props = defineProps<{
  open: boolean
  groups: readonly PaletteGroup[]
  /** The field's accessible name and placeholder. */
  label: string
}>()

const emit = defineEmits<{ select: [id: string, group: string]; close: [] }>()
const query = defineModel<string>('query', { default: '' })

const { t } = useI18n()
const listId = useId()
const panel = ref<HTMLElement>()
const active = ref(0)

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          q === '' ||
          item.label.toLowerCase().includes(q) ||
          (item.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
      ),
    }))
    .filter((group) => group.items.length > 0)
})
const flat = computed(() =>
  shown.value.flatMap((g) => g.items.map((item) => ({ item, group: g.id }))),
)
const activeId = computed(() => {
  const entry = flat.value[active.value]
  return entry ? `${listId}-${entry.item.id}` : undefined
})

watch(query, () => (active.value = 0))
watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = ''
      active.value = 0
    }
  },
)

useFocusTrap(panel, toRef(props, 'open'), {
  onEscape: () => emit('close'),
  initialFocus: (root) => root.querySelector<HTMLElement>('input'),
})

function move(step: number) {
  const n = flat.value.length
  if (n === 0) return
  active.value = (active.value + step + n) % n
  void nextTick(() =>
    panel.value
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' }),
  )
}

function pick(index: number) {
  const entry = flat.value[index]
  if (!entry) return
  emit('select', entry.item.id, entry.group)
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    pick(active.value)
  }
}
</script>

<template>
  <Transition name="palette" appear>
    <div v-if="open" class="layer" @mousedown.self="emit('close')">
      <div class="scrim" aria-hidden="true" />
      <div
        ref="panel"
        class="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="label"
        @keydown="onKeydown"
      >
        <UiSearchField
          v-model="query"
          :label="label"
          :placeholder="label"
          hint="Esc"
          size="large"
          :controls="listId"
          :active-descendant="activeId"
          :expanded="true"
        />
        <div :id="listId" class="list" role="listbox" :aria-label="label">
          <div
            v-for="group in shown"
            :key="group.id"
            class="group"
            role="group"
            :aria-labelledby="`${listId}-g-${group.id}`"
          >
            <span :id="`${listId}-g-${group.id}`" class="group-label">{{ group.label }}</span>
            <div
              v-for="item in group.items"
              :id="`${listId}-${item.id}`"
              :key="item.id"
              class="item"
              role="option"
              :aria-selected="flat[active]?.item.id === item.id"
              @mousemove="active = flat.findIndex((e) => e.item.id === item.id)"
              @click="pick(flat.findIndex((e) => e.item.id === item.id))"
            >
              <UiStatusDot v-if="item.dot" :state="item.dot" />
              <UiIcon v-else-if="item.icon" :name="item.icon" :size="14" class="glyph" />
              <span class="name">
                <template v-for="(part, i) in matchParts(item.label, query)" :key="i">
                  <b v-if="part.match" class="match">{{ part.text }}</b>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
              <span v-if="flat[active]?.item.id === item.id" class="open">
                <UiKbd tone="on-field">⏎</UiKbd>{{ t('ui.palette.open') }}
              </span>
            </div>
          </div>
          <p v-if="shown.length === 0" class="none" role="status">
            {{ t('ui.palette.empty', { query }) }}
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.layer {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: clamp(24px, calc(33vh - 140px), 240px) var(--space-4) var(--space-4);
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim-sheet);
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  box-sizing: border-box;
  width: 560px;
  max-width: 100%;
  padding: 6px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-pop);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 340px;
  overflow-y: auto;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-label {
  padding: var(--space-1) var(--space-3) 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 36px;
  padding: 0 var(--space-3);
  border-radius: var(--space-2);
  font-size: var(--text-13);
  cursor: default;
}

.item[aria-selected='true'] {
  background: var(--surface-1);
}

.glyph {
  color: var(--ink-3);
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match {
  font-weight: var(--weight-medium);
}

.open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.none {
  padding: var(--space-3);
  color: var(--ink-3);
  font-size: var(--text-13);
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity var(--dur-sheet) var(--ease-out);
}

.palette-enter-active .panel,
.palette-leave-active .panel {
  transition: transform var(--dur-sheet) var(--ease-out);
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}

.palette-enter-from .panel,
.palette-leave-to .panel {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .palette-enter-from .panel,
  .palette-leave-to .panel {
    transform: none;
  }
}
</style>
