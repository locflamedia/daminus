<!--
  Project · Security, from the boards "Project · Security" and "Project · Security · Dark":
  lite checks with hard evidence. Critical first, each with what it means and what to do next,
  and what Daminus deliberately does not check. Everything comes from the latest report of the
  project (its owner) and the saved scans for "How it unfolded".

  States: reading, empty (no scan yet), error, normal, results older than a day, a host that did
  not answer, groups switched off in Settings, a check that needs permission, expected findings
  and partial coverage.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { shouldPlay } from '@/lib/motion'
import { useReportStore } from '@/stores/report'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import SecurityChecksCard from './SecurityChecksCard.vue'
import SecurityDoFirst from './SecurityDoFirst.vue'
import SecurityFindingCard from './SecurityFindingCard.vue'
import SecurityFoldRow from './SecurityFoldRow.vue'
import SecurityLimits from './SecurityLimits.vue'
import SecurityTimeline from './SecurityTimeline.vue'
import { useProjectSecurity } from './use-project-security'
import { useFormat } from '@/composables/use-format'
import ResultErrorState from '../common/ResultErrorState.vue'
import ResultFirstScan from '../common/ResultFirstScan.vue'
import ResultNotes from '../common/ResultNotes.vue'
import { provideResultsAged } from '../common/results-aged'
import { useResultScan } from '../common/use-result-scan'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const fmt = useFormat()
const reports = useReportStore()
const view = useProjectSecurity(computed(() => props.id))

const run = useResultScan(() => ({ project: props.id }))
const aged = computed(() => view.oldDays.value !== null)
provideResultsAged(aged)
const key = computed(() => `${props.id}:${view.seq.value}`)
// The results arrive with motion once per scan, not on every visit or re-render.
const play = computed(() => shouldPlay(`sec-${key.value}`))

const meta = computed(() => {
  const n = view.rows.value.length
  const ms = view.checkMs.value
  return ms === null
    ? t('projectSecurity.checks.meta', { n })
    : t('projectSecurity.checks.metaTime', { n, time: fmt.duration(ms) })
})

const clean = computed(
  () =>
    view.findings.value.length === 0 &&
    view.rows.value.every((r) => r.state === 'ok' || r.state === 'expected'),
)

/** The oldest scan a row of a host that did not answer is shown from. */
const unreachableSince = computed(() => {
  const seqs = view.rows.value.map((r) => r.staleSince).filter((n): n is number => n !== null)
  return seqs.length > 0 ? Math.min(...seqs) : null
})

/** "first seen scan #10 · 2 days", "new this scan" or nothing when the age is not known. */
function since(f: Parameters<typeof view.firstSeen>[0]): string {
  if (f.isNew && f.firstSeq === null) return t('projectSecurity.card.newThisScan')
  const seen = view.firstSeen(f)
  if (!seen) return ''
  return seen.days === null || seen.days < 1
    ? t('projectSecurity.card.firstSeenToday', { seq: seen.seq })
    : t('projectSecurity.card.firstSeen', {
        seq: seen.seq,
        when: t('projectSecurity.card.days', { n: seen.days }, seen.days),
      })
}
</script>

<template>
  <div class="sec" :data-screen="view.screen.value">
    <div v-if="view.screen.value === 'loading'" class="layout" role="status">
      <span class="sr-only">{{ t('projectSecurity.state.loading') }}</span>
      <div class="col">
        <UiSkeleton height="60px" radius="14px" tone="soft" />
        <UiSkeleton height="236px" radius="14px" tone="soft" />
        <UiSkeleton height="236px" radius="14px" tone="soft" />
        <UiSkeleton height="52px" radius="14px" tone="soft" />
      </div>
      <div class="col">
        <UiSkeleton height="168px" radius="14px" tone="soft" />
        <UiSkeleton height="380px" radius="14px" tone="soft" />
        <UiSkeleton height="140px" radius="14px" tone="soft" />
      </div>
    </div>

    <ResultErrorState
      v-else-if="view.screen.value === 'error'"
      :error="reports.error"
      @retry="view.retry()"
    />

    <ResultFirstScan
      v-else-if="view.screen.value === 'empty'"
      :name="run.name.value"
      :busy="run.busy.value"
      @scan="run.scanThis()"
    />

    <template v-else>
      <ResultNotes
        :scanning-host="run.scanningHost.value"
        :unreachable="view.unreachable.value"
        :unreachable-since="unreachableSince"
        :old-days="view.oldDays.value"
        :seq="view.seq.value"
        :busy="run.busy.value"
        :project="id"
        @scan="run.scanThis()"
        @retry="(hosts) => run.retry(hosts)"
      />
      <UiBanner
        v-if="view.allOff.value"
        tone="neutral"
        icon="settings"
        :title="t('projectShared.off.title', { group: t('projectShared.group.security') })"
        :text="t('projectShared.off.text')"
      >
        <template #trailing>
          <UiButton size="small" :to="{ name: 'settings', params: { section: 'scan' } }">{{
            t('projectShared.off.open')
          }}</UiButton>
        </template>
      </UiBanner>

      <div :key="key" class="layout" :class="{ 'results-aged': aged }">
        <div class="col">
          <SecurityDoFirst v-if="view.first.value" :step="view.first.value" />
          <SecurityFindingCard
            v-for="(f, i) in view.critical.value"
            :key="f.id"
            :finding="f"
            :since="since(f)"
            :index="i"
          />
          <SecurityFoldRow
            v-for="(f, i) in view.folded.value"
            :key="f.id"
            :finding="f"
            :rule="view.rule(f)"
            :index="i + view.critical.value.length"
          />
          <UiBanner
            v-if="clean"
            tone="ok"
            icon="check-circle"
            :title="t('projectSecurity.clean.title')"
            :text="t('projectSecurity.clean.text')"
          />
        </div>
        <div class="col">
          <SecurityTimeline :events="view.events.value" :play="play" :latest-seq="view.seq.value" />
          <SecurityChecksCard
            :rows="view.rows.value"
            :mix="view.mix.value"
            :meta="meta"
            :play="play"
          />
          <SecurityLimits :play="play" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sec {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
}

.layout {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) 312px;
  gap: var(--space-4);
  align-items: start;
  min-height: 0;
}

.col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
