<!--
  The four keys of this screen: Return imports, N adds a host, K searches, comma opens
  Settings. Only Return and N are wired here; the other two belong to the window.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiKbd from '@/ui/UiKbd.vue'

const { t } = useI18n()
</script>

<template>
  <section class="keys" :aria-label="t('empty.keyboard.title')">
    <span class="title">{{ t('empty.keyboard.title') }}</span>
    <div class="row">
      <span><UiKbd tone="on-glass">⏎</UiKbd>{{ t('empty.keyboard.import') }}</span>
      <span><UiKbd tone="on-glass">⌘N</UiKbd>{{ t('empty.keyboard.addHost') }}</span>
      <span><UiKbd tone="on-glass">⌘K</UiKbd>{{ t('nav.search') }}</span>
      <span><UiKbd tone="on-glass">⌘,</UiKbd>{{ t('nav.settings') }}</span>
    </div>
  </section>
</template>

<style scoped>
.keys {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.title {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: normal;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: var(--h-row);
  color: var(--ink-2);
  font-size: var(--text-12);
}

.row span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
