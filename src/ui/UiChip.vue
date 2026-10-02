<!--
  Chip, from the board "Components": a 22 px pill that names a state ("6 of 6", "Needs a
  look", "Critical", "Scanning", "0 issues"). The word carries the meaning and the tone
  backs it up; colour is never the only signal. `plain` is the white chip for use on a
  grey well (a project name on a finding), `plain-ok` the same on a green row. An optional 12 px glyph goes before the word
  (the chip morph of the Motion board swaps it for a spinner while `busy`). The text is
  always rendered as text.
-->
<script setup lang="ts">
import UiIcon from './UiIcon.vue'
import UiSpinner from './UiSpinner.vue'
import type { IconName } from './icon-paths'

export type ChipTone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'plain' | 'plain-ok'

withDefaults(defineProps<{ tone?: ChipTone; icon?: IconName; busy?: boolean }>(), {
  tone: 'neutral',
  icon: undefined,
  busy: false,
})
</script>

<template>
  <span class="chip" :class="`chip-${tone}`">
    <UiSpinner v-if="busy" :size="12" />
    <UiIcon v-else-if="icon" :name="icon" :size="12" :stroke="1.8" />
    <slot />
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  height: var(--h-chip);
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color var(--dur-state) var(--ease-out),
    color var(--dur-state) var(--ease-out);
}

.chip-ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.chip-warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.chip-crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.chip-info {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.chip-neutral {
  background: var(--surface-1);
  color: var(--ink-3);
}

.chip-plain {
  background: var(--surface-0);
  color: var(--ink-3);
}

/* White on a green row: the "Resolved" chip of a finding. */
.chip-plain-ok {
  background: var(--surface-0);
  color: var(--ok-ink);
}
</style>
