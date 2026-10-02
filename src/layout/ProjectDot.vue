<script setup lang="ts">
import type { Level } from '@/api'

/** The 8 px status mark of a project: solid when it has issues, ink-5 when healthy,
 * hollow when a host is unreachable, a small ring that turns while it is being read. */
defineProps<{ level: Level; unreachable?: boolean; reading?: boolean }>()
</script>

<template>
  <svg
    v-if="reading"
    class="dot spinner"
    width="12"
    height="12"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6" fill="none" stroke-width="2.4" class="spinner-track" />
    <path
      d="M8 2a6 6 0 0 1 6 6"
      fill="none"
      stroke-width="2.4"
      stroke-linecap="round"
      class="spinner-arc"
    />
  </svg>
  <span
    v-else
    class="dot"
    :class="[
      level === 'crit' ? 'crit' : level === 'warn' ? 'warn' : unreachable ? 'hollow' : 'quiet',
    ]"
    aria-hidden="true"
  />
</template>

<style scoped>
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin: 0 var(--space-1);
  border-radius: var(--radius-full);
}

.crit {
  background: var(--crit-solid);
}

.warn {
  background: var(--warn-solid);
}

.quiet {
  background: var(--ink-5);
}

.hollow {
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
}

.spinner {
  width: 12px;
  height: 12px;
  margin: 0 2px;
  border-radius: 0;
  animation: dot-turn 0.9s linear infinite;
}

.spinner-track {
  stroke: var(--accent-soft);
}

.spinner-arc {
  stroke: var(--accent-ink);
}

@keyframes dot-turn {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
