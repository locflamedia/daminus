<!--
  Setup, step 1: the hosts of the ssh config, ticked one by one. A host is tested for login as
  soon as it is ticked and its row follows that test live; a failure stays inline and never
  blocks the others. The primary action counts the hosts that logged in.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { errorText } from '@/lib/issue-text'
import { vEnter } from '@/lib/motion'
import {
  type Segment,
  buildRows,
  cardKind,
  filterRows,
  headerStatus,
  segmentCounts,
  selectState,
  testCounts,
  testProgress,
} from '@/lib/host-rows'
import { useSetupStore } from '@/stores/setup'
import UiBanner from '@/ui/UiBanner.vue'
import SshConfigBanner from './components/SshConfigBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiChipMorph from '@/ui/UiChipMorph.vue'
import UiCheckbox from '@/ui/UiCheckbox.vue'
import UiProgressBar from '@/ui/UiProgressBar.vue'
import UiRoll from '@/ui/UiRoll.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import SetupFrame from './SetupFrame.vue'
import FailCard from './pick/FailCard.vue'
import LeftOut from './pick/LeftOut.vue'
import PermissionPanel from './pick/PermissionPanel.vue'
import PickRow from './pick/PickRow.vue'
import PickToolbar from './pick/PickToolbar.vue'
import TermiusTip from './pick/TermiusTip.vue'
import TestRail from './pick/TestRail.vue'

const { t } = useI18n()
const router = useRouter()
const setup = useSetupStore()

const query = ref('')
const segment = ref<Segment>('all')
/** The reached host whose permission rows are open. */
const opened = ref<string | null>(null)
/** The row last pointed at or focused: the rail prints its command. */
const focused = ref<string | null>(null)
const toolbar = ref<InstanceType<typeof PickToolbar>>()

const rows = computed(() =>
  buildRows(setup.entries, {
    isTicked: setup.isTicked,
    chip: setup.chip,
    login: (alias) => setup.logins[alias]?.login ?? null,
    ms: (alias) => setup.answers[alias]?.ms ?? null,
  }),
)
const visible = computed(() => filterRows(rows.value, query.value, segment.value))
const counts = computed(() => segmentCounts(rows.value))
const stats = computed(() => testCounts(rows.value))
const status = computed(() => headerStatus(stats.value))
const selection = computed(() => selectState(rows.value))
const railAlias = computed(
  () => focused.value ?? setup.ticked[setup.ticked.length - 1] ?? rows.value[0]?.alias ?? '',
)
const loadingRows = computed(() => setup.listing === null && setup.loading)
const discoverCount = computed(() => setup.ready.length)

let preTicked = false
// No host to pick at all (no file, or nothing usable in it): the empty app says why.
watch(
  () => [setup.listing, setup.loading] as const,
  ([listing, loading]) => {
    if (listing === null || loading) return
    if (setup.entries.length === 0) {
      void router.replace('/')
      return
    }
    // The board opens with every host ticked: each gets its login test as the screen opens.
    if (!preTicked && setup.ticked.length === 0 && Object.keys(setup.answers).length === 0) {
      preTicked = true
      setup.tickAll(true)
    }
  },
  { immediate: true },
)

function toggleOpen(alias: string) {
  opened.value = opened.value === alias ? null : alias
}

function selectReady() {
  for (const row of rows.value) if (row.chip === 'reached') setup.tick(row.alias, true)
}

function skip(alias: string) {
  if (opened.value === alias) opened.value = null
  setup.skip(alias)
}

async function discover() {
  if (discoverCount.value === 0) return
  await setup.startDiscover()
  await router.push('/setup/discover')
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, button, a') !== null)
  )
}

