<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'default' | 'on-button' | 'on-glass' }>(), { tone: 'default' })
</script>

<template>
  <kbd class="kbd" :class="`kbd-${tone}`"><slot /></kbd>
</template>

<style scoped>
.kbd {
  display: inline-grid;
  place-items: center;
  height: var(--h-kbd);
  padding: 0 var(--space-1);
  border-radius: 5px;
  background: var(--kbd-bg);
  color: var(--ink-3);
  font: var(--weight-medium) var(--text-11) var(--font-mono);
}

.kbd-on-button {
  background: var(--kbd-on-btn);
  color: inherit;
}

.kbd-on-glass {
  background: var(--kbd-on-glass);
}
</style>
