<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { LOCALES } from '@/i18n'
import { useLayoutRange } from '@/lib/viewport'
import { useDataStore } from '@/stores/data'
import { groupsOn } from '@/lib/scan-settings'
import { useScanSettingsStore } from '@/stores/scan-settings'
import { useSettingsStore } from '@/stores/settings'
import { useSetupStore } from '@/stores/setup'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import { BRAND_TITLES } from '@/ui/brand-marks'
import { useAiModelMark } from './use-ai-provider-name'
import { SETTINGS_SECTIONS } from './settings-sections'

const { t } = useI18n()
const router = useRouter()
const settings = useSettingsStore()
const scan = useScanSettingsStore()
const setup = useSetupStore()
const data = useDataStore()
const range = useLayoutRange()
const route = useRoute()
const aiMark = useAiModelMark()
/** Board 09: the AI providers section keeps a card at the bottom on where the keys are kept. */
const onAi = computed(() => route.params.section === 'ai')

/**
 * Right-hand hint of an item: the current value, where the app already knows it. Below 1080 px
 * the column keeps its labels and drops the values.
 */
/** "12 of 20": the scans kept and the limit, once the core has told how many there are. */
const dataHint = computed((): Record<string, string> => {
  const scans = data.usage?.scans
  if (scans === undefined) return {}
  const keep = data.retention.keep_scans
  return {
    data: keep === null ? String(scans) : t('settingsData.navHint', { used: scans, limit: keep }),
  }
})

const hints = computed((): Record<string, string> => {
  if (range.value === 'narrow') return {}
  return {
    general: LOCALES.map((l) => l.toUpperCase()).join(' / '),
    appearance: t(`theme.${settings.theme}`),
    scan: t('settingsNav.scanValue', { n: groupsOn(scan.scan), total: 6 }),
    hosts: setup.listing ? String(setup.entries.length) : '',
    ai: aiMark.value ? BRAND_TITLES[aiMark.value] : '',
    ...dataHint.value,
    about: `v${__APP_VERSION__}`,
  }
})

function leave() {
  void router.push('/')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !e.defaultPrevented) leave()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void data.load()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <nav class="settings-nav" :aria-label="t('settingsNav.title')">
    <span class="lights" aria-hidden="true" />
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

    <aside v-if="onAi" class="keys">
      <span class="keys-title"><UiIcon name="lock" />{{ t('settingsNav.keysTitle') }}</span>
      <i18n-t keypath="settingsNav.keysBody" tag="span" scope="global">
        <template #service><span class="mono">dev.daminus.app</span></template>
      </i18n-t>
    </aside>
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
  line-height: normal;
}

.lights {
  flex: none;
  height: var(--lights-row);
}

:global(:root[data-fullscreen='true']) .lights {
  display: none;
}

:global(:root[data-fullscreen='true']) .settings-nav {
  padding-top: var(--side-top-fullscreen);
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
.keys {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: auto;
  padding: var(--space-3);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

.keys-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.keys-title .icon {
  color: var(--ink-3);
}

.keys .mono {
  color: var(--ink-2);
  font-family: var(--font-mono);
}
</style>
