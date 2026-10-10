<!--
  The notes above a result screen's body, whose values stay in place: the scan reading this
  project or server now, hosts the last scan could not reach (their values are from an earlier
  scan and keep their colour), and results over a day old. Board 30, "Result screens · shared
  states". A host that failed for a reason other than the network says why and offers the one
  step that fixes it, as the Overview card does (board 30, "Overview card · cause and next
  step"); only network failures are retried.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hostFixIcon, hostFixLabel, hostFixOf, useHostFix } from '@/features/overview/use-host-fix'
import { outcomeKey, outcomeTone } from '@/lib/outcome-label'
import { failedOutcome } from '@/lib/server-facts'
import { useProjectsStore } from '@/stores/projects'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'

const props = defineProps<{
  /** The host the running scan reads for this screen; `null` when none. */
  scanningHost: string | null
  /** Hosts that did not answer the latest scan while older values are shown. */
  unreachable: readonly string[]
  /** The scan the older values of those hosts are from; `null` when none is shown. */
  unreachableSince: number | null
  /** Whole days the results are old; `null` under a day. */
  oldDays: number | null
  seq: number | null
  busy: boolean
  /** The project the screen shows, so Edit project opens that one. */
  project?: string
}>()
const emit = defineEmits<{ scan: []; retry: [hosts: readonly string[]] }>()
const { t } = useI18n()
const projects = useProjectsStore()
const fixes = useHostFix()

const failed = computed(() =>
  props.unreachable.map((host) => {
    const outcome = failedOutcome(projects.server(host))
    return { host, outcome, fix: hostFixOf(outcome) }
  }),
)
/** Hosts the network failed: one note, retried together. */
const network = computed(() => failed.value.filter((f) => f.fix === 'retry').map((f) => f.host))
/** Hosts that failed for another reason: one note each, with its own step. */
const others = computed(() => failed.value.filter((f) => f.fix !== 'retry'))
/** What the values below are, the same for every host that did not answer. */
const kept = computed(() =>
  props.unreachableSince !== null
    ? t('projectShared.unreachable.kept', { seq: props.unreachableSince })
    : t('projectShared.unreachable.none'),
)
</script>

<template>
  <UiBanner
    v-if="scanningHost"
    class="note"
    tone="info"
    icon="refresh"
    :title="t('projectShared.scanning.title', { host: scanningHost })"
    :text="t('projectShared.scanning.text')"
  />
  <UiBanner
    v-if="network.length > 0"
    class="note"
    tone="crit"
    icon="unreachable"
    :title="
      unreachableSince !== null
        ? t('projectShared.unreachable.title', { hosts: network.join(', '), seq: unreachableSince })
        : t('projectShared.unreachable.noneTitle', { hosts: network.join(', '), seq: seq ?? 0 })
    "
    :text="kept"
  >
    <template #trailing>
      <UiButton icon="refresh" :disabled="busy" @click="emit('retry', network)">
        {{ t('projectShared.unreachable.retry', { hosts: network.join(', ') }) }}
      </UiButton>
    </template>
  </UiBanner>
  <UiBanner
    v-for="f in others"
    :key="f.host"
    class="note"
    :tone="outcomeTone(f.outcome) === 'warn' ? 'warn' : 'crit'"
    :icon="outcomeTone(f.outcome) === 'warn' ? 'warn' : 'critical'"
    :title="t(`overviewScreen.status.cause.${outcomeKey(f.outcome)}`, { host: f.host })"
    :text="kept"
  >
    <template v-if="fixes.can(f.fix, f.host, project)" #trailing>
      <UiButton :icon="hostFixIcon(f.fix)" @click="fixes.run(f.fix, f.host, f.outcome, project)">
        {{ hostFixLabel(f.fix) }}
      </UiButton>
    </template>
  </UiBanner>
  <UiBanner
    v-if="oldDays !== null && seq !== null"
    class="note"
    tone="warn"
    icon="clock"
    :title="t('projectShared.old.title', { seq, n: oldDays }, oldDays)"
    :text="t('projectShared.old.text')"
  >
    <template #trailing>
      <UiButton :disabled="busy" @click="emit('scan')">{{ t('projectShared.old.scan') }}</UiButton>
    </template>
  </UiBanner>
</template>

<style scoped>
.note {
  flex: none;
}
</style>
