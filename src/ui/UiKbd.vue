<script setup lang="ts">
withDefaults(
  defineProps<{ tone?: 'default' | 'on-button' | 'on-glass' | 'on-field' | 'on-menu' }>(),
  {
    tone: 'default',
  },
)
</script>

<template>
  <kbd class="kbd" :class="`kbd-${tone}`"><slot /></kbd>
</template>

<style scoped>
.kbd {
  display: inline-grid;
  place-items: center;
  flex: none;
  height: var(--h-kbd);
  min-width: var(--h-kbd);
  padding: 0 var(--space-1);
  border-radius: 5px;
  background: var(--kbd-bg);
  color: var(--ink-3);
  font: var(--weight-medium) var(--text-11) var(--font-mono);
}

/* On the dark button the key is a lighter chip of the button itself. */
.kbd-on-button {
  background: var(--kbd-on-btn);
  color: color-mix(in srgb, var(--btn-ink) 75%, transparent);
}

.kbd-on-menu {
  background: var(--kbd-on-menu);
}

.kbd-on-glass {
  background: var(--kbd-on-glass);
}

/* Inside a filled field (surface-1) the key steps one tone further. */
.kbd-on-field {
  background: var(--surface-3);
}
</style>
