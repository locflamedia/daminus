<!--
  "Why plain ssh?", said once, in the sidebar of the help screen: Daminus uses the same ssh files
  as Terminal and never stores keys, so ssh set up once works with every tool.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/ui/UiIcon.vue'

const { t } = useI18n()
</script>

<template>
  <aside class="why">
    <b><UiIcon name="key" :size="14" />{{ t('empty.sidebar.plainSshTitle') }}</b>
    <span>{{ t('empty.sidebar.plainSshBody') }}</span>
  </aside>
</template>

<style scoped>
.why {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--side-card);
}

b {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

b :deep(svg) {
  color: var(--ink-3);
}

span {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.5;
}
</style>
