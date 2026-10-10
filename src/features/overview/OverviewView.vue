<!--
  The Overview (boards "Overview · results", "· scanning", "· old results", dark and Vietnamese
  are the same screen under the theme and the language): the toolbar, one summary line, the
  project cards, the servers strip, what changed since the baseline and what is coming up.
  It runs the real scan flow: Scan all and ⌘R open the scan panel, Stop and esc end the scan.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePaletteStore } from '@/features/palette/palette-store'
import { useShortcutsStore } from '@/features/shortcuts/shortcuts-store'
import { errorText } from '@/lib/issue-text'
import EmptyScreen from '@/features/empty/EmptyScreen.vue'
import SshConfigBanner from '@/features/setup/components/SshConfigBanner.vue'
import { useHistoryStore } from '@/stores/history'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useScanStore } from '@/stores/scan'
import { useSetupStore } from '@/stores/setup'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import OverviewCards from './OverviewCards.vue'
import OverviewChanges from './OverviewChanges.vue'
import OverviewComingUp from './OverviewComingUp.vue'
import OverviewScanChips from './OverviewScanChips.vue'
import OverviewServers from './OverviewServers.vue'
import OverviewSkeleton from './OverviewSkeleton.vue'
import OverviewStaleBanner from './OverviewStaleBanner.vue'
import OverviewSummary from './OverviewSummary.vue'
import OverviewToolbar from './OverviewToolbar.vue'
import { useOverview } from './use-overview'
import { useOverviewStore } from '@/stores/overview'

const { t } = useI18n()
const scan = useScanStore()
const reports = useReportStore()
const setup = useSetupStore()
const projects = useProjectsStore()
const panel = useScanPanelStore()
const selection = useOverviewStore()
const history = useHistoryStore()
const model = useOverview()

/** `projects.json` was read and holds nothing: a first launch, not a failed read. */
const showEmpty = computed(() => projects.loaded && projects.details.length === 0)

/**
 * The scan stopped before ssh because ssh refuses ~/.ssh/config. The config banner says where,
 * with the quoted lines; the last results stay below it, as they are.
 */
const configRefused = computed(() => scan.error?.code.kind === 'ssh_config_invalid')
watch(configRefused, (now) => {
  if (now) void setup.load()
})

const errorMessage = computed(() => {
  const error = (configRefused.value ? null : scan.error) ?? reports.error
  return error ? errorText(error) : ''
})

/** Check again in the config banner: read the config; once ssh takes it, the banner goes. */
async function recheckConfig() {
  await setup.load()
  if (!setup.configProblem) scan.error = null
}

/** The saved projects are still being read (or the report is): bars of the final heights. */
const waiting = computed(
  () =>
    !errorMessage.value &&
    (model.loading.value || (!projects.loaded && projects.details.length === 0)),
)

const report = computed(() => model.report.value)
const stale = computed(() => model.oldDays.value !== null && !scan.scanning)
const scanned = computed(() => report.value?.seq != null)

function reload() {
  void reports.loadLatest()
  void history.load()
}

// --- keyboard --------------------------------------------------------------------------

const palette = usePaletteStore()
const sheet = useShortcutsStore()
function onKeydown(e: KeyboardEvent) {
  // With no project there is nothing to scan: the empty screen owns the keys.
  if (showEmpty.value) return
  if (e.repeat) return
  if (e.metaKey && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    if (palette.open || sheet.open) return
    if (!scan.scanning) void panel.start()
  } else if (e.key === 'Escape' && !e.defaultPrevented && scan.scanning) {
    // An open panel takes esc first (it closes and marks the key handled); this one ends the scan.
    void scan.stop()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <EmptyScreen v-if="showEmpty" />
  <div v-else class="overview">
    <div v-if="scan.scanning" class="scan-line" aria-hidden="true"><i /></div>

    <OverviewToolbar
      :old-days="model.oldDays.value"
      :took-ms="model.tookMs.value"
      :filter-counts="model.counts.value"
    />

    <SshConfigBanner
      v-if="configRefused && setup.configProblem"
      :problem="setup.configProblem"
      :busy="setup.loading"
      @recheck="recheckConfig"
    />
    <UiBanner v-if="errorMessage" tone="crit" icon="critical" alert :title="errorMessage">
      <template #trailing>
        <UiButton size="small" @click="reload">{{ t('overviewScreen.reload') }}</UiButton>
      </template>
    </UiBanner>

    <OverviewSkeleton v-if="waiting" />

    <template v-else-if="report">
      <OverviewScanChips v-if="scan.scanning" />
      <OverviewStaleBanner
        v-else-if="stale && model.oldDays.value !== null"
        :days="model.oldDays.value"
        :took-ms="model.tookMs.value"
      />
      <OverviewSummary v-else-if="scanned" :report="report" :servers="model.serverSummary.value" />

      <OverviewCards :cards="model.cards.value" :old="model.oldDays.value !== null">
        <template v-if="scanned" #tail="{ inCell }">
          <OverviewServers
            :cells="model.servers.value"
            :neutral="model.oldDays.value !== null"
            :as-list="inCell"
          />
        </template>
      </OverviewCards>

      <div v-if="scanned" class="lists m-enter" style="--d: 520ms">
        <OverviewChanges
          :rows="model.changes.value.rows"
          :more="model.changes.value.more"
          :seq="report.seq ?? null"
          :baseline="selection.baselineSeq"
          :scanning="scan.scanning"
          :old-days="model.oldDays.value"
        />
        <OverviewComingUp
          :rows="model.upcoming.value"
          :as-of="model.oldDays.value !== null ? (report.scanned_at ?? null) : null"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.scan-line {
  position: absolute;
  top: 0;
  right: calc(-1 * var(--space-8));
  left: calc(-1 * var(--space-8));
  z-index: 3;
  height: 2px;
  overflow: hidden;
}

.scan-line i {
  display: block;
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: sweep 1.4s var(--ease-in-out) infinite;
}

@keyframes sweep {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(340%);
  }
}

.lists {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--space-4);
  min-height: 172px;
}

[data-range='narrow'] .lists {
  grid-template-columns: minmax(0, 1fr);
}

@media (prefers-reduced-motion: reduce) {
  .scan-line i {
    animation: none;
    width: 100%;
    opacity: 0.4;
  }
}
</style>
