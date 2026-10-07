<!--
  Scan history, from the board "Scan history": every kept scan across projects. A stacked
  column per scan, a plain tally since the first one, the list, and what changed between any
  two. The project filter narrows the chart, the list and the compare card together. States:
  reading, unreadable, and no scan yet. Export is not drawn: no command writes one.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorText } from '@/lib/issue-text'
import { formatDate } from '@/lib/format'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import { useSettingsStore } from '@/stores/settings'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiSeg from '@/ui/UiSeg.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import HistoryChartCard from './HistoryChartCard.vue'
import HistoryCompareCard from './HistoryCompareCard.vue'
import HistoryListCard from './HistoryListCard.vue'
import HistoryTallyCard from './HistoryTallyCard.vue'
import { useHistoryData } from './use-history-data'

const { t } = useI18n()
const settings = useSettingsStore()
const scan = useScanStore()
const reports = useReportStore()
const data = useHistoryData()
const { history } = data

const view = computed(() => history.view)
const empty = computed(() => view.value !== null && view.value.scans.length === 0)
const loading = computed(() => view.value === null && history.error === null)
const failed = computed(() => (view.value === null && history.error ? history.error : null))

const options = computed(() => [
  { value: '', label: t('historyScreen.filter.all') },
  ...data.ids.value.map((id) => ({ value: id, label: id })),
])

/** "12 scans since 15 Sep · keeping the last 20". */
const retention = computed(() => {
  const all = view.value?.scans ?? []
  const first = all[0]
  if (!first) return ''
  const keep = view.value?.keep
  return [
    t(
      'historyScreen.retention.count',
      { n: all.length, date: formatDate(first.started_at, settings.language) },
      all.length,
    ),
    keep == null
      ? t('historyScreen.retention.keepingAll')
      : t('historyScreen.retention.keeping', { n: keep }),
  ].join(' · ')
})

const scope = computed(() => String(reports.latest?.seq ?? 'none'))
</script>

<template>
  <div class="history">
    <header class="top">
      <b class="title">{{ t('historyScreen.title') }}</b>
      <span class="meta">{{ retention }}</span>
      <span class="grow" />
      <UiSeg
        v-if="data.ids.value.length > 0"
        :model-value="data.filter.value ?? ''"
        :options="options"
        :label="t('historyScreen.filter.label')"
        @update:model-value="data.filter.value = $event === '' ? null : $event"
      />
    </header>

    <div v-if="loading" class="reading" role="status">
      <UiSkeleton height="210px" radius="16px" tone="soft" />
      <UiSkeleton height="260px" radius="16px" tone="soft" />
    </div>

    <UiBanner
      v-else-if="failed"
      tone="crit"
      icon="critical"
      alert
      :title="t('historyScreen.failed.title')"
      :text="errorText(failed)"
    >
      <template #trailing>
        <UiButton size="small" @click="data.reload()">{{
          t('historyScreen.failed.retry')
        }}</UiButton>
      </template>
    </UiBanner>

    <UiEmptyState
      v-else-if="empty"
      icon="clock"
      :title="t('historyScreen.empty.title')"
      :text="t('historyScreen.empty.text')"
    >
      <UiButton variant="primary" :disabled="scan.scanning" @click="scan.start()">
        {{ t('historyScreen.empty.scan') }}
      </UiButton>
    </UiEmptyState>

    <template v-else>
      <div class="top-row">
        <HistoryChartCard
          :scans="data.shown.value.scans"
          :filter="data.filter.value"
          :compared="data.selection.value"
          :scope="scope"
        />
        <HistoryTallyCard
          :tally="data.sums.value"
          :runs="data.runs.value"
          :since="data.shown.value.scans[0]?.seq ?? 1"
        />
      </div>
      <div class="bottom-row">
        <HistoryListCard
          :rows="data.rows.value"
          :total="data.shown.value.total"
          :selection="data.selection.value"
          :scope="scope"
          @toggle="data.toggle"
        />
        <HistoryCompareCard
          :compare="data.compare.value"
          :selected="data.selection.value.length"
          :reverse="data.reverse.value"
          :reading="data.reading.value"
          :scope="scope"
          @reverse="data.reverse.value = $event"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.top {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
  height: 72px;
  pointer-events: none;
}

.top > :not(.title, .meta, .grow) {
  pointer-events: auto;
}

.title {
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-20);
}

.meta {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.grow {
  flex-grow: 1;
}

.reading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.top-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: var(--space-3);
}

.bottom-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (max-width: 1100px) {
  .top-row,
  .bottom-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
