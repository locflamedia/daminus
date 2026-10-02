<!--
  AI finding, collapsed, from the board "AI" (finding lifecycle): one 40 px row (radius 10,
  grey) with a chip, the title (13) and, for a finding that can be opened, a chevron. The
  four states of a finding's life:

  - open: the project chip in the severity's tone, the title in medium weight, a button
    that reports `expand`;
  - explaining: an info chip ("Explaining") and a quiet bar where the answer will land, while
    the model is waited for;
  - known: dimmed to 60 %, a white chip ("Known"), hidden from the counts;
  - resolved: a green row with a white chip ("Resolved"), set only by a later scan that no
    longer produces the evidence, never by the model's say-so.

  A known finding reopens if its evidence changes; that is the owner's rule, not this row's.
  The words are plain text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import UiChip, { type ChipTone } from './UiChip.vue'
import UiIcon from './UiIcon.vue'

export type FindingState = 'open' | 'explaining' | 'known' | 'resolved'

const props = withDefaults(
  defineProps<{
    state?: FindingState
    severity?: 'crit' | 'warn' | 'info'
    /** The chip's words: the project for an open finding, else the state ("Known"). */
    chip: string
    title?: string
  }>(),
  { state: 'open', severity: 'warn', title: undefined },
)
const emit = defineEmits<{ expand: [] }>()

const tone = computed<ChipTone>(() => {
  switch (props.state) {
    case 'explaining':
      return 'info'
    case 'known':
      return 'plain'
    case 'resolved':
      return 'plain-ok'
    default:
      return props.severity
  }
})
const openable = computed(() => props.state === 'open')
</script>

<template>
  <component
    :is="openable ? 'button' : 'div'"
    class="row"
    :class="`state-${state}`"
    :type="openable ? 'button' : undefined"
    @click="openable ? emit('expand') : undefined"
  >
    <UiChip :tone="tone">{{ chip }}</UiChip>
    <span v-if="state === 'explaining'" class="wait m-shimmer" role="status" aria-busy="true" />
    <span v-else class="title">{{ title }}</span>
    <UiIcon v-if="openable" name="chevron-right" :size="14" class="chevron" />
  </component>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  box-sizing: border-box;
  width: 100%;
  height: var(--h-row);
  padding: 0 var(--space-2) 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  text-align: left;
}

/* The chip is top-aligned by default (it sits in text rows); here it is centred in the 40 px. */
.row :deep(.chip) {
  align-self: center;
}

button.row {
  transition: background-color var(--dur-color) var(--ease-state);
}

button.row:hover {
  background: var(--surface-2);
}

button.row:focus-visible {
  box-shadow: var(--focus-ring);
}

.title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-13);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-open .title {
  font-weight: var(--weight-medium);
}

.wait {
  flex: 1 1 auto;
  height: 8px;
  border-radius: 4px;
}

.chevron {
  flex: none;
  color: var(--ink-3);
}

.state-known {
  opacity: 0.6;
}

.state-resolved {
  background: var(--ok-soft);
}
</style>
