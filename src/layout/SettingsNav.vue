<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import { SETTINGS_SECTIONS } from './settings-sections'

const { t } = useI18n()
const router = useRouter()
const settings = useSettingsStore()

/** Right-hand hint of an item: the current value, where the app already knows it. */
const hints = computed<Record<string, string>>(() => ({
  general: t(`language.${settings.language}`),
  appearance: t(`theme.${settings.theme}`),
}))

function leave() {
  void router.push('/')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !e.defaultPrevented) leave()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <nav class="settings-nav" :aria-label="t('settingsNav.title')">
    <button type="button" class="back" @click="leave">
      <UiIcon name="chevron-left" />
      <b>{{ t('settingsNav.title') }}</b>
      <UiKbd tone="on-glass">esc</UiKbd>
    </button>

    <div class="list">
      <RouterLink
        v-for="s in SETTINGS_SECTIONS"
        :key="s.id"
        :to="{ name: 'settings', params: { section: s.id } }"
        class="item"
        active-class="on"
      >
        <UiIcon :name="s.icon" />
        {{ t(`settingsNav.${s.id}`) }}
        <span v-if="hints[s.id]" class="hint">{{ hints[s.id] }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.settings-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  height: 100%;
  min-width: 0;
  padding: var(--space-4);
  overflow-y: auto;
  background: linear-gradient(165deg, var(--side-1), var(--side-2) 58%, var(--side-3));
}

.back {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  height: var(--h-control);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: var(--text-13);
  text-align: left;
}

.back b {
  color: var(--ink);
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.back .kbd {
  margin-left: auto;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: var(--text-13);
  white-space: nowrap;
  transition:
    background-color var(--dur-color) var(--ease-state),
    color var(--dur-color) var(--ease-state);
}

.item .icon {
  color: var(--ink-3);
}

.item:hover {
  background: var(--side-hover);
}

.item.on {
  background: var(--surface-0);
  color: var(--ink);
  box-shadow: var(--shadow-lift);
}

.item.on .icon {
  color: var(--accent);
}

.hint {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
