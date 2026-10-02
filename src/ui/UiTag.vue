<!--
  Tag, from the board "Components": a 22 px, radius 6 label for a fact about a project
  (Laravel 11, Postgres 16, pm2), where a chip is a state. An optional 6 px dot before
  the word carries the technology's own colour, passed as a CSS colour by the caller (brand
  colours are data, not tokens). `mono` is for keys and names you could paste (DB_HOST);
  `plain` is the white tag for use on a grey well.
-->
<script setup lang="ts">
withDefaults(defineProps<{ swatch?: string; mono?: boolean; plain?: boolean }>(), {
  swatch: undefined,
  mono: false,
  plain: false,
})
</script>

<template>
  <span class="tag" :class="{ mono, plain }">
    <span v-if="swatch" class="swatch" :style="{ background: swatch }" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.tag {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  flex: none;
  height: var(--h-chip);
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
}

.plain {
  background: var(--surface-0);
}

.mono {
  font-family: var(--font-mono);
  font-weight: var(--weight-regular);
}

.swatch {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
}
</style>
