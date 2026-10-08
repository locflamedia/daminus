<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import UiSwitch from '@/ui/UiSwitch.vue'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const { t } = useI18n()
const settings = useSettingsStore()
</script>

<template>
  <SettingsCard :title="t('settingsAppearance.little.title')" tight>
    <SettingsRow
      :title="t('settingsAppearance.little.clearSky')"
      :hint="t('settingsAppearance.little.clearSkyHint')"
    >
      <template #lead>
        <svg class="star" width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
          <circle r="8" opacity=".25" />
          <path d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8Z" />
        </svg>
      </template>
      <UiSwitch
        :model-value="settings.appearance.clear_sky"
        :aria-label="t('settingsAppearance.little.clearSky')"
        @update:model-value="settings.setAppearanceFlag('clear_sky', $event)"
      />
    </SettingsRow>
    <SettingsRow
      :title="t('settingsAppearance.little.streak')"
      :hint="t('settingsAppearance.little.streakHint')"
    >
      <template #lead>
        <span class="streak" aria-hidden="true">{{
          t('settingsAppearance.little.streakSample')
        }}</span>
      </template>
      <UiSwitch
        :model-value="settings.appearance.streak_badge"
        :aria-label="t('settingsAppearance.little.streak')"
        @update:model-value="settings.setAppearanceFlag('streak_badge', $event)"
      />
    </SettingsRow>
    <SettingsRow
      :title="t('settingsAppearance.little.chime')"
      :hint="t('settingsAppearance.little.chimeHint')"
    >
      <template #lead>
        <svg class="line" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 6h2.5L9 3v10L5.5 10H3z M11.5 6a3 3 0 0 1 0 4" />
        </svg>
      </template>
      <UiSwitch
        :model-value="settings.appearance.completion_chime"
        :aria-label="t('settingsAppearance.little.chime')"
        @update:model-value="settings.setAppearanceFlag('completion_chime', $event)"
      />
    </SettingsRow>
    <SettingsRow
      :title="t('settingsAppearance.little.eggs')"
      :hint="t('settingsAppearance.little.eggsHint')"
    >
      <template #lead>
        <svg class="line egg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 2c2.6 0 4.5 4 4.5 7a4.5 4.5 0 0 1-9 0c0-3 1.9-7 4.5-7z M5.5 9.5l1.5-1 1.5 1 1.5-1 1 .7"
          />
        </svg>
      </template>
      <UiSwitch
        :model-value="settings.appearance.easter_eggs"
        :aria-label="t('settingsAppearance.little.eggs')"
        @update:model-value="settings.setAppearanceFlag('easter_eggs', $event)"
      />
    </SettingsRow>
  </SettingsCard>
</template>

<style scoped>
.star {
  fill: var(--chart-amber);
}

.star circle {
  fill: var(--chart-amber-soft);
}

.streak {
  color: var(--ok-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-semibold);
}

.line {
  fill: none;
  stroke: var(--ink-3);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.egg {
  stroke: var(--chart-lilac);
}
</style>
