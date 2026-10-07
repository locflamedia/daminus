<!--
  The 20 px disc in front of a host or a step (board "Scan panel"): a tick when done, a turning
  ring while it is read, a still dot while it waits, a cross when it failed. The state is also
  written for screen readers.
-->
<script setup lang="ts">
import UiIcon from '@/ui/UiIcon.vue'
import UiSpinner from '@/ui/UiSpinner.vue'

export type MarkState = 'done' | 'running' | 'waiting' | 'failed'

defineProps<{ state: MarkState; label: string }>()
</script>

<template>
  <span class="mark" :class="state">
    <UiSpinner v-if="state === 'running'" :size="14" />
    <UiIcon v-else-if="state === 'done'" name="check" :size="12" :stroke="2" />
    <UiIcon v-else-if="state === 'failed'" name="close" :size="10" :stroke="2" />
    <i v-else class="dot" />
    <span class="sr-only">{{ label }}</span>
  </span>
</template>

<style scoped>
.mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.done {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.running {
  background: var(--accent-soft);
  color: var(--accent);
}

.waiting {
  background: var(--surface-1);
}

.failed {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-5);
}
</style>
