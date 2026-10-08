<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { IntroMode } from '@/api'
import { useReducedMotion } from '@/lib/motion'
import { useSettingsStore } from '@/stores/settings'
import UiSeg, { type SegOption } from '@/ui/UiSeg.vue'
import UiSwitch from '@/ui/UiSwitch.vue'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const INTRO: readonly { value: IntroMode; key: string }[] = [
  { value: 'first_launch', key: 'first' },
  { value: 'always', key: 'always' },
  { value: 'never', key: 'never' },
]

const { t } = useI18n()
const settings = useSettingsStore()
const reduced = useReducedMotion()

const reduceHint = computed(() =>
  t(reduced.value ? 'settingsAppearance.motion.reduceOn' : 'settingsAppearance.motion.reduceOff'),
)

const introOptions = computed<SegOption[]>(() =>
  INTRO.map((o) => ({ value: o.value, label: t(`settingsAppearance.motion.${o.key}`) })),
)

function pickIntro(value: string) {
  const mode = INTRO.find((o) => o.value === value)
  if (mode) settings.setIntro(mode.value)
}
</script>

<template>
  <SettingsCard :title="t('settingsAppearance.motion.title')" tight>
    <SettingsRow :title="t('settingsAppearance.motion.reduce')" :hint="reduceHint">
      <span class="system">{{ t('settingsAppearance.motion.reduceValue') }}</span>
    </SettingsRow>
    <SettingsRow
      :title="t('settingsAppearance.motion.intro')"
      :hint="t('settingsAppearance.motion.introHint')"
    >
      <UiSeg
        :model-value="settings.general.intro"
        :options="introOptions"
        :label="t('settingsAppearance.motion.introGroup')"
        semantics="radio"
        @update:model-value="pickIntro"
      />
    </SettingsRow>
    <SettingsRow
      :title="t('settingsAppearance.motion.transparency')"
      :hint="t('settingsAppearance.motion.transparencyHint')"
    >
      <UiSwitch
        :model-value="settings.appearance.reduce_transparency"
        :aria-label="t('settingsAppearance.motion.transparency')"
        @update:model-value="settings.setAppearanceFlag('reduce_transparency', $event)"
      />
    </SettingsRow>
    <SettingsRow
      :title="t('settingsAppearance.motion.charts')"
      :hint="t('settingsAppearance.motion.chartsHint')"
    >
      <UiSwitch
        :model-value="settings.appearance.animate_charts"
        :aria-label="t('settingsAppearance.motion.charts')"
        @update:model-value="settings.setAppearanceFlag('animate_charts', $event)"
      />
    </SettingsRow>
  </SettingsCard>
</template>

<style scoped>
.system {
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
