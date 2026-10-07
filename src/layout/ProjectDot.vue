<script setup lang="ts">
import { computed } from 'vue'
import type { Level } from '@/api'
import UiStatusDot, { type DotState } from '@/ui/UiStatusDot.vue'

/**
 * The 8 px mark of a project in the sidebar: a dot in the colour picked for it in setup, or
 * a small ring that turns while it is being read. A project with no colour yet shows its
 * status instead (solid when it has issues, ink-5 when healthy, hollow when unreachable);
 * the severity is always in the count beside the name.
 */
const props = defineProps<{
  level: Level
  unreachable?: boolean
  reading?: boolean
  /** `#rrggbb`, already checked. */
  color?: string | null
}>()

const state = computed<DotState>(() =>
  props.reading
    ? 'reading'
    : props.level === 'crit'
      ? 'crit'
      : props.level === 'warn'
        ? 'warn'
        : props.unreachable
          ? 'unknown'
          : 'ok',
)
</script>

<template>
  <span class="slot">
    <UiStatusDot v-if="reading || !color" :state="state" />
    <span v-else class="own" :style="{ '--mark': color }" />
  </span>
</template>

<style scoped>
/* The mark sits in a 16 px slot, centred, as on the sidebar rows of the boards. */
.slot {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
}

.own {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--mark);
}
</style>
