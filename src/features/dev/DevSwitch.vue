<!--
  Development only: switches theme and language from the corner while the Settings screens
  are not built. It is not rendered in a production build.
-->
<script setup lang="ts">
import { LOCALES } from '@/i18n'
import { THEMES } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <div class="dev-switch">
    <button
      v-for="theme in THEMES"
      :key="theme"
      type="button"
      :class="{ on: settings.theme === theme }"
      @click="settings.setTheme(theme)"
    >
      {{ theme }}
    </button>
    <span class="gap" />
    <button
      v-for="locale in LOCALES"
      :key="locale"
      type="button"
      :class="{ on: settings.language === locale }"
      @click="settings.setLanguage(locale)"
    >
      {{ locale }}
    </button>
  </div>
</template>

<style scoped>
.dev-switch {
  position: fixed;
  right: var(--space-3);
  bottom: var(--space-3);
  z-index: 50;
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-sm);
  background: var(--btn);
  box-shadow: var(--shadow-overlay);
  font-size: var(--text-11);
}

.dev-switch button {
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: 7px;
  color: var(--btn-ink);
  opacity: 0.6;
}

.dev-switch button.on {
  background: var(--kbd-on-btn);
  opacity: 1;
}

.gap {
  width: var(--space-2);
}
</style>
