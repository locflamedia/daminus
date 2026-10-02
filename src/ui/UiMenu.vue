<!--
  Menu, from the board "Micro UI" (context menu): radius 14, padding 6, rows 32, a 14 px
  icon in ink-3 on every row (or on none), shortcuts at the right edge, and a destructive
  row last, set apart by a 6 px gap and drawn in the critical ink. It opens from the trigger
  given in the `trigger` slot (a click, or ArrowDown / ArrowUp on the focused trigger) and
  follows the ARIA menu pattern: `role="menu"` with `menuitem` rows, arrows and Home / End
  move, Enter or Space picks, a letter jumps to the next row starting with it, Escape closes
  and returns to the trigger, Tab closes. The row picked is reported as `select` with its id.
-->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { Placement } from '@/lib/anchor'
import UiFloating from './UiFloating.vue'
import UiIcon from './UiIcon.vue'
import UiKbd from './UiKbd.vue'
import type { IconName } from './icon-paths'

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  keys?: string[]
  danger?: boolean
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    items: MenuItem[]
    label: string
    placement?: Placement
    /** Draw the menu in the flow, open, for documentation pages. */
    inline?: boolean
  }>(),
  { placement: 'bottom-start', inline: false },
)

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ select: [id: string] }>()
defineSlots<{
  trigger?: (props: {
    attrs: Record<string, string | boolean | undefined>
    toggle: () => void
    open: boolean
  }) => unknown
}>()

const id = useId()
const anchor = ref<HTMLElement>()
const list = ref<HTMLElement>()

const attrs = computed(() => ({
  'aria-haspopup': 'menu',
  'aria-expanded': open.value,
  'aria-controls': open.value ? id : undefined,
}))

function enabled(): HTMLElement[] {
  return [
    ...(list.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled])') ?? []),
  ]
}

// Opened with ArrowUp, the menu starts on its last row; otherwise on the first.
let startOnLast = false

function startItem(root: HTMLElement): HTMLElement | undefined {
  const rows = [...root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled])')]
  const row = startOnLast ? rows.at(-1) : rows[0]
  startOnLast = false
  return row
}

function toggle() {
  open.value = !open.value
}

function openWith(last: boolean) {
  startOnLast = last
  open.value = true
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) openWith(event.key === 'ArrowUp')
  }
}

function move(step: 1 | -1 | 'first' | 'last') {
  const items = enabled()
  if (items.length === 0) return
  const at = items.indexOf(document.activeElement as HTMLElement)
  let next: number
  if (step === 'first') next = 0
  else if (step === 'last') next = items.length - 1
  else
    next =
      at === -1 ? (step === 1 ? 0 : items.length - 1) : (at + step + items.length) % items.length
  items[next]?.focus()
}

function typeahead(letter: string) {
  const items = enabled()
  const at = items.indexOf(document.activeElement as HTMLElement)
  const ordered = [...items.slice(at + 1), ...items.slice(0, at + 1)]
  ordered.find((el) => el.textContent?.trim().toLowerCase().startsWith(letter))?.focus()
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'Home':
      event.preventDefault()
      move('first')
      break
    case 'End':
      event.preventDefault()
      move('last')
      break
    default:
      if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey) {
        typeahead(event.key.toLowerCase())
      }
  }
}

function pick(item: MenuItem) {
  if (item.disabled) return
  emit('select', item.id)
  open.value = false
}

// A destructive row after other rows gets the 6 px gap of the board.
function apart(index: number): boolean {
  const item = props.items[index]
  const before = props.items[index - 1]
  return !!item?.danger && !!before && !before.danger
}
</script>

<template>
  <span ref="anchor" class="anchor" @keydown="onTriggerKeydown">
    <slot name="trigger" :attrs="attrs" :toggle="toggle" :open="open" />
  </span>
  <UiFloating
    :open="open"
    :anchor="anchor"
    :placement="placement"
    role="menu"
    :label="label"
    :trap="false"
    :inline="inline"
    :initial-focus="startItem"
    min-width="170px"
    @close="open = false"
  >
    <div :id="id" ref="list" class="menu" @keydown="onKeydown">
      <button
        v-for="(item, index) in items"
        :key="item.id"
        type="button"
        role="menuitem"
        class="item"
        :class="{ danger: item.danger, apart: apart(index) }"
        :aria-disabled="item.disabled || undefined"
        tabindex="-1"
        @click="pick(item)"
      >
        <UiIcon v-if="item.icon" :name="item.icon" :size="14" class="icon" />
        <span class="label">{{ item.label }}</span>
        <span v-if="item.keys && item.keys.length > 0" class="keys">
          <UiKbd v-for="key in item.keys" :key="key">{{ key }}</UiKbd>
        </span>
      </button>
    </div>
  </UiFloating>
</template>

<style scoped>
.anchor {
  display: inline-flex;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: var(--h-control);
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  color: var(--ink);
  font-size: var(--text-13);
  text-align: left;
  white-space: nowrap;
  transition: background-color var(--dur-color) var(--ease-state);
}

.item:hover,
.item:focus-visible {
  background: var(--surface-1);
}

.item:focus-visible {
  box-shadow: inset 0 0 0 2px var(--accent);
}

.icon {
  color: var(--ink-3);
}

.label {
  flex: 1 1 auto;
  min-width: 0;
}

.keys {
  display: inline-flex;
  gap: 3px;
  margin-left: auto;
}

.apart {
  margin-top: 6px;
}

.danger {
  color: var(--crit-ink);
}

.danger .icon {
  color: var(--crit-ink);
}

.danger:hover,
.danger:focus-visible {
  background: var(--crit-soft);
}

.item[aria-disabled='true'] {
  color: var(--ink-4);
}
</style>
