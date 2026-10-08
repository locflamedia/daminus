<!--
  "On this Mac": the app's folder, how much it holds and in how many JSON files, and a bar of
  the share of each kind (scan results, AI replies, logs).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMeasure } from '@/lib/format'
import { partsOf, totalBytes } from '@/lib/data-view'
import { useDataStore } from '@/stores/data'
import UiStackedBar, { type StackPart } from '@/ui/UiStackedBar.vue'
import DataCard from './DataCard.vue'

const { t } = useI18n()
const data = useDataStore()

const size = (bytes: number) => formatMeasure(bytes, 'bytes').text

const total = computed(() => (data.usage ? size(totalBytes(data.usage)) : '—'))

const parts = computed<StackPart[]>(() => {
  if (!data.usage) return []
  const p = partsOf(data.usage)
  return [
    { id: 'scans', label: t('settingsData.storage.scans'), value: p.scans, display: size(p.scans) },
    { id: 'ai', label: t('settingsData.storage.ai'), value: p.ai, display: size(p.ai) },
    { id: 'logs', label: t('settingsData.storage.logs'), value: p.logs, display: size(p.logs) },
  ]
})
</script>

<template>
  <DataCard :title="t('settingsData.storage.title')" icon="database" :aside="data.usage?.path" mono>
    <div class="figure">
      <b class="total">{{ total }}</b>
      <span class="kind">{{ t('settingsData.storage.kind', { n: data.usage?.files ?? 0 }) }}</span>
    </div>
    <UiStackedBar :parts="parts" :label="t('settingsData.storage.bar')" />
  </DataCard>
</template>

<style scoped>
.figure {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.total {
  font-size: 26px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.03em;
}

.kind {
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
