<!--
  Settings › Scan, "Disk usage" and the three other thresholds: where a number turns amber and
  red. They are the same for every server; a project can set its own in its sheet. A change
  moves the results at once, because the report is evaluated again, not scanned again.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CERT_STEPS_DAYS,
  MEMORY_STEPS,
  RESTART_STEPS,
  certDays,
  diskBand,
  memoryStep,
  restartStep,
} from '@/lib/scan-settings'
import { useScanSettingsStore } from '@/stores/scan-settings'
import UiSeg, { type SegOption } from '@/ui/UiSeg.vue'
import ScanDiskSlider from './ScanDiskSlider.vue'
import SettingsRow from './SettingsRow.vue'

const { t } = useI18n()
const store = useScanSettingsStore()

const band = computed(() => diskBand(store.scan.thresholds))
const memory = computed<SegOption[]>(() =>
  MEMORY_STEPS.map((n) => ({ value: String(n), label: `${n}%` })),
)
const days = computed<SegOption[]>(() =>
  CERT_STEPS_DAYS.map((n) => ({ value: String(n), label: t('settingsScan.disk.days', { n }) })),
)
const restarts = computed<SegOption[]>(() =>
  RESTART_STEPS.map((n) => ({ value: String(n), label: String(n) })),
)
</script>

<template>
  <section class="card" :aria-labelledby="'scan-disk-title'">
    <h3 id="scan-disk-title" class="title">{{ t('settingsScan.disk.title') }}</h3>
    <p class="hint">{{ t('settingsScan.disk.hint') }}</p>
    <ScanDiskSlider :warn="band.warn" :crit="band.crit" @change="store.setDisk" />
    <SettingsRow :title="t('settingsScan.disk.memory')">
      <UiSeg
        :model-value="String(memoryStep(store.scan.thresholds))"
        :options="memory"
        :label="t('settingsScan.disk.memory')"
        semantics="radio"
        @update:model-value="(v: string) => store.setMemory(Number(v))"
      />
    </SettingsRow>
    <SettingsRow :title="t('settingsScan.disk.cert')">
      <UiSeg
        :model-value="String(certDays(store.scan.thresholds))"
        :options="days"
        :label="t('settingsScan.disk.cert')"
        semantics="radio"
        @update:model-value="(v: string) => store.setCertDays(Number(v))"
      />
    </SettingsRow>
    <SettingsRow :title="t('settingsScan.disk.restarts')">
      <UiSeg
        :model-value="String(restartStep(store.scan.thresholds))"
        :options="restarts"
        :label="t('settingsScan.disk.restarts')"
        semantics="radio"
        @update:model-value="(v: string) => store.setRestarts(Number(v))"
      />
    </SettingsRow>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: var(--space-5);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-seg);
}

.title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.hint {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
