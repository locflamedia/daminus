<script setup lang="ts">
import { computed } from 'vue'
import type { Level } from '@/api'
import UiStatusDot, { type DotState } from '@/ui/UiStatusDot.vue'

/** The 8 px status mark of a project: solid when it has issues, ink-5 when healthy,
 * hollow when a host is unreachable, a small ring that turns while it is being read. */
const props = defineProps<{ level: Level; unreachable?: boolean; reading?: boolean }>()

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
  <span class="slot"><UiStatusDot :state="state" /></span>
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
</style>
