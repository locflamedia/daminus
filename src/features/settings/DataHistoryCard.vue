<!--
  "History": how many scans to keep (the count used sits under the label) and when the text
  of AI replies is forgotten. A choice is saved at once.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FORGET_CHOICES, KEEP_CHOICES, choiceLimit, choiceValue } from '@/lib/data-view'
import { useDataStore } from '@/stores/data'
import UiSeg, { type SegOption } from '@/ui/UiSeg.vue'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const { t } = useI18n()
const data = useDataStore()

const keepOptions = computed<SegOption[]>(() => [
  ...KEEP_CHOICES.map((n) => ({ value: String(n), label: String(n) })),
  { value: 'all', label: t('settingsData.history.all') },
])

const forgetOptions = computed<SegOption[]>(() => [
  ...FORGET_CHOICES.map((n) => ({
    value: String(n),
    label: t('settingsData.history.days', { n }),
  })),
  { value: 'all', label: t('settingsData.history.never') },
])

const used = computed(() => data.usage?.scans ?? 0)
const keepHint = computed(() =>
  data.retention.keep_scans === null
    ? t('settingsData.history.keepAllHint', { used: used.value })
    : t('settingsData.history.keepHint', { used: used.value, limit: data.retention.keep_scans }),
)
</script>

<template>
  <SettingsCard :title="t('settingsData.history.title')" tight>
    <SettingsRow :title="t('settingsData.history.keep')" :hint="keepHint">
      <UiSeg
        :model-value="choiceValue(data.retention.keep_scans)"
        :options="keepOptions"
        :label="t('settingsData.history.keepGroup')"
        semantics="radio"
        :inert="!data.loaded"
        @update:model-value="(v) => data.setKeep(choiceLimit(v))"
      />
    </SettingsRow>
    <SettingsRow
      :title="t('settingsData.history.forget')"
      :hint="t('settingsData.history.forgetHint')"
    >
      <UiSeg
        :model-value="choiceValue(data.retention.forget_ai_after_days)"
        :options="forgetOptions"
        :label="t('settingsData.history.forgetGroup')"
        semantics="radio"
        :inert="!data.loaded"
        @update:model-value="(v) => data.setForget(choiceLimit(v))"
      />
    </SettingsRow>
  </SettingsCard>
</template>
