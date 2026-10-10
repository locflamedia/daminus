<!--
  The notes above a result screen's body, whose values stay in place: the scan reading this
  project or server now, hosts the last scan could not reach (their values are from an earlier
  scan and keep their colour), and results over a day old. Board 30, "Result screens · shared
  states".
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'

defineProps<{
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
}>()
const emit = defineEmits<{ scan: []; retry: [hosts: readonly string[]] }>()
const { t } = useI18n()
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
    v-if="unreachable.length > 0"
    class="note"
    tone="crit"
    icon="unreachable"
    :title="
      unreachableSince !== null
        ? t('projectShared.unreachable.title', {
            hosts: unreachable.join(', '),
            seq: unreachableSince,
          })
        : t('projectShared.unreachable.noneTitle', { hosts: unreachable.join(', '), seq: seq ?? 0 })
    "
    :text="
      unreachableSince !== null
        ? t('projectShared.unreachable.kept', { seq: unreachableSince })
        : t('projectShared.unreachable.none')
    "
  >
    <template #trailing>
      <UiButton icon="refresh" :disabled="busy" @click="emit('retry', unreachable)">
        {{ t('projectShared.unreachable.retry', { hosts: unreachable.join(', ') }) }}
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
