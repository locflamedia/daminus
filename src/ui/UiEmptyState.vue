<!--
  Empty state, from the board "Data display": a 64 px icon tile (radius 20, accent-soft, a 28 px
  glyph in accent-ink, the one large icon on a screen), a 20/500 title, one sentence on what
  happens next (13, ink-3, at most 60 characters wide) and one primary action in the slot.
  Padding 32 and 32 between the three parts; on a narrow card the action wraps below. It
  stands where a list would be, and says what is missing, not that something failed.
-->
<script setup lang="ts">
import UiIcon from './UiIcon.vue'
import type { IconName } from './icon-paths'

withDefaults(defineProps<{ icon?: IconName; title: string; text?: string }>(), {
  icon: 'server',
  text: undefined,
})
defineSlots<{ default?: () => unknown }>()
</script>

<template>
  <div class="empty">
    <span class="tile" aria-hidden="true"><UiIcon :name="icon" :size="28" /></span>
    <div class="words">
      <h3 class="title">{{ title }}</h3>
      <p v-if="text" class="text">{{ text }}</p>
    </div>
    <div v-if="$slots.default" class="action"><slot /></div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-8);
}

.tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.words {
  display: flex;
  flex: 1 1 280px;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.title {
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-20);
}

.text {
  max-width: 60ch;
  color: var(--ink-3);
  font-size: var(--text-13);
}

.action {
  flex: none;
}
</style>
