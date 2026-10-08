<!--
  The Overview's toolbar (boards "Overview · results", "· scanning", "· old results"): the
  title with the scan line under it, and at the right either the filter, the baseline and the
  one primary action, or, while a scan runs, how far it has got and Stop. Results over a day
  old drop the filter and the baseline and put the age first, in amber. Ask AI belongs to the
  AI phase and is not drawn.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { scanCounts, urlChecks } from '@/lib/overview-scan'
import { useLayoutRange } from '@/lib/viewport'
import PageHeader from '@/layout/PageHeader.vue'
import { useHistoryStore } from '@/stores/history'
import { useOverviewStore } from '@/stores/overview'
import { useReportStore } from '@/stores/report'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useScanStore } from '@/stores/scan'
import UiButton from '@/ui/UiButton.vue'
import UiKbd from '@/ui/UiKbd.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'
import UiSeg from '@/ui/UiSeg.vue'

const props = defineProps<{
  /** Whole days the results are old when over a day. */
  oldDays: number | null
  tookMs: number | null
  /** Projects shown by each filter. */
  filterCounts: { all: number; needs: number }
}>()

const { t } = useI18n()
const fmt = useFormat()
const scan = useScanStore()
const reports = useReportStore()
const history = useHistoryStore()
const selection = useOverviewStore()
const panel = useScanPanelStore()
const range = useLayoutRange()

const narrow = computed(() => range.value === 'narrow')
const report = computed(() => reports.latest)

// --- the running scan --------------------------------------------------------------------

