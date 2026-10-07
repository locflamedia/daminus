<script setup lang="ts">
defineProps<{
  title: string
  /** Scan number and age, e.g. `Scan #12 · today 13:42`. */
  meta?: string
}>()
// The `meta` slot replaces the text when part of it is set in the mono face (the elapsed time).
</script>

<template>
  <header class="page-header">
    <div class="titles">
      <b class="title">{{ title }}</b>
      <span v-if="meta || $slots.meta" class="meta">
        <slot name="meta">{{ meta }}</slot>
      </span>
    </div>
    <span class="grow" />
    <slot name="actions" />
  </header>
</template>

<style scoped>
.page-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
  height: 72px;
}

/* The header sits over the page's drag strip: only its controls take the pointer, so the
   blank space and the title still drag the window. */
.page-header {
  pointer-events: none;
}

.page-header > :not(.titles, .grow) {
  pointer-events: auto;
}

.titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.title {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.meta {
  color: var(--ink-3);
  font-size: var(--text-12);
  white-space: nowrap;
}

.meta :deep(.mono) {
  font-size: inherit;
}

.grow {
  flex-grow: 1;
}

/* Narrow window: a shorter bar with the title and its meta on one line. */
[data-range='narrow'] .page-header {
  height: 64px;
}

[data-range='narrow'] .titles {
  flex-direction: row;
  align-items: baseline;
  gap: 10px;
}

[data-range='narrow'] .title {
  font-size: 18px;
  letter-spacing: var(--track-20);
}
</style>
