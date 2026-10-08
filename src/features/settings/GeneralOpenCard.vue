<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { IntroMode } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import UiSeg, { type SegOption } from '@/ui/UiSeg.vue'
import UiSwitch from '@/ui/UiSwitch.vue'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const { t } = useI18n()
const settings = useSettingsStore()

const INTRO: readonly IntroMode[] = ['first_launch', 'always', 'never']
const INTRO_KEY: Record<IntroMode, string> = {
  first_launch: 'first',
  always: 'always',
  never: 'never',
}

const introOptions = computed<SegOption[]>(() =>
  INTRO.map((value) => ({ value, label: t(`settingsGeneral.open.${INTRO_KEY[value]}`) })),
)

function pickIntro(value: string) {
  const mode = INTRO.find((m) => m === value)
  if (mode) settings.setIntro(mode)
}
</script>

<template>
  <SettingsCard :title="t('settingsGeneral.open.title')" tight>
    <SettingsRow :title="t('settingsGeneral.open.scan')" :hint="t('settingsGeneral.open.scanHint')">
      <UiSwitch
        :model-value="settings.general.scan_on_open"
        :aria-label="t('settingsGeneral.open.scan')"
        @update:model-value="settings.setScanOnOpen"
      />
    </SettingsRow>
    <SettingsRow
      :title="t('settingsGeneral.open.intro')"
      :hint="t('settingsGeneral.open.introHint')"
    >
      <UiSeg
        :model-value="settings.general.intro"
        :options="introOptions"
        :label="t('settingsGeneral.open.introGroup')"
        semantics="radio"
        @update:model-value="pickIntro"
      />
    </SettingsRow>
  </SettingsCard>
</template>
