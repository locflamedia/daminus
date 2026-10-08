<!--
  Server detail, from the board "Server detail": one server, everything it carries. The four
  numbers first, then the disk trend with what uses the disk, then the containers and the
  findings. Everything shown comes from the latest report, the raw facts of the last scans and
  the report of the baseline scan; the page only arranges it. States: reading, unreadable,
  unknown server, a server left out of the scan, one that did not answer (its last results stay,
  marked as old) and results older than a day.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useFormat } from '@/composables/use-format'
import { useNow } from '@/composables/use-now'
import { errorText } from '@/lib/issue-text'
import { coresOf, itemOf } from '@/lib/server-facts'
import { dataOf, num } from '@/lib/project-facts'
import { staleDays } from '@/lib/staleness'
import { useHistoryStore } from '@/stores/history'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import { useSettingsStore } from '@/stores/settings'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import ServerContainersCard from './ServerContainersCard.vue'
import ServerDiskCard from './ServerDiskCard.vue'
import ServerFindingsCard from './ServerFindingsCard.vue'
import ServerHeader from './ServerHeader.vue'
import ServerKpiCard from './ServerKpiCard.vue'
import ServerSkeleton from './ServerSkeleton.vue'
import ServerUsageCard from './ServerUsageCard.vue'
import { kpiView } from './server-text'
import { useServerData } from './use-server-data'

const { t } = useI18n()
const fmt = useFormat()
const route = useRoute()
const reports = useReportStore()
const history = useHistoryStore()
const projects = useProjectsStore()
const scan = useScanStore()
const settings = useSettingsStore()
const clock = useNow()

const host = computed(() => String(route.params.host ?? ''))
const data = useServerData(host)

const loading = computed(() => reports.latest === null && reports.error === null)
const failure = computed(() => (reports.latest === null && reports.error ? reports.error : null))
const known = computed(() => data.state.value !== 'missing')
const seq = computed(() => data.report.value?.seq ?? null)
const scope = computed(() => `${host.value}:${seq.value ?? 'none'}`)

const oldDays = computed(() => staleDays(data.report.value?.scanned_at, clock.value))

// "4 cores · 7.8 GB RAM · scan #12, 2.1 s": only what the checks read about the machine.
const meta = computed(() => {
  const parts: string[] = []
  const cores = coresOf(data.items.value)
  if (cores !== null) parts.push(t('serverScreen.identity.cores', { n: cores }, cores))
  const total = num(dataOf(itemOf(data.items.value, 'sys.mem')?.fact).total)
  if (total !== null && total > 0) {
    parts.push(t('serverScreen.identity.memory', { size: fmt.measure(total, 'bytes').text }))
  }
  const report = data.report.value
  if (report?.seq != null && report.scanned_at && data.state.value !== 'not-scanned') {
    const ms = history.view?.scans.find((s) => s.seq === report.seq)?.hosts[host.value]?.ms
    parts.push(
      t('project.scanMeta', {
        seq: report.seq,
        time: ms == null ? fmt.clock(report.scanned_at) : fmt.duration(ms),
      }),
    )
  }
  return parts.join(' · ')
})

const kpis = computed(() => data.kpis.value.map((k) => kpiView(k, settings.language)))
const kpiLabel = (name: string) => t('serverScreen.kpi.trend', { name })

const reason = computed(() => {
  const outcome = data.failed.value
  return outcome ? t(`scanHost.${outcome.state}`) : ''
})
const lastReached = computed(() => {
  const r = data.rollup.value
  return r?.last_reached_seq != null && r.last_reached_at
    ? { seq: r.last_reached_seq, when: fmt.when(r.last_reached_at) }
    : null
})
const unreachableText = computed(() =>
  lastReached.value
    ? t('serverScreen.state.unreachableText', { cause: reason.value, ...lastReached.value })
    : t('serverScreen.state.neverReached', { cause: reason.value }),
)

function runScan() {
  if (known.value && !scan.scanning) void scan.start({ projects: [], hosts: [host.value] })
}

function onKeydown(e: KeyboardEvent) {
  if (!e.metaKey || e.key.toLowerCase() !== 'r' || !known.value) return
  e.preventDefault()
  runScan()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const errorMessage = computed(() => (failure.value ? errorText(failure.value) : ''))
</script>

<template>
  <div class="server">
    <ServerHeader
      :host="host"
      :known="known"
      :meta="meta"
      :baselines="data.earlier.value"
      :baseline="data.baselineSeq.value"
      :scanning="scan.scanning"
      @baseline="data.chosen.value = $event"
      @scan="runScan"
    />

    <ServerSkeleton v-if="loading" :host="host" />

    <UiBanner
      v-else-if="failure"
      tone="crit"
      icon="critical"
      alert
      :title="t('serverScreen.state.loadFailed')"
      :text="errorMessage"
    >
      <template #trailing>
        <UiButton size="small" @click="reports.loadLatest()">{{
          t('serverScreen.state.retry')
        }}</UiButton>
      </template>
    </UiBanner>

    <UiEmptyState
      v-else-if="!known"
      icon="server"
      :title="t('serverScreen.state.missing', { host })"
      :text="t('serverScreen.state.missingText')"
    >
      <UiButton to="/">{{ t('serverScreen.state.back') }}</UiButton>
    </UiEmptyState>

    <template v-else>
      <UiBanner
        v-if="data.state.value === 'unreachable'"
        tone="crit"
        icon="unreachable"
        :title="t('serverScreen.state.unreachable', { host })"
        :text="unreachableText"
      />
      <UiBanner
        v-else-if="seq === null"
        tone="warn"
        icon="clock"
        :title="t('serverScreen.state.noScan')"
        :text="t('serverScreen.state.noScanText')"
      >
        <template #trailing>
          <UiButton size="small" :disabled="scan.scanning" @click="runScan">
            {{ t('serverScreen.scan') }}
          </UiButton>
        </template>
      </UiBanner>
      <UiBanner
        v-else-if="data.state.value === 'not-scanned'"
        tone="warn"
        icon="clock"
        :title="t('serverScreen.state.notScanned', { host })"
        :text="t('serverScreen.state.notScannedText')"
      >
        <template #trailing>
          <UiButton size="small" :disabled="scan.scanning" @click="runScan">
            {{ t('serverScreen.scan') }}
          </UiButton>
        </template>
      </UiBanner>
      <UiBanner
        v-else-if="oldDays !== null"
        tone="warn"
        icon="clock"
        :title="t('serverScreen.state.stale', { n: oldDays }, oldDays)"
        :text="t('serverScreen.state.staleText')"
      />

      <div class="kpis">
        <ServerKpiCard
          v-for="(view, i) in kpis"
          :key="`${scope}:${view.id}`"
          :view="view"
          :index="i"
          :scope="scope"
          :spark-label="kpiLabel(view.label)"
        />
      </div>

      <div class="pair">
        <ServerDiskCard
          :chart="data.diskChart.value"
          :mount="data.kpis.value[2]?.mount ?? null"
          :scope="scope"
        />
        <ServerUsageCard
          :usage="data.usage.value"
          :baseline="data.baselineSeq.value"
          :scope="scope"
        />
      </div>

      <div class="pair">
        <ServerContainersCard
          :host="host"
          :containers="data.containers.value"
          :color-of="projects.color"
          :scope="scope"
        />
        <ServerFindingsCard
          :host="host"
          :findings="data.findings.value.rows"
          :tally="data.findings.value.tally"
          :security="data.security.value"
          :scope="scope"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.server {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: var(--space-4);
}

/* A narrow page puts the four numbers two by two and the side cards under the wide ones. */
@media (max-width: 1100px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
