<!--
  Progress bar, from the boards "Feedback" (scan step) and "Motion" (per-host progress): a
  track on accent-soft and a fill whose width follows the real steps, 300 ms ease-out per
  step. `sm` is the 4 px bar inside a scan step; `md` is the 6 px bar with the accent gradient.
  Ring and bar share one value. It is a progressbar for screen readers; under Reduce Motion
  the fill jumps.
-->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number; size?: 'sm' | 'md'; label?: string }>(), {
  size: 'sm',
  label: undefined,
})

const clamped = computed(() => Math.min(1, Math.max(0, props.value)))
</script>

<template>
  <span
    class="track"
    :class="`size-${size}`"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(clamped * 100)"
  >
    <i class="fill" :style="{ width: `${clamped * 100}%` }" />
  </span>
</template>

<style scoped>
.track {
  display: block;
  overflow: hidden;
  background: var(--accent-soft);
}

.size-sm {
  height: 4px;
  border-radius: 4px;
}

.size-md {
  height: 6px;
  border-radius: var(--radius-full);
}

.fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width var(--dur-tween) var(--ease-out);
}

.size-md .fill {
  background: linear-gradient(90deg, var(--chart-accent-70), var(--accent));
}
</style>
