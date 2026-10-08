<!--
  AI · Findings (board "AI · Findings", screen 22): what the AI made of one scan. A header with
  where the review came from (scan, model, time, how much was sent, a way to see it), the filter
  and Run again; "In short", the model's paragraph; the ranked list beside the chosen finding.
  The order is the AI's; every severity is the check's. Without an answer the same list is built
  from the checks, unranked, with a quiet link to the AI providers. A finding's command is for
  copying: no part of this screen runs anything.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFormat } from '@/composables/use-format'
import { formatMeasure } from '@/lib/format'
import { errorText } from '@/lib/issue-text'
import { useAiPayloadStore } from '@/stores/ai-payload'
import { useAiProvidersStore } from '@/stores/ai-providers'
import { useAiThreadStore } from '@/stores/ai-thread'
import { useReportStore } from '@/stores/report'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiSeg from '@/ui/UiSeg.vue'
import { openReview } from '../ask/use-ask-session'
import FindingDetail from './FindingDetail.vue'
import FindingsList from './FindingsList.vue'
import { applyFilter, fallbackFindings, filterCounts, type FindingsFilter } from './findings-model'
import { resolveFindings } from './resolve-findings'

const { t } = useI18n()
const fmt = useFormat()
const router = useRouter()
const thread = useAiThreadStore()
const payload = useAiPayloadStore()
const providers = useAiProvidersStore()
const reports = useReportStore()

const turn = computed(() => thread.lastAnswered)
const latest = computed(() => thread.newest)
const report = computed(() => reports.latest)
const trouble = computed(() => {
  const n = latest.value
  return n && n.status !== 'done' && n.id !== turn.value?.id ? n : null
})

const all = computed(() =>
  turn.value ? resolveFindings(turn.value.findings, report.value) : fallbackFindings(report.value),
)
const ranked = computed(() => turn.value !== null)
const counts = computed(() => filterCounts(all.value))
const filter = ref<FindingsFilter>('all')
const shown = computed(() => applyFilter(all.value, filter.value))
const options = computed(() => [
  { value: 'all', label: t('aiFindings.all', { n: counts.value.all }) },
  { value: 'crit', label: t('aiFindings.critical', { n: counts.value.crit }) },
  { value: 'warn', label: t('aiFindings.warnings', { n: counts.value.warn }) },
])

const selectedId = ref('')
const selected = computed(
  () => shown.value.find((f) => f.id === selectedId.value) ?? shown.value[0],
)
watch(
  shown,
  (list) => {
    if (!list.some((f) => f.id === selectedId.value)) selectedId.value = list[0]?.id ?? ''
  },
  { immediate: true },
)

const title = computed(() =>
  turn.value?.seq != null
    ? t('aiFindings.title', { n: turn.value.seq })
    : t('aiFindings.titleNoScan'),
)
const model = computed(() => {
  const view = providers.view
  const entry = view?.providers.find((p) => p.profile.id === view.provider)
  return view?.model ?? entry?.profile.models[0] ?? entry?.profile.name ?? ''
})
const provenance = computed(() => {
  const a = turn.value
  if (!a) return ''
  const size = payload.preview ? formatMeasure(payload.preview.total_bytes, 'bytes').text : ''
  return [model.value, fmt.clock(a.startedAt), size ? `${size}` : '']
    .filter((p) => p !== '')
    .join(' · ')
})

function again() {
  const a = turn.value ?? latest.value
  openReview(a?.scope ?? { kind: 'whole' }, a?.question ?? '')
}

function followUp() {
  thread.openDrawer(turn.value?.scope ?? { kind: 'whole' })
}

if (providers.view === null) void providers.load()
</script>

<template>
  <div class="findings">
    <header class="top">
      <span class="tile" aria-hidden="true"><UiIcon name="spark" :size="18" /></span>
      <div class="titles">
        <b class="title">{{ title }}</b>
        <span v-if="provenance" class="sub"
          >{{ provenance }} ·
          <button type="button" class="link" @click="again">
            {{ t('aiFindings.seePayload') }}
          </button></span
        >
      </div>
      <span class="grow" />
      <UiSeg
        v-if="all.length > 0"
        v-model="filter"
        :options="options"
        :label="t('aiFindings.filter')"
      />
      <UiButton variant="secondary" icon="refresh" @click="again">{{
        t('aiFindings.runAgain')
      }}</UiButton>
    </header>

    <UiBanner
      v-if="trouble && (trouble.status === 'waiting' || trouble.status === 'streaming')"
      tone="info"
      icon="spark"
      :title="t('aiFindings.reviewing')"
    />
    <UiBanner
      v-else-if="trouble && trouble.status === 'error'"
      tone="crit"
      icon="critical"
      alert
      :title="t('aiFindings.failed')"
      :text="trouble.error ? errorText(trouble.error) : undefined"
    />
    <UiBanner
      v-else-if="trouble && trouble.status === 'cancelled'"
      tone="info"
      icon="info"
      :title="t('aiFindings.stopped')"
    />

    <UiCard v-if="turn?.summary" class="short m-enter" style="--d: 80ms">
      <div class="ct">
        <UiIcon name="spark" :size="14" />{{ t('aiFindings.inShort')
        }}<span class="note">{{ t('aiFindings.inShortNote') }}</span>
      </div>
      <p class="summary">{{ turn.summary }}</p>
    </UiCard>
    <UiCard v-else-if="!turn" class="empty">
      <b>{{ t('aiFindings.none') }}</b>
      <p class="summary">{{ t('aiFindings.noneBody') }}</p>
      <div class="empty-actions">
        <UiButton variant="primary" size="small" icon="spark" @click="followUp">{{
          t('aiFindings.ask')
        }}</UiButton>
        <UiButton
          variant="link"
          @click="router.push({ name: 'settings', params: { section: 'ai' } })"
          >{{ t('aiFindings.providers') }}</UiButton
        >
      </div>
    </UiCard>

    <div v-if="all.length > 0" class="body">
      <UiCard class="listcard">
        <div class="ct">
          {{ ranked ? t('aiFindings.ranked') : t('aiFindings.fromChecks')
          }}<span class="note">{{ t('aiFindings.count', { n: counts.all }) }}</span>
        </div>
        <FindingsList
          :findings="shown"
          :selected="selected?.id ?? ''"
          :ranked="ranked"
          @select="selectedId = $event"
        />
        <p v-if="shown.length === 0" class="note">{{ t('aiFindings.nothingToShow') }}</p>
        <p v-if="ranked" class="note order">{{ t('aiFindings.orderNote') }}</p>
      </UiCard>
      <FindingDetail v-if="selected" :finding="selected" @follow-up="followUp" />
    </div>
  </div>
</template>

<style scoped>
.findings {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  flex: none;
  gap: var(--space-3);
  height: 72px;
}

.tile {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
  color: var(--accent-ink);
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.3;
}

.title {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.sub {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-ink);
  font: inherit;
  font-weight: var(--weight-medium);
  cursor: default;
}

.grow {
  flex-grow: 1;
}

.ct {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.note {
  margin: 0;
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.note.order {
  margin: 0;
}

.short {
  --card-gap: 8px;
}

.summary {
  margin: 0;
  font-size: var(--text-13);
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.empty {
  --card-gap: 8px;
}

.empty-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.body {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: var(--space-3);
  min-height: 0;
}

.listcard {
  --card-gap: 6px;
  --card-pad: 12px;
  align-self: start;
}
</style>
