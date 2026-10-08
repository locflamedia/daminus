<!--
  "Backups": whether the folder is part of Time Machine and that iCloud does not sync it.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/ui/UiIcon.vue'
import SettingsCard from './SettingsCard.vue'

const { t } = useI18n()
</script>

<template>
  <SettingsCard :title="t('settingsData.backups.title')" tight class="compact">
    <div class="row">
      <UiIcon name="check" :size="14" :stroke="2" class="ok" />
      {{ t('settingsData.backups.timeMachine') }}
    </div>
    <div class="row">
      <UiIcon name="close" :size="14" :stroke="2" class="off" />
      {{ t('settingsData.backups.icloud') }}
      <span class="value">{{ t('settingsData.backups.icloudValue') }}</span>
    </div>
  </SettingsCard>
</template>

<style scoped>
.compact {
  padding: var(--space-4);
  line-height: 1.3;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 30px;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.ok {
  flex: none;
  color: var(--ok-ink);
}

.off {
  flex: none;
  color: var(--ink-3);
}

.value {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
