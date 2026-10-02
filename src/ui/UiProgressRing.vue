<!--
  Mini progress ring, from the board "Micro UI": 20 px, a 3 px stroke, accent on accent-soft,
  round cap. It replaces the spinner when progress is known (a host's "62%" while it is
  read), and shares its value with the progress bar of the scan step. The fill grows in 300 ms
  as the value moves; under Reduce Motion it jumps. `label` names what is read for screen
  readers; the percentage is the progressbar's value.
-->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number; size?: number; label?: string }>(), {
  size: 20,
  label: undefined,
})

const RADIUS = 8
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const clamped = computed(() => Math.min(1, Math.max(0, props.value)))
const dash = computed(
  () => `${(clamped.value * CIRCUMFERENCE).toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`,
)
</script>

<template>
  <svg
    class="ring"
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(clamped * 100)"
  >
    <circle class="track" cx="10" cy="10" :r="RADIUS" fill="none" stroke-width="3" />
    <circle
      class="fill"
      cx="10"
      cy="10"
      :r="RADIUS"
      fill="none"
      stroke-width="3"
      stroke-linecap="round"
      :stroke-dasharray="dash"
    />
  </svg>
</template>

<style scoped>
.ring {
  flex: none;
  transform: rotate(-90deg);
}

.track {
  stroke: var(--accent-soft);
}

.fill {
  stroke: var(--accent);
  transition: stroke-dasharray var(--dur-tween) var(--ease-out);
}
</style>
