<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/ui/UiIcon.vue'

const { t } = useI18n()
</script>

<template>
  <span class="note"><UiIcon name="clock" :size="12" />{{ t('projectDatabase.mysqlNote') }}</span>
</template>

<style scoped>
.note {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
