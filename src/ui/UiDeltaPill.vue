<!--
  Delta pill, from the board "Micro UI": a 22 px chip with a 12 px arrow and the change
  ("1.1 GB", "0.6 s", "0"). The arrow shows the direction and the colour shows whether it is
  good: up is bad for a size and good for free space, so the two are separate props, and the
  number is written with its unit beside the arrow. A change of zero is a dash on a grey
  chip with a hairline. Pass the words in the slot; `lib/micro.deltaPill` picks the pair.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { DeltaDirection, DeltaTone } from '@/lib/micro'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{ direction: DeltaDirection; tone?: DeltaTone }>(), {
  tone: 'neutral',
})

const icon = computed(() =>
  props.direction === 'up' ? 'arrow-up' : props.direction === 'down' ? 'arrow-down' : 'minus',
)
</script>

<template>
  <span class="pill" :class="`tone-${tone}`">
    <UiIcon :name="icon" :size="12" />
    <slot />
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
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
}

.tone-ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.tone-warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.tone-crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.tone-neutral {
  background: var(--surface-1);
  color: var(--ink-3);
  box-shadow: inset 0 0 0 1px var(--surface-3);
}
</style>
