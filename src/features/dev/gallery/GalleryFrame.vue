<!--
  A board-style section of the gallery: a glass tray holding a white card with a title, an
  optional line of text and the spec values the canvas gives for it.
-->
<script setup lang="ts">
defineProps<{ title: string; text?: string; spec?: string }>()
</script>

<template>
  <section class="tray">
    <div class="card">
      <header class="head">
        <div class="titles">
          <h2 class="title">{{ title }}</h2>
          <p v-if="text" class="text">{{ text }}</p>
        </div>
        <span v-if="spec" class="spec mono">{{ spec }}</span>
      </header>
      <slot />
    </div>
  </section>
</template>

<style scoped>
.tray {
  display: flex;
  min-width: 0;
  padding: 6px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-0) 55%, transparent);
}

.card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  padding: var(--frame-pad, var(--space-4));
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1) var(--space-4);
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
}

.text {
  max-width: 80ch;
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.spec {
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
