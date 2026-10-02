<!--
  Host chip, from the board "Micro UI": 24 px, radius 6, a 12 px server icon in ink-3 and the
  host's alias in mono 11.5. An unreachable host drops the icon for a hollow 6 px dot and
  reads in ink-3, so it is quieter, and says so in words for screen readers. The chip is
  white: it sits on a grey well or a tinted row.
-->
<script setup lang="ts">
import UiIcon from './UiIcon.vue'

withDefaults(defineProps<{ host: string; reachable?: boolean; unreachableLabel?: string }>(), {
  reachable: true,
  unreachableLabel: undefined,
})
</script>

<template>
  <span class="host" :class="{ down: !reachable }">
    <UiIcon v-if="reachable" name="server" :size="12" />
    <span v-else class="hollow" aria-hidden="true" />
    <span class="name">{{ host }}</span>
    <span v-if="!reachable && unreachableLabel" class="sr-only">{{ unreachableLabel }}</span>
  </span>
</template>

<style scoped>
.host {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 24px;
  padding: 0 var(--space-2) 0 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-0);
  color: var(--ink-3);
}

.name {
  color: var(--ink);
  font: var(--weight-regular) 11.5px var(--font-mono);
}

.down .name {
  color: var(--ink-3);
}

.hollow {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
}
</style>
