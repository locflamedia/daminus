<!--
  "Why not read Termius?", said once, in the sidebar of the help screen: its vault is private
  and encrypted, and plain ssh files work with every tool. Shown only when Termius is installed.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiBrandMark from '@/ui/UiBrandMark.vue'

const { t } = useI18n()
</script>

<template>
  <aside class="why">
    <b><UiBrandMark name="termius" :size="14" />{{ t('empty.sidebar.termiusTitle') }}</b>
    <span>{{ t('empty.sidebar.termiusBody') }}</span>
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

span {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.5;
}
</style>
