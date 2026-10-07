<!--
  The suggested project of a find: a pill with the project's colour as a dot and a tint of it
  as the fill. "Unassigned" is the neutral pill. The colour is the draft's, so a project keeps
  it from this screen to the next.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { colorName } from '@/lib/setup-model'

const props = defineProps<{
  /** The project's colour as stored (`#4f6bed`); none draws the neutral tint. */
  color?: string | null
  neutral?: boolean
  /** Pulses once when the find has just been paired. */
  pulse?: boolean
}>()

const tint = computed(() => (props.neutral ? null : (colorName(props.color) ?? 'slate')))
</script>

<template>
  <span class="proj" :class="[tint ? `tint-${tint}` : null, { neutral, pulse }]">
    <i aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.proj {
  /* The project's own tint is set on the element; slate until then. */
  --tint-2: var(--tint-slate-2);
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: var(--h-chip);
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--tint-2) 16%, var(--surface-0));
  color: color-mix(in srgb, var(--tint-2) 75%, var(--ink));
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

i {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tint-2);
}

.tint-blue {
  --tint-2: var(--tint-blue-2);
}

.tint-lilac {
  --tint-2: var(--tint-lilac-2);
}

.tint-rose {
  --tint-2: var(--tint-rose-2);
}

.tint-amber {
  --tint-2: var(--tint-amber-2);
}

.tint-green {
  --tint-2: var(--tint-green-2);
}

.tint-teal {
  --tint-2: var(--tint-teal-2);
}

.tint-coral {
  --tint-2: var(--tint-coral-2);
}

.tint-slate {
  --tint-2: var(--tint-slate-2);
}

.neutral {
  background: var(--surface-well);
  color: var(--ink-3);
}

.neutral i {
  background: var(--ink-4);
}

.pulse {
  animation: pulse 1.2s var(--ease-out) both;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--tint-2) 35%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--tint-2) 35%, transparent);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
</style>
