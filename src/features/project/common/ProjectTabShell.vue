<!--
  The states every project tab shares, so each tab only draws its normal body: the body is
  held back by a skeleton while the report is read, an error with a retry, a group switched off in
  Settings, no part of that kind in the project, hosts that did not answer, and notes above the
  body when results were not re-checked or are over a day old.
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

const props = defineProps<{
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

const failed = computed(() => !props.loading && reports.latest === null)
const oldDays = computed(() => staleDays(reports.latest?.scanned_at, now.value))
const seq = computed(() => reports.latest?.seq ?? null)
const showBody = computed(() => !props.loading && !failed.value && props.status === 'normal')
</script>

<template>
  <div class="shell" :aria-busy="loading">
    <slot v-if="loading" name="skeleton" />
    <UiEmptyState
      v-else-if="failed"
      icon="warn"
      :title="t('projectShared.error.title')"
      :text="t('projectShared.error.text')"
    >
      <UiButton icon="refresh" @click="reports.loadLatest()">
        {{ t('projectShared.error.retry') }}
      </UiButton>
    </UiEmptyState>
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
    <UiEmptyState
      v-else-if="status === 'waiting'"
      icon="clock"
      :title="t('projectShared.waiting.title')"
      :text="t('projectShared.waiting.text')"
    />
    <UiEmptyState
      v-else-if="status === 'unreachable'"
      icon="unreachable"
      :title="t('projectShared.unreachable.title', { hosts: unreachable.join(', ') })"
      :text="t('projectShared.unreachable.text', { seq: seq ?? 0 })"
    />
    <template v-if="showBody">
      <UiBanner
        v-if="staleSince !== null"
        class="note"
        tone="warn"
        icon="clock"
        :title="t('projectShared.stale.title', { seq: staleSince })"
        :text="t('projectShared.stale.text', { seq: staleSince })"
      />
      <UiBanner
        v-else-if="oldDays !== null"
        class="note"
        tone="warn"
        icon="clock"
        :title="t('projectShared.old.title', { n: oldDays }, oldDays)"
        :text="t('projectShared.old.text')"
      />
      <UiBanner
        v-if="unreachable.length > 0"
        class="note"
        tone="warn"
        icon="unreachable"
        :title="t('projectShared.unreachable.title', { hosts: unreachable.join(', ') })"
        :text="t('projectShared.unreachable.kept')"
      />
      <slot />
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
</style>
