<!--
  Value roll, from the board "Motion": when a number changed since the last scan the old
  value slides up and out while the new one rises in, 400 ms, ease-out. It rolls only on a
  change, never on first draw and never as a count-up on a value somebody is reading; under
  Reduce Motion the value swaps at once. The text is always rendered as text, and screen
  readers get the final value only.
-->
<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <span class="roll">
    <Transition name="roll">
      <span :key="text" class="value">{{ text }}</span>
    </Transition>
  </span>
</template>

<style scoped>
.roll {
  position: relative;
  display: inline-grid;
  overflow: hidden;
  vertical-align: bottom;
}

.value {
  grid-area: 1 / 1;
  white-space: nowrap;
}

.roll-enter-active,
.roll-leave-active {
  transition:
    transform var(--dur-roll) var(--ease-out),
    opacity var(--dur-roll) var(--ease-out);
}

.roll-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.roll-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.roll-leave-active {
  position: absolute;
  inset: 0 auto auto 0;
}

@media (prefers-reduced-motion: reduce) {
  .roll-enter-from,
  .roll-leave-to {
    transform: none;
  }
}
</style>
