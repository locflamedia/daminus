<!--
  The disc of a lane: a tick when read, a ring that fills while it is read, a slow dashed ring
  while it waits, a warning, clock or cross when it did not end well.
-->
<script setup lang="ts">
import type { LaneState } from '@/lib/discover-view'
import UiIcon from '@/ui/UiIcon.vue'

defineProps<{ state: LaneState; progress: number }>()
</script>

<template>
  <span class="disc" :class="`disc-${state}`">
    <svg
      v-if="state === 'running'"
      class="ring"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <circle class="ring-track" cx="16" cy="16" r="14" />
      <circle
        class="ring-fill"
        cx="16"
        cy="16"
        r="14"
        pathLength="1"
        :style="{ strokeDashoffset: 1 - progress }"
      />
    </svg>
    <svg
      v-else-if="state === 'queued'"
      class="dash"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
    >
      <circle cx="14" cy="14" r="12" />
    </svg>
    <UiIcon v-if="state === 'running'" name="search" :size="14" />
    <UiIcon v-else-if="state === 'done'" name="check" :size="16" :stroke="1.8" />
    <UiIcon v-else-if="state === 'incomplete'" name="warn" :size="16" />
    <UiIcon v-else-if="state === 'timeout'" name="clock" :size="16" />
    <UiIcon v-else-if="state === 'unreachable'" name="unreachable" :size="16" />
  </span>
</template>

<style scoped>
.disc {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.disc-done {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.disc-incomplete,
.disc-timeout {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.disc-unreachable {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.disc-running {
  color: var(--accent-ink);
}

.ring {
  position: absolute;
  inset: 0;
  transform: rotate(-90deg);
  fill: none;
  stroke-width: 2.4;
}

.ring-track {
  stroke: var(--accent-soft);
}

.ring-fill {
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-dasharray: 1;
  transition: stroke-dashoffset var(--dur-bar) var(--ease-out);
}

.dash {
  fill: none;
  stroke: var(--ink-4);
  stroke-width: 1.6;
  stroke-dasharray: 3 4;
  stroke-linecap: round;
  transform-origin: center;
  animation: m-spin 6s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .dash {
    animation: none;
  }
}
</style>
