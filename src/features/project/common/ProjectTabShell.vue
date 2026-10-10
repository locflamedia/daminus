<!--
  The states every project tab shares, so each tab only draws its normal body (board 30,
  "Result screens · shared states"): a skeleton while the report is read, the error with Try
  again, a group switched off in Settings, no part of that kind, no result before the first scan
  (with a scan of this project), hosts that did not answer, and above the body the notes whose
  values stay: the scan reading it now, hosts not re-checked, results over a day old.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNow } from '@/composables/use-now'
import { staleDays } from '@/lib/staleness'
import type { TabStatus } from '@/lib/project-tab-state'
import { useReportStore } from '@/stores/report'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import ResultErrorState from './ResultErrorState.vue'
import ResultFirstScan from './ResultFirstScan.vue'
import ResultNotes from './ResultNotes.vue'
import { provideResultsAged } from './results-aged'
import { useResultScan } from './use-result-scan'

const props = defineProps<{
  /** The project the tab belongs to. */
  projectId: string
  /** The report has not arrived yet. */
  loading: boolean
  status: TabStatus
  unreachable: readonly string[]
  staleSince: number | null
  /** Name of the group in Settings, as `projectShared.group.<name>`. */
  group: string
  emptyTitle: string
  emptyText: string
}>()

const { t } = useI18n()
const reports = useReportStore()
const now = useNow()
const run = useResultScan(() => ({ project: props.projectId }))

const failed = computed(() => !props.loading && reports.latest === null)
const oldDays = computed(() => staleDays(reports.latest?.scanned_at, now.value))
const seq = computed(() => reports.latest?.seq ?? null)
const showBody = computed(() => !props.loading && !failed.value && props.status === 'normal')
const aged = computed(() => oldDays.value !== null)
provideResultsAged(aged)
</script>

<template>
  <div class="shell" :aria-busy="loading">
    <slot v-if="loading" name="skeleton" />
    <ResultErrorState v-else-if="failed" :error="reports.error" @retry="reports.loadLatest()" />
    <UiEmptyState
      v-else-if="status === 'off'"
      icon="settings"
      :title="t('projectShared.off.title', { group: t(`projectShared.group.${group}`) })"
      :text="t('projectShared.off.text')"
    >
      <UiButton :to="{ name: 'settings', params: { section: 'scan' } }">
        {{ t('projectShared.off.open') }}
      </UiButton>
    </UiEmptyState>
    <UiEmptyState
      v-else-if="status === 'empty'"
      icon="folder"
      :title="emptyTitle"
      :text="emptyText"
    />
    <ResultFirstScan
      v-else-if="status === 'waiting'"
      :name="run.name.value"
      :busy="run.busy.value"
      @scan="run.scanThis()"
    />
    <UiEmptyState
      v-else-if="status === 'unreachable'"
      icon="unreachable"
      :title="
        t('projectShared.unreachable.noneTitle', { hosts: unreachable.join(', '), seq: seq ?? 0 })
      "
      :text="t('projectShared.unreachable.none')"
    >
      <UiButton icon="refresh" :disabled="run.busy.value" @click="run.retry(unreachable)">
        {{ t('projectShared.unreachable.retry', { hosts: unreachable.join(', ') }) }}
      </UiButton>
    </UiEmptyState>
    <template v-if="showBody">
      <ResultNotes
        :scanning-host="run.scanningHost.value"
        :unreachable="unreachable"
        :unreachable-since="staleSince"
        :old-days="oldDays"
        :seq="seq"
        :busy="run.busy.value"
        @scan="run.scanThis()"
        @retry="(hosts) => run.retry(hosts)"
      />
      <UiBanner
        v-if="staleSince !== null && unreachable.length === 0"
        class="note"
        tone="warn"
        icon="clock"
        :title="t('projectShared.stale.title', { seq: staleSince })"
        :text="t('projectShared.stale.text', { seq: staleSince })"
      />
      <div class="body" :class="{ 'results-aged': aged }"><slot /></div>
    </template>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;
}

.note {
  flex: none;
}

/* A wrapper for the aged colours only: the body's cards stay items of the shell's column. */
.body {
  display: contents;
}
</style>
