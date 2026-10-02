<!--
  A list of rows separated by tone, not by lines: with `zebra` every second row is surface-1
  and rows sit 2 px apart. A header row counts as the first row, so the first data row under
  it is the tinted one, as on the boards. Put `UiRow as="li"` inside (the default `ul`), or
  rows of any kind in a `div`.
-->
<script setup lang="ts">
withDefaults(defineProps<{ zebra?: boolean; as?: 'ul' | 'ol' | 'div'; label?: string }>(), {
  zebra: true,
  as: 'ul',
  label: undefined,
})
</script>

<template>
  <component :is="as" class="list" :class="{ zebra }" :aria-label="label">
    <slot />
  </component>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.zebra > :deep(:nth-child(even):not([data-flat])) {
  background: var(--surface-1);
}
</style>
