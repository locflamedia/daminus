<!--
  Settings › Scan, "What to check": the six groups of checks, each with the commands it turns on
  in mono under its name, so the switch says what it really turns off. "Saved" ticks by the title
  for a moment after any change of the section.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SCAN_GROUPS, type ScanGroup } from '@/lib/scan-settings'
import { useScanSettingsStore } from '@/stores/scan-settings'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'
import UiSwitch from '@/ui/UiSwitch.vue'
import SettingsCard from './SettingsCard.vue'

const { t } = useI18n()
const store = useScanSettingsStore()

const ICONS: Record<ScanGroup, IconName> = {
  disk: 'disk',
  containers: 'container',
  databases: 'database',
  security: 'shield',
  uptime: 'globe',
  code_changes: 'file',
}

const KEYS: Record<ScanGroup, string> = {
  disk: 'disk',
  containers: 'containers',
  databases: 'databases',
  security: 'security',
  uptime: 'uptime',
  code_changes: 'code',
}

function on(group: ScanGroup): boolean {
  return !store.scan.disabled_groups.includes(group)
}
</script>

<template>
  <SettingsCard :title="t('settingsScan.checks.title')" tight>
    <template #after>
      <Transition name="saved">
        <span v-if="store.saved" class="saved" role="status">
          <UiIcon name="check" :size="12" :stroke="2" />{{ t('settingsScan.saved') }}
        </span>
      </Transition>
    </template>
    <div v-for="group in SCAN_GROUPS" :key="group" class="row">
      <span class="tile" aria-hidden="true"><UiIcon :name="ICONS[group]" /></span>
      <div class="words">
        <b class="name">{{ t(`settingsScan.groups.${KEYS[group]}.name`) }}</b>
        <span class="mono hint">{{ t(`settingsScan.groups.${KEYS[group]}.hint`) }}</span>
      </div>
      <UiSwitch
        :model-value="on(group)"
        :aria-label="t(`settingsScan.groups.${KEYS[group]}.name`)"
        @update:model-value="(v: boolean) => store.setGroup(group, v)"
      />
    </div>
  </SettingsCard>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: center;
  min-height: 50px;
}

.tile {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-well);
  color: var(--ink-2);
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
  font-size: var(--text-11);
  line-height: 1.45;
}

.saved {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--ok-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.saved-enter-active,
.saved-leave-active {
  transition:
    opacity var(--dur-state) var(--ease-out),
    transform var(--dur-state) var(--ease-out);
}

.saved-enter-from,
.saved-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
