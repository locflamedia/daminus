<!--
  Project · History, from the board: snapshots make the past free. One strip shows when each
  check turned, three soft curves share one cursor, and the diff says what actually changed
  between two scans. Everything is read from the saved scans (summaries, raw facts and the
  reports of the two compared scans).

  Export JSON is not drawn: the core has no export command to call.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorText } from '@/lib/issue-text'
import { useHistoryStore } from '@/stores/history'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import HistoryChanges from './HistoryChanges.vue'
import HistoryMultiples from './HistoryMultiples.vue'
import HistoryRangeBar from './HistoryRangeBar.vue'
import HistoryStrip from './HistoryStrip.vue'
import { useProjectHistory } from './use-project-history'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const history = useHistoryStore()
const view = useProjectHistory(computed(() => props.id))

const error = computed(() => (history.error ? errorText(history.error) : ''))
</script>

<template>
  <div class="hist" :data-screen="view.screen.value">
    <div v-if="view.screen.value === 'loading'" class="stack" role="status">
      <span class="sr-only">{{ t('projectHistory.state.loading') }}</span>
      <UiSkeleton height="32px" radius="10px" tone="soft" width="420px" />
      <UiSkeleton height="190px" radius="14px" tone="soft" />
      <div class="split">
        <UiSkeleton height="450px" radius="14px" tone="soft" />
        <UiSkeleton height="450px" radius="14px" tone="soft" />
      </div>
    </div>

    <UiEmptyState
      v-else-if="view.screen.value === 'error'"
      icon="warn"
      :title="t('projectHistory.state.errorTitle')"
      :text="error"
    >
      <UiButton @click="view.retry()">{{ t('projectHistory.state.retry') }}</UiButton>
    </UiEmptyState>

    <UiEmptyState
      v-else-if="view.screen.value === 'empty'"
      icon="clock"
      :title="t('projectHistory.state.emptyTitle')"
      :text="t('projectHistory.state.emptyText')"
    />

    <template v-else>
      <HistoryRangeBar
        v-model:range="view.range.value"
        :scans="view.scans.value"
        :pair="view.pair.value"
        @pick="view.pick"
      />
      <HistoryStrip :scans="view.scans.value" :rows="view.strip.value" :pair="view.pair.value" />
      <div class="split">
        <HistoryMultiples
          :scans="view.scans.value"
          :series="view.series.value"
          :facts="view.facts.value"
          :project="view.project.value"
          :project-id="id"
          :pair="view.pair.value"
        />
        <HistoryChanges
          :rows="view.changes.value"
          :pair="view.pair.value"
          :reading="view.reading.value"
          :gone="view.unavailable.value"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.hist {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--space-3);
  align-items: stretch;
  min-height: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

@media (max-width: 1100px) {
  .split {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
