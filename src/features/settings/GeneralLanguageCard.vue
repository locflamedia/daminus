<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type Locale, isLocale } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import UiSeg, { type SegOption } from '@/ui/UiSeg.vue'
import UiSelect from '@/ui/UiSelect.vue'
import { LANGUAGE_OPTIONS } from './languages'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const emit = defineEmits<{ changed: [locale: Locale] }>()

const { t } = useI18n()
const settings = useSettingsStore()

const SAME = 'same'

const aiOptions = computed<SegOption[]>(() => [
  { value: SAME, label: t('settingsGeneral.language.aiSame') },
  { value: 'en', label: t('language.en') },
  { value: 'vi', label: t('language.vi') },
])

const aiValue = computed(() => settings.general.ai_language ?? SAME)

function pick(value: string) {
  if (!isLocale(value) || value === settings.language) return
  settings.setLanguage(value)
  emit('changed', value)
}

function pickAi(value: string) {
  settings.setAiLanguage(isLocale(value) ? value : null)
}
</script>

<template>
  <SettingsCard :title="t('settingsGeneral.language.title')">
    <div class="app">
      <div class="words">
        <b class="name">{{ t('settingsGeneral.language.app') }}</b>
        <span class="hint">{{ t('settingsGeneral.language.appHint') }}</span>
      </div>
      <UiSelect
        class="select"
        :model-value="settings.language"
        variant="language"
        :options="[...LANGUAGE_OPTIONS]"
        :accessible-name="t('settingsGeneral.language.app')"
        :search-placeholder="t('settingsGeneral.language.search')"
        :pending-label="t('settingsGeneral.language.notTranslated')"
        :pending-hint="t('settingsGeneral.language.notTranslatedHint')"
        :help-label="t('settingsGeneral.language.help')"
        :empty-label="t('settingsGeneral.language.none')"
        @update:model-value="pick"
      />
    </div>
    <SettingsRow
      :title="t('settingsGeneral.language.ai')"
      :hint="t('settingsGeneral.language.aiHint')"
    >
      <UiSeg
        :model-value="aiValue"
        :options="aiOptions"
        :label="t('settingsGeneral.language.aiGroup')"
        semantics="radio"
        @update:model-value="pickAi"
      />
    </SettingsRow>
  </SettingsCard>
</template>

<style scoped>
.app {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: var(--space-4);
  align-items: center;
}

.words {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.hint {
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

@container (max-width: 560px) {
  .app {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
