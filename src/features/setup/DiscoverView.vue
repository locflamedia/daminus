<!--
  Step 2 of setup: what runs on the hosts that were picked. A lane per host (reading, done,
  incomplete, queued), the finds by kind as they arrive, the listeners nothing accounts for,
  and the pairs of a front end and a back end that sit on different hosts. The footer lets the
  person move on from the first finished host; what arrives later joins the next step.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFormat } from '@/composables/use-format'
import { useNow } from '@/composables/use-now'
import {
  type Find,
  type HostRecords,
  findColumns,
  listeningLeft,
  pairsOf,
} from '@/lib/discover-view'
import { vEnter } from '@/lib/motion'
import { useScanSettingsStore } from '@/stores/scan-settings'
import { useSetupDraftsStore } from '@/stores/setup-drafts'
import { useSetupStore } from '@/stores/setup'
import { useToastStore } from '@/stores/toasts'
import UiButton from '@/ui/UiButton.vue'
import UiChip from '@/ui/UiChip.vue'
import UiProgressBar from '@/ui/UiProgressBar.vue'
import UiRoll from '@/ui/UiRoll.vue'
import AddPathCard from './discover/AddPathCard.vue'
import DiscoverLane from './discover/DiscoverLane.vue'
import DiscoverRail from './discover/DiscoverRail.vue'
import FindCard from './discover/FindCard.vue'
import FindRow from './discover/FindRow.vue'
import ListeningCard from './discover/ListeningCard.vue'
import PairStrip from './discover/PairStrip.vue'
import { useArrivals } from './discover/use-arrivals'
import { useDiscoverLanes } from './discover/use-discover-lanes'
import SetupFrame from './SetupFrame.vue'

/** `MAX_HOSTS_AT_ONCE` of the core (scan/service.rs). */
const MAX_HOSTS_AT_ONCE = 8

const { t } = useI18n()
const { duration } = useFormat()
const router = useRouter()
const setup = useSetupStore()
const drafts = useSetupDraftsStore()
const toasts = useToastStore()
const now = useNow(1000)
const { lanes } = useDiscoverLanes()

const running = computed(() => setup.run?.step === 'discover')

const hostRecords = computed<HostRecords[]>(() =>
  setup.discovering.map((host) => ({ host, records: setup.recordsOf(host) })),
)
const proposal = computed(() => setup.result?.proposal ?? null)
const columns = computed(() => findColumns(hostRecords.value, proposal.value))
const listening = computed(() => listeningLeft(hostRecords.value))
const pairs = computed(() => pairsOf(proposal.value, hostRecords.value))
const paired = computed(() => new Set(pairs.value.map((p) => p.project)))

const arrived = useArrivals(() => [
  ...[
    ...columns.value.sites,
    ...columns.value.apps,
    ...columns.value.boxes,
    ...columns.value.dbs,
  ].map((f) => f.key),
  ...listening.value.map((l) => l.key),
])
/** A find is "new" while its host is still being read, never after. */
const newKeys = computed<ReadonlySet<string>>(() => (running.value ? arrived.value : new Set()))

const total = computed(() => setup.discovering.length)
const scanSettings = useScanSettingsStore()
/** How many hosts are read at once, as the core runs them: Settings › Scan, or one per host on
 *  Auto, at most 8. */
const atOnce = computed(() =>
  Math.max(1, Math.min(scanSettings.scan.hosts_at_once ?? total.value, MAX_HOSTS_AT_ONCE)),
)
const done = computed(() => setup.discovering.filter((h) => setup.lanes[h]).length)
const canContinue = computed(() => done.value > 0)
const fraction = computed(() => (total.value === 0 ? 0 : done.value / total.value))

/** Time since the run began; once it has ended, the slowest host (they run side by side). */
const elapsedMs = computed(() => {
  if (running.value && setup.run) return Math.max(0, now.value - Date.parse(setup.run.started_at))
  return Math.max(0, ...setup.discovering.map((h) => setup.lanes[h]?.ms ?? 0))
})

/** The draft's colour for the project a find belongs to. */
function colorOf(find: Find): string | null {
  const p = find.project
  if (!p || p === 'unassigned') return null
  return drafts.drafts.find((d) => d.id === p.id)?.color ?? null
}

function isPaired(find: Find): boolean {
  const p = find.project
  return !!p && p !== 'unassigned' && paired.value.has(p.id)
}

// The drafts follow the suggestions, so a project keeps its colour from here to step 3.
watch(
  () => setup.result,
  () => drafts.sync(),
  { immediate: true },
)

function onAdd(host: string, path: string, finish: (ok: boolean) => void) {
  const ok = drafts.addManualPath(host, path)
  finish(ok)
  if (ok) {
    toasts.push({
      tone: 'ok',
      title: t('setupDiscover.add.done', { path, host }),
      detail: t('setupDiscover.add.doneDetail'),
    })
  }
}

function onGroup() {
  if (!canContinue.value) return
  drafts.sync()
  void router.push('/setup/group')
}

function onBack() {
  void router.push('/setup')
}

/** Enter continues, unless it was meant for something the person is on. */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
  const target = e.target instanceof HTMLElement ? e.target : null
  if (target?.closest('button, a, input, select, textarea, [role="dialog"], [role="listbox"]')) {
    return
  }
  onGroup()
}

