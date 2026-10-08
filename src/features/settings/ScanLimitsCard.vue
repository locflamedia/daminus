<!--
  Settings › Scan, "Limits": how long a host may take to answer and how many are asked together.
  Each reachable host has a fixed 90 s for its checks; Auto is the number of hosts, up to eight.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CONNECT_TIMEOUTS_S, HOSTS_AT_ONCE } from '@/lib/scan-settings'
import { useScanSettingsStore } from '@/stores/scan-settings'
import UiSeg, { type SegOption } from '@/ui/UiSeg.vue'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const { t } = useI18n()
const store = useScanSettingsStore()

const timeouts = computed<SegOption[]>(() =>
  CONNECT_TIMEOUTS_S.map((n) => ({
    value: String(n),
    label: t('settingsScan.limits.seconds', { n }),
  })),
)
const atOnce = computed<SegOption[]>(() =>
  HOSTS_AT_ONCE.map((n) => ({
    value: n === null ? 'auto' : String(n),
    label: n === null ? t('settingsScan.limits.auto') : String(n),
  })),
)

function pickAtOnce(value: string) {
  store.setHostsAtOnce(value === 'auto' ? null : Number(value))
}
</script>

<template>
  <SettingsCard :title="t('settingsScan.limits.title')" tight>
    <SettingsRow
      :title="t('settingsScan.limits.timeout')"
      :hint="t('settingsScan.limits.timeoutHint')"
    >
      <UiSeg
        :model-value="String(store.scan.connect_timeout_s)"
        :options="timeouts"
        :label="t('settingsScan.limits.timeout')"
        semantics="radio"
        @update:model-value="(v: string) => store.setConnectTimeout(Number(v))"
      />
    </SettingsRow>
    <SettingsRow
      :title="t('settingsScan.limits.atOnce')"
      :hint="t('settingsScan.limits.atOnceHint')"
    >
      <UiSeg
        :model-value="store.scan.hosts_at_once === null ? 'auto' : String(store.scan.hosts_at_once)"
        :options="atOnce"
        :label="t('settingsScan.limits.atOnce')"
        semantics="radio"
        @update:model-value="pickAtOnce"
      />
    </SettingsRow>
  </SettingsCard>
</template>