function onKey(event: KeyboardEvent) {
  const mod = event.metaKey || event.ctrlKey
  if (mod && event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault()
    void setup.reload()
    return
  }
  if (mod || event.altKey || typing(event.target)) return
  if (event.key === '/') {
    event.preventDefault()
    toolbar.value?.focusSearch()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void discover()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <SetupFrame :step="1" :title="t('setupPick.title')">
    <template #subtitle>
      <i18n-t
        scope="global"
        :keypath="setup.skipped.length > 0 ? 'setupPick.subtitle' : 'setupPick.subtitleNoneLeft'"
        tag="span"
      >
        <template #file><span class="mono">~/.ssh/config</span></template>
        <template #entries>{{
          t(
            'setupPick.entries',
            { n: setup.entries.length + setup.skipped.length },
            setup.entries.length + setup.skipped.length,
          )
        }}</template>
        <template #left>{{ t('setupPick.leftOut', { n: setup.skipped.length }) }}</template>
      </i18n-t>
    </template>

    <template v-if="status.kind !== 'idle'" #status>
      <UiChipMorph
        v-if="status.kind === 'testing'"
        tone="info"
        busy
        :label="t('setupPick.status.testing', { n: status.pending, total: status.total })"
      />
      <UiChipMorph
        v-else
        tone="ok"
        icon="check"
        :label="t('setupPick.status.done', { total: status.total })"
      />
    </template>

    <SshConfigBanner
      v-if="setup.configProblem"
      :problem="setup.configProblem"
      :busy="setup.loading"
      @recheck="setup.load()"
    />
    <UiBanner
      v-else-if="setup.error"
      tone="crit"
      icon="critical"
      alert
      :title="t('setupPick.error.title')"
      :text="errorText(setup.error)"
    >
      <template #trailing>
        <UiButton icon="refresh" :busy="setup.loading" @click="setup.load()">
          {{ t('setupPick.error.retry') }}
        </UiButton>
      </template>
    </UiBanner>

    <PickToolbar
      ref="toolbar"
      v-model:query="query"
      v-model:segment="segment"
      :counts="counts"
      @select-ready="selectReady"
      @add-host="setup.addHostOpen = true"
    />

    <div class="table" role="table" :aria-busy="loadingRows || undefined">
      <div class="cols head" role="row">
        <span role="columnheader" class="all">
          <UiCheckbox
            :model-value="selection === 'all'"
            :indeterminate="selection === 'some'"
            :disabled="rows.length === 0"
            @update:model-value="(on: boolean) => setup.tickAll(on)"
          >
            <span class="sr">{{ t('setupPick.columns.selectAll') }}</span>
          </UiCheckbox>
        </span>
        <span role="columnheader">{{ t('setupPick.columns.host') }}</span>
        <span role="columnheader">{{ t('setupPick.columns.user') }}</span>
        <span role="columnheader">{{ t('setupPick.columns.route') }}</span>
        <span role="columnheader">{{ t('setupPick.columns.system') }}</span>
        <span role="columnheader">{{ t('setupPick.columns.login') }}</span>
        <span role="columnheader">{{ t('setupPick.columns.key') }}</span>
      </div>

      <template v-if="loadingRows">
        <div v-for="n in 4" :key="n" class="cols ghost" :class="{ odd: n % 2 === 1 }">
          <UiSkeleton width="16px" height="16px" radius="5px" />
          <UiSkeleton width="60%" height="15px" />
          <UiSkeleton width="50%" />
          <UiSkeleton width="70%" height="20px" radius="6px" />
          <UiSkeleton width="60%" />
          <UiSkeleton width="50%" />
          <UiSkeleton width="60%" />
        </div>
      </template>

      <template v-else>
        <PickRow
          v-for="(row, index) in visible"
          :key="row.alias"
          v-enter="{ index: Math.min(index, 8) }"
          :row="row"
          :odd="index % 2 === 0"
          :open="opened === row.alias && row.chip === 'reached'"
          @tick="(on) => setup.tick(row.alias, on)"
          @toggle="toggleOpen(row.alias)"
          @focus="focused = row.alias"
        >
          <FailCard
            v-if="row.ticked && cardKind(row.chip)"
            :row="row"
            :kind="cardKind(row.chip)!"
            :outcome="setup.answers[row.alias]?.outcome ?? null"
            :host-key="setup.answers[row.alias]?.hostKey ?? null"
            @skip="skip(row.alias)"
            @retry="setup.retest(row.alias)"
          />
          <PermissionPanel
            v-else-if="
              opened === row.alias && row.chip === 'reached' && setup.logins[row.alias]?.login
            "
            :row="row"
            :login="setup.logins[row.alias]!.login!"
            @close="opened = null"
          />
        </PickRow>
        <p v-if="visible.length === 0 && rows.length > 0" class="none">
          {{ t('setupPick.filter.none') }}
        </p>
      </template>
    </div>

    <LeftOut :skipped="setup.skipped" />
    <TermiusTip :busy="setup.loading" @reload="setup.reload()" />

    <template #summary>
      <div class="counts">
        <b><UiRoll :text="t('setupPick.footer.ready', { n: stats.ready })" /></b>
        <span>·</span>
        <UiRoll :text="t('setupPick.footer.failed', { n: stats.failed })" />
        <span>·</span>
        <UiRoll :text="t('setupPick.footer.testing', { n: stats.testing })" />
      </div>
      <UiProgressBar
        :value="testProgress(stats)"
        size="md"
        :label="t('setupPick.footer.progress')"
      />
    </template>
    <template #hint>{{ t('setupPick.footer.hint') }}</template>
    <template #actions>
      <UiButton variant="ghost" @click="router.push('/')">{{
        t('setupPick.footer.back')
      }}</UiButton>
      <UiButton
        variant="primary"
        size="large"
        shortcut="⏎"
        trailing-icon="chevron-right"
        :disabled="discoverCount === 0"
        :disabled-reason="discoverCount === 0 ? t('setupPick.footer.none') : undefined"
        @click="discover"
      >
        <i18n-t
          scope="global"
          keypath="setupPick.footer.discover"
          tag="span"
          :plural="discoverCount"
        >
          <template #n><UiRoll :text="String(discoverCount)" /></template>
        </i18n-t>
      </UiButton>
    </template>
  </SetupFrame>

  <Teleport to="#setup-rail" defer>
    <TestRail :alias="railAlias" />
  </Teleport>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-inline: calc(-1 * var(--space-2));
}

.cols {
  display: grid;
  grid-template-columns: 16px minmax(0, 1.3fr) 112px 150px 170px 200px 104px;
  gap: var(--space-4);
  align-items: center;
  padding: 0 var(--space-4);
}

.head {
  height: 24px;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.all :deep(.check) {
  gap: 0;
  height: 16px;
  padding: 0;
  background: transparent !important;
}

.all :deep(.label),
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.ghost {
  height: 56px;
  border-radius: 14px;
}

.ghost.odd {
  background: var(--surface-well);
}

.none {
  margin: 0;
  padding: var(--space-5) var(--space-4);
  color: var(--ink-3);
  font-size: var(--text-12);
}

.counts {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.counts b {
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}
</style>
