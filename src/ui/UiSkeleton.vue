<!--
  Skeleton, from the boards "Feedback" and "Motion": a bar that holds the place of a value
  that has not arrived. The bars match the final text heights, so nothing shifts when the
  value lands (11 for a label, 15 for a value, 24 for a chart or a block). It is still for
  400 ms; only after that does a soft sheen cross it every 1.6 s, so a quick answer never
  flashes. Under Reduce Motion it stays still. The bar is hidden from assistive technology:
  the region that waits says so with `aria-busy`.
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    width?: string
    height?: string
    radius?: string
    /** The darker bar (a line of text) or the lighter one (a block inside a tinted well). */
    tone?: 'strong' | 'soft'
    sheen?: boolean
  }>(),
  { width: '100%', height: '11px', radius: '4px', tone: 'strong', sheen: true },
)
</script>

<template>
  <span
    class="skeleton"
    :class="[`skeleton-${tone}`, { sheen }]"
    :style="{ width, height, borderRadius: radius }"
    aria-hidden="true"
  />
</template>

<style scoped>
.skeleton {
  position: relative;
  display: block;
  flex: none;
  max-width: 100%;
  overflow: hidden;
}

.skeleton-strong {
  background: var(--skeleton-1);
}

.skeleton-soft {
  background: var(--surface-2);
}

.sheen::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 30%,
    color-mix(in srgb, var(--surface-0) 70%, transparent) 50%,
    transparent 70%
  );
  background-size: 200% 100%;
  opacity: 0;
  animation: skeleton-sheen var(--dur-sheen) linear var(--delay-sheen) infinite;
}

@keyframes skeleton-sheen {
  0% {
    opacity: 1;
    background-position: 120% 0;
  }
  100% {
    opacity: 1;
    background-position: -80% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheen::after {
    animation: none;
  }
}
</style>
