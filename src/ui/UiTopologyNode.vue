<!--
  Topology node of the board "Project card": 24 px, radius 6, a 6 px dot that is that
  component's own state, its short name (11/500) and, when given, the server or runtime it
  runs on (mono, ink-3). An unknown state is a hollow dot; the overflow node ("+2") has no
  dot. The state is also written for screen readers.
-->
<script setup lang="ts">
import type { NodeState } from '@/lib/topology'

withDefaults(
  defineProps<{
    label: string
    caption?: string
    /** Omit for the overflow node, which has no dot. */
    state?: NodeState
    /** The state in words, "Warning"; read out, not shown. */
    stateLabel?: string
    /** The URL node draws a globe instead of a dot. */
    url?: boolean
  }>(),
  { caption: undefined, state: undefined, stateLabel: undefined, url: false },
)
</script>

<template>
  <span class="node">
    <svg v-if="url" class="globe" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 2a6 6 0 1 1 0 12A6 6 0 1 1 8 2z M2 8h12 M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14c-1.8-1.7-2.6-3.7-2.6-6S6.2 3.7 8 2z"
      />
    </svg>
    <i v-else-if="state" class="dot" :class="`state-${state}`" aria-hidden="true" />
    <b class="label">{{ label }}</b>
    <span v-if="caption" class="caption">{{ caption }}</span>
    <span v-if="stateLabel" class="sr-only">{{ stateLabel }}</span>
  </span>
</template>

<style scoped>
.node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  background: var(--surface-0);
  box-shadow: var(--shadow-node);
  font-size: var(--text-11);
  white-space: nowrap;
}

.label {
  font-weight: var(--weight-medium);
}

.caption {
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.state-ok {
  background: var(--ok-solid);
}

.state-warn {
  background: var(--warn-solid);
}

.state-crit {
  background: var(--crit-solid);
}

.state-unknown {
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
}

.globe {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: var(--ink-3);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