const now = ref(Date.now())
let ticker: number | undefined
watch(
  () => scan.scanning,
  (running) => {
    window.clearInterval(ticker)
    if (running) {
      now.value = Date.now()
      ticker = window.setInterval(() => (now.value = Date.now()), 200)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => window.clearInterval(ticker))

/** Time since the scan started; the next scan number is not known until it is saved. */
const elapsed = computed(() =>
  scan.run ? fmt.duration(Math.max(0, now.value - Date.parse(scan.run.started_at))) : '',
)
const counts = computed(() => scanCounts(scan.run))
const urls = computed(() => urlChecks(scan.run))
const fraction = computed(() =>
  counts.value.total === 0 ? 0 : counts.value.finished / counts.value.total,
)

// --- the line under the title ----------------------------------------------------------

const lastScan = computed(() =>
  props.oldDays === null || report.value?.seq == null || !report.value.scanned_at
    ? null
    : {
        age: t('time.daysAgoLong', { n: props.oldDays }, props.oldDays),
        rest: t('toolbar.lastScanRest', {
          seq: report.value.seq,
          when: fmt.weekdayDateTime(report.value.scanned_at),
        }),
      },
)

const meta = computed(() => {
  // Still reading, or the read failed: there is no line to write yet.
  if (!report.value) return undefined
  const seq = report.value.seq
  if (seq == null || !report.value.scanned_at) return t('toolbar.noScan')
  const when = fmt.when(report.value.scanned_at, { withToday: true })
  return props.tookMs === null
    ? t('toolbar.scanMeta', { seq, when })
    : t('overviewScreen.metaTook', { seq, when, took: fmt.duration(props.tookMs) })
})

// --- filter and baseline ---------------------------------------------------------------

const options = computed(() => [
  { value: 'all', label: t('overviewScreen.filterAll'), count: props.filterCounts.all },
  { value: 'needs', label: t('overviewScreen.filterNeeds'), count: props.filterCounts.needs },
])
const selected = computed(() => (selection.severity ? 'all' : selection.filter))

const baselineItems = computed<MenuItem[]>(() =>
  selection.choices.map((seq) => {
    const summary = history.view?.scans.find((s) => s.seq === seq)
    return {
      id: String(seq),
      label: t('overviewScreen.baseline', { seq }),
      hint: summary ? fmt.when(summary.finished_at) : undefined,
      checked: seq === selection.baselineSeq,
    }
  }),
)

const showFilters = computed(
  () => props.oldDays === null && report.value?.seq != null && selection.baselineSeq !== null,
)
</script>

<template>
  <PageHeader :title="t('nav.overview')" :meta="scan.scanning || lastScan ? undefined : meta">
    <template v-if="scan.scanning" #meta>
      {{ t('toolbar.scanning') }} · <span class="mono">{{ elapsed }}</span>
    </template>
    <template v-else-if="lastScan" #meta>
      {{ t('toolbar.lastScan') }} <b class="age">{{ lastScan.age }}</b> · {{ lastScan.rest }}
    </template>
    <template #actions>
      <template v-if="scan.scanning">
        <button
          type="button"
          class="progress"
          :title="t('overviewScreen.showScan')"
          :aria-label="t('overviewScreen.showScan')"
          @click="panel.show()"
        >
          <b>{{ t('toolbar.hostsOf', { done: counts.finished, total: counts.total }) }}</b>
          <span class="track"><i :style="{ transform: `scaleX(${fraction})` }" /></span>
          <span v-if="urls" class="urls">
            {{ t('toolbar.urlChecks') }}
            <template v-if="urls === 'done'">✓</template>
          </span>
        </button>
        <button type="button" class="stop" @click="scan.stop()">
          {{ t('toolbar.stop') }}<UiKbd>esc</UiKbd>
        </button>
      </template>
      <template v-else>
        <template v-if="showFilters">
          <UiSeg
            class="filter"
            :model-value="selected"
            :options="options"
            :label="t('overviewScreen.filterLabel')"
            @update:model-value="selection.setFilter($event === 'needs' ? 'needs' : 'all')"
          />
          <UiMenu
            :items="baselineItems"
            compact
            :label="t('overviewScreen.baselineLabel')"
            @select="selection.choose(Number($event))"
          >
            <template #trigger="{ attrs, toggle }">
              <UiButton v-bind="attrs" trailing-icon="chevron-down" @click="toggle">
                {{ t('overviewScreen.baseline', { seq: selection.baselineSeq ?? 0 }) }}
              </UiButton>
            </template>
          </UiMenu>
        </template>
        <UiButton
          variant="primary"
          lifted
          :class="{ sheen: oldDays !== null }"
          :icon="narrow ? 'refresh' : undefined"
          :shortcut="narrow ? undefined : '⌘R'"
          @click="panel.start()"
        >
          {{ narrow ? t('toolbar.scan') : `↳ ${t('toolbar.scanAll')}` }}
        </UiButton>
      </template>
    </template>
  </PageHeader>
</template>

<style scoped>
.age {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}

.filter {
  align-self: center;
}

.stop {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-control);
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  transition: transform var(--dur-press) var(--ease-out);
}

.stop:active {
  transform: scale(0.97);
}

.stop:focus-visible,
.progress:focus-visible {
  box-shadow: var(--focus-ring);
}

.progress {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
  color: var(--ink);
  font-size: var(--text-12);
}

.progress b {
  font-weight: var(--weight-medium);
}

.track {
  width: 120px;
  height: 4px;
  border-radius: 2px;
  background: var(--surface-2);
  overflow: hidden;
}

.track i {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--wash-1));
  transform-origin: left;
  transition: transform 300ms var(--ease-out);
}

.urls {
  color: var(--ink-3);
}

/* Results over a day old: Scan all carries the sheen, the one thing that moves. */
.sheen {
  position: relative;
  overflow: hidden;
}

.sheen::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 30%) 50%, transparent 65%);
  background-size: 250% 100%;
  content: '';
  pointer-events: none;
  animation: sheen 4s 1s infinite;
}

@keyframes sheen {
  0% {
    background-position: 130% 0;
  }

  25%,
  100% {
    background-position: -60% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheen::after {
    animation: none;
    opacity: 0;
  }
}
</style>
