<!--
  Row, from the boards "Micro UI" (row recipes), "States" (status row in every state),
  "Feedback" (inline banner, scan step) and "Data display" (server table). One recipe, three
  heights: `compact` 40, `default` 48 and `status` 56, radius 10, padding 12. A leading tile
  (28, or 32 on a status row; white, radius 8) names the thing or its state with an icon;
  the title is 12 or 13 px medium with an optional meta line under it; the trailing slot
  holds one chip, one value or one time, never two. `tone` tints the whole row (the inline
  banner is a warn row); healthy rows stay grey and take their colour from the tile only.

  The `actions` slot holds small buttons that appear on the right when the pointer is on the
  row (4 px slide and fade, 150 ms) and stay while anything in the row has keyboard focus.

  With `columns` the slot is the row's own grid cells (the server table), and `header` makes
  it the 28 px column-header row. As a `button` the row is a target: hover fills it, the
  focus ring is the usual one, and it emits `click`. Everything in it is text.
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue'
import UiIcon from './UiIcon.vue'
import UiSpinner from './UiSpinner.vue'
import type { IconName } from './icon-paths'

export type RowTone = 'neutral' | 'ok' | 'warn' | 'crit' | 'info'

const props = withDefaults(
  defineProps<{
    size?: 'compact' | 'default' | 'status'
    tone?: RowTone
    tile?: IconName
    /** A spinner in the tile instead of the icon: the row is being read. */
    busy?: boolean
    /** A white row on a grey ground (the status rows of the States board). */
    raised?: boolean
    /** Colour of the tile's glyph when it differs from the row (a green tick on a grey row). */
    tileTone?: RowTone
    title?: string
    meta?: string
    /** Title and meta in the mono face (host names, paths, commands). */
    mono?: boolean
    columns?: string
    header?: boolean
    as?: 'div' | 'li' | 'button'
  }>(),
  {
    size: 'default',
    tone: 'neutral',
    tile: undefined,
    busy: false,
    raised: false,
    tileTone: undefined,
    title: undefined,
    meta: undefined,
    mono: false,
    columns: undefined,
    header: false,
    as: 'div',
  },
)

defineSlots<{
  default?: () => unknown
  leading?: () => unknown
  trailing?: () => unknown
  actions?: () => unknown
}>()
const emit = defineEmits<{ click: [event: MouseEvent] }>()
const slots = useSlots()

const hasLeading = computed(
  () => props.tile !== undefined || props.busy || slots.leading !== undefined,
)
// A row with its own tint (or the header row) keeps it inside a zebra list.
const flat = computed(() => props.header || props.tone !== 'neutral')
</script>

<template>
  <component
    :is="as"
    class="row"
    :class="[
      `row-${size}`,
      `tone-${tone}`,
      {
        'row-header': header,
        'row-cells': columns !== undefined,
        'row-button': as === 'button',
        'row-raised': raised,
        'no-lead': columns === undefined && !hasLeading,
        'm-actions-host': $slots.actions,
      },
    ]"
    :data-flat="flat || undefined"
    :style="columns ? { gridTemplateColumns: columns } : undefined"
    :type="as === 'button' ? 'button' : undefined"
    @click="as === 'button' ? emit('click', $event) : undefined"
  >
    <template v-if="columns !== undefined"><slot /></template>
    <template v-else>
      <slot name="leading">
        <span v-if="busy" class="tile ink-info">
          <UiSpinner :size="size === 'status' ? 16 : 14" />
        </span>
        <span v-else-if="tile" class="tile" :class="`ink-${tileTone ?? tone}`">
          <UiIcon :name="tile" :size="size === 'status' ? 16 : 14" />
        </span>
      </slot>
      <span class="text">
        <slot>
          <!-- One line each, cut at the end; the tooltip holds the whole text. -->
          <span v-if="title" class="title" :class="{ mono }" :title="title">{{ title }}</span>
          <span v-if="meta" class="meta" :class="{ mono }" :title="meta">{{ meta }}</span>
        </slot>
      </span>
      <span v-if="$slots.trailing || $slots.actions" class="trailing">
        <span v-if="$slots.actions" class="actions m-actions"><slot name="actions" /></span>
        <slot name="trailing" />
      </span>
    </template>
  </component>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.row-compact {
  min-height: var(--h-row);
}

.row-default {
  min-height: 48px;
}

.row-status {
  min-height: var(--h-status-row);
}

/* Without a leading mark the text starts at the padding. */
.row.no-lead {
  grid-template-columns: minmax(0, 1fr) auto;
}

.row-raised {
  background: var(--surface-0);
}

.row-raised .tile {
  background: var(--surface-1);
  box-shadow: none;
}

.tone-ok {
  background: var(--ok-soft);
}

.tone-warn {
  background: var(--warn-soft);
}

.tone-crit {
  background: var(--crit-soft);
}

.tone-info {
  background: var(--accent-soft);
}

.row-header {
  min-height: var(--h-control-sm);
  background: transparent;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.row-cells {
  gap: var(--space-4);
  font-size: var(--text-12);
}

/* The column-header row keeps its 11 px over the cells' 12. */
.row-cells.row-header {
  font-size: var(--text-11);
}

.tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--surface-0);
  box-shadow: var(--shadow-tile);
  color: var(--ink-3);
}

.row-status .tile {
  width: var(--h-control);
  height: var(--h-control);
}

/* On a tinted row the tile is plain white and needs no lift. */
:is(.tone-ok, .tone-warn, .tone-crit, .tone-info) .tile {
  background: var(--surface-0);
  box-shadow: none;
}

.ink-ok {
  color: var(--ok-ink);
}

.ink-warn {
  color: var(--warn-ink);
}

.ink-crit {
  color: var(--crit-ink);
}

.ink-info {
  color: var(--accent-ink);
}

.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.title {
  overflow: hidden;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-status .title {
  font-size: var(--text-13);
}

.meta {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-status .meta {
  font-size: var(--text-12);
}

.mono {
  font-family: var(--font-mono);
}

.title.mono {
  font-weight: var(--weight-medium);
}

.trailing {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-11);
}

.actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.row-button {
  cursor: default;
  transition: background-color var(--dur-color) var(--ease-state);
}

.row-button:hover {
  background: var(--surface-2);
}

.row-button.tone-warn:hover,
.row-button.tone-crit:hover,
.row-button.tone-ok:hover,
.row-button.tone-info:hover {
  filter: brightness(0.97);
}
</style>