onMounted(() => {
  if (!scanSettings.synced) void scanSettings.load()
  window.addEventListener('keydown', onKey)
  if (setup.discovering.length === 0 && setup.ready.length === 0) void router.replace('/setup')
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <SetupFrame :step="2" :title="t('setupDiscover.title')" :subtitle="t('setupDiscover.subtitle')">
    <template #status>
      <UiChip
        :tone="running ? 'info' : 'ok'"
        :busy="running"
        :icon="running ? undefined : 'check'"
        :aria-label="t('setupDiscover.chip.label', { n: setup.finds, done, total })"
        data-testid="discover-chip"
      >
        <UiRoll :text="String(setup.finds)" />
        {{ t('setupDiscover.chip.found', { done, total }) }}
      </UiChip>
    </template>

    <div class="grid">
      <div v-enter="{ index: 2 }" class="lanes-col">
        <header class="sec">
          <b>{{ t('setupDiscover.hosts.title') }}</b>
          <span class="ct">{{ t('setupDiscover.hosts.atOnce', { n: atOnce }) }}</span>
        </header>
        <ul class="lanes" :aria-label="t('setupDiscover.hosts.list')">
          <DiscoverLane
            v-for="lane in lanes"
            :key="lane.host"
            :lane="lane"
            @read-again="setup.readAgain"
          />
        </ul>
        <AddPathCard class="add" :hosts="setup.ready" @add="onAdd" />
      </div>

      <div class="finds">
        <div class="col">
          <FindCard
            v-enter="{ index: 3 }"
            icon="globe"
            brand="nginx"
            :title="t('setupDiscover.columns.sites')"
            :meta="t('setupDiscover.columns.sitesMeta', { n: columns.sites.length })"
            :waiting="running"
            :empty="columns.sites.length === 0"
          >
            <FindRow
              v-for="f in columns.sites"
              :key="f.key"
              :find="f"
              :color="colorOf(f)"
              :fresh="newKeys.has(f.key)"
              :pulse="isPaired(f)"
            />
          </FindCard>
          <FindCard
            v-enter="{ index: 4 }"
            class="grow"
            icon="terminal"
            brand="pm2"
            :title="t('setupDiscover.columns.apps')"
            :meta="t('setupDiscover.columns.appsMeta', { n: columns.apps.length })"
            :waiting="running"
            :empty="columns.apps.length === 0"
          >
            <FindRow
              v-for="f in columns.apps"
              :key="f.key"
              :find="f"
              :color="colorOf(f)"
              :fresh="newKeys.has(f.key)"
              :pulse="isPaired(f)"
            />
            <template #footer><PairStrip :pairs="pairs" /></template>
          </FindCard>
        </div>

        <div class="col">
          <FindCard
            v-enter="{ index: 3 }"
            icon="container"
            brand="docker"
            :title="t('setupDiscover.columns.boxes')"
            :meta="t('setupDiscover.columns.boxesMeta', { n: columns.boxes.length })"
            :empty="columns.boxes.length === 0"
          >
            <FindRow
              v-for="f in columns.boxes"
              :key="f.key"
              :find="f"
              :color="colorOf(f)"
              :fresh="newKeys.has(f.key)"
              :pulse="isPaired(f)"
            />
          </FindCard>
          <FindCard
            v-enter="{ index: 4 }"
            icon="database"
            :title="t('setupDiscover.columns.dbs')"
            :meta="t('setupDiscover.columns.dbsMeta', { n: columns.dbs.length, k: columns.dbEnv })"
            :empty="columns.dbs.length === 0"
          >
            <FindRow
              v-for="f in columns.dbs"
              :key="f.key"
              :find="f"
              :color="colorOf(f)"
              :fresh="newKeys.has(f.key)"
              :pulse="isPaired(f)"
            />
          </FindCard>
          <ListeningCard v-enter="{ index: 5 }" :ports="listening" :fresh="newKeys" />
        </div>
      </div>
    </div>

    <template #summary>
      <span class="sum">
        <b>{{ t('setupDiscover.foot.hosts', { done, total }) }}</b>
        ·
        {{
          running
            ? t('setupDiscover.foot.elapsed', { time: duration(elapsedMs) })
            : t('setupDiscover.foot.elapsedDone', { time: duration(elapsedMs) })
        }}
        · {{ t('setupDiscover.foot.readOnly') }}
      </span>
      <UiProgressBar :value="fraction" size="md" :label="t('setupDiscover.foot.progress')" />
    </template>
    <template #hint>
      {{ canContinue ? t('setupDiscover.foot.hint') : t('setupDiscover.foot.hintWait') }}
    </template>
    <template #actions>
      <UiButton variant="ghost" data-testid="discover-back" @click="onBack">
        {{ t('setupShell.back') }}
      </UiButton>
      <UiButton
        variant="primary"
        size="large"
        trailing-icon="chevron-right"
        shortcut="⏎"
        lifted
        :disabled="!canContinue"
        data-testid="discover-group"
        @click="onGroup"
      >
        {{ t('setupDiscover.foot.groupPre') }}
        <UiRoll :text="String(setup.finds)" />
        {{ t('setupDiscover.foot.groupPost', setup.finds) }}
      </UiButton>
    </template>
  </SetupFrame>
  <DiscoverRail />
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  gap: var(--space-4);
  flex: 1 1 auto;
  min-width: 0;
}

.lanes-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.sec {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 var(--space-3) var(--space-1);
}

.sec b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.ct {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.lanes {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
}

.add {
  margin-top: auto;
}

.finds {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: stretch;
  min-width: 0;
}

.col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.grow {
  flex-grow: 1;
}

.sum {
  display: flex;
  gap: var(--space-1);
  align-items: baseline;
}

.sum b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}
</style>
