<!--
  "Issues per scan", from the board "Scan history": one stacked column per scan (critical at
  the bottom, then warning and info), the two scans being compared solid and the rest faded,
  each column's number under it. Every column has the same words as a title and, with the
  chart focused, the arrow keys read it out.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScanSummary } from '@/api'
import { issueCounts, type ProjectFilter } from '@/lib/scan-history-chart'
import { useSettingsStore } from '@/stores/settings'
import UiChartLegend from '@/ui/UiChartLegend.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiIssueColumns, { type IssueScan } from '@/ui/UiIssueColumns.vue'
import { columnTip, describeCounts } from './history-text'

const props = defineProps<{
  scans: readonly ScanSummary[]
  filter: ProjectFilter
  compared: readonly number[]
  scope: string
}>()

const { t } = useI18n()
const settings = useSettingsStore()

const columns = computed<IssueScan[]>(() =>
  props.scans.map((scan) => {
    const counts = issueCounts(scan, props.filter)
    return {
      ...counts,
      id: String(scan.seq),
      label: `#${scan.seq}`,
      description: describeCounts(counts, settings.language),
      tip: columnTip(scan.seq, scan.started_at, counts, settings.language),
    }
  }),
)

const legend = computed(() => [
  {
    color: 'issue-crit' as const,
    text: t('historyScreen.chart.critical'),
    shape: 'square' as const,
  },
  {
    color: 'issue-warn' as const,
    text: t('historyScreen.chart.warning'),
    shape: 'square' as const,
  },
  { color: 'issue-info' as const, text: t('historyScreen.chart.info'), shape: 'square' as const },
])
</script>

<template>
  <section class="card">
    <h3 class="head">
      <UiIcon name="clock" :size="16" class="mark" />
      {{ t('historyScreen.chart.title') }}
      <UiChartLegend class="legend" size="small" :items="legend" />
    </h3>
    <UiIssueColumns
      :scans="columns"
      :compared="compared.map(String)"
      :label="t('historyScreen.chart.label', { n: scans.length })"
      :once="`${scope}:columns`"
    />
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  padding: var(--space-4) var(--space-4) var(--space-8);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

/* The scan numbers hang below the columns inside the card's own 32 px bottom padding. */
.card :deep(.well) {
  --cursor-bottom: 0;

  padding-bottom: 0;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.mark {
  flex: none;
  color: var(--ink-3);
}

.legend {
  margin-left: auto;
  font-weight: var(--weight-regular);
}
</style>
