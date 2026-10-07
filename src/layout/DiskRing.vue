<script setup lang="ts">
import { computed } from 'vue'
import { diskTone } from '@/lib/rollups'

const props = withDefaults(
  defineProps<{
    /** Disk fill in percent; `null` draws the empty track. */
    pct: number | null
    /** A host being read: a quarter arc that turns, instead of the fill. */
    reading?: boolean
    /** An unreachable host fades. */
    dim?: boolean
    /** Old results: the ring stays in the accent, nothing is amber or red until a fresh scan. */
    neutral?: boolean
    size?: number
  }>(),
  { reading: false, dim: false, neutral: false, size: 16 },
)

// r = 7 in an 18-unit box: the circumference is 44, so the arc length is pct x 0.44.
const CIRCUMFERENCE = 44
const arc = computed(() =>
  props.reading
    ? CIRCUMFERENCE * 0.25
    : (Math.min(100, Math.max(0, props.pct ?? 0)) / 100) * CIRCUMFERENCE,
)
const tone = computed(() => (props.pct === null || props.neutral ? 'normal' : diskTone(props.pct)))
</script>

<template>
  <svg
    class="ring"
    :class="[`tone-${tone}`, { reading, dim }]"
    :width="size"
    :height="size"
    viewBox="0 0 18 18"
    aria-hidden="true"
  >
    <g transform="rotate(-90 9 9)">
      <circle class="track" cx="9" cy="9" r="7" fill="none" stroke-width="2.4" />
      <circle
        class="fill"
        cx="9"
        cy="9"
        r="7"
        fill="none"
        stroke-width="2.4"
        stroke-linecap="round"
        :stroke-dasharray="`${arc} ${CIRCUMFERENCE}`"
      />
    </g>
  </svg>
</template>

<style scoped>
.ring {
  flex: none;
}

.track {
  stroke: var(--surface-3);
}

.fill {
  stroke: var(--accent);
  transition: stroke-dasharray var(--dur-slide) var(--ease-out);
}

.tone-warn .fill {
  stroke: var(--warn-solid);
}

.tone-crit .fill {
  stroke: var(--crit-solid);
}

.reading .track {
  stroke: var(--accent-soft);
}

.reading .fill {
  stroke: var(--accent-ink);
}

.reading {
  animation: ring-turn 0.9s linear infinite;
}

.dim {
  opacity: 0.5;
}

@keyframes ring-turn {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reading {
    animation: none;
  }
}
</style>
