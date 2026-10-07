<!--
  The "Login test" cell of a host row: the one chip of the ten that says where the test is.
  A reached host reads "Connected" with the three-bar latency signal and the time; a host that
  is being read shows a spinner; a failure keeps its tick and says so under the word. The
  words that need no room (queued, connecting, waiting for the agent) are the small chips.
  The sentence of the state is the tooltip.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CONNECT_TIMEOUT_S, formatLatency, latencyOf } from '@/lib/host-rows'
import { useSettingsStore } from '@/stores/settings'
import { type TestChip, isFailed } from '@/lib/host-test'
import UiChip from '@/ui/UiChip.vue'
import UiSpinner from '@/ui/UiSpinner.vue'
import UiStatusDot from '@/ui/UiStatusDot.vue'
import UiTooltip from '@/ui/UiTooltip.vue'

const props = defineProps<{ chip: TestChip; ms: number | null; ticked: boolean }>()

const { t } = useI18n()
const settings = useSettingsStore()

const latency = computed(() => (props.ms === null ? null : latencyOf(props.ms)))
const failed = computed(() => isFailed(props.chip))
const warnTone = computed(() => props.chip === 'host_key_unknown')
const tip = computed(() => t(`setupPick.tip.${props.chip}`, { n: CONNECT_TIMEOUT_S }))
</script>

<template>
  <UiTooltip :text="tip">
    <span class="cell" :data-chip="chip">
      <template v-if="chip === 'reached'">
        <span v-if="latency" class="bars" :class="{ slow: latency.bars < 3 }" aria-hidden="true">
          <i /><i /><i :class="{ off: latency.bars < 3 }" />
        </span>
        <span class="word">{{
          latency?.slow ? t('setupPick.chip.slow') : t('setupPick.chip.connected')
        }}</span>
        <span v-if="ms !== null" class="mono ms" :class="{ slow: latency?.bars === 2 }">{{
          formatLatency(ms, settings.language)
        }}</span>
      </template>

      <template v-else-if="chip === 'testing'">
        <UiSpinner :size="14" class="spin" />
        <span class="word testing">{{ t('setupPick.chip.testingRow') }}</span>
      </template>

      <UiChip v-else-if="chip === 'queued'" tone="neutral" icon="circle">
        {{ t('setupPick.chip.queued') }}
      </UiChip>
      <UiChip v-else-if="chip === 'connecting'" tone="info" busy>
        {{ t('setupPick.chip.connecting') }}
      </UiChip>
      <UiChip v-else-if="chip === 'agent_wait'" tone="info" icon="key">
        {{ t('setupPick.chip.agent_wait') }}
      </UiChip>

      <template v-else-if="failed">
        <UiStatusDot :state="warnTone ? 'warn' : 'crit'" halo :pulse="!warnTone" class="dot" />
        <span class="stack">
          <b class="word" :class="warnTone ? 'warn' : 'crit'">{{ t(`setupPick.chip.${chip}`) }}</b>
          <span v-if="ticked" class="kept">{{ t('setupPick.chip.kept') }}</span>
        </span>
      </template>
    </span>
  </UiTooltip>
</template>

<style scoped>
.cell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-12);
}

.bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
  color: var(--ok-solid);
}

.bars.slow {
  color: var(--warn-solid);
}

.bars i {
  display: block;
  width: 3px;
  border-radius: 2px;
  background: currentColor;
  transform-origin: bottom;
}

.bars i:nth-child(1) {
  height: 5px;
}

.bars i:nth-child(2) {
  height: 8px;
}

.bars i:nth-child(3) {
  height: 12px;
}

.bars i.off {
  opacity: 0.25;
}

.word {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.word.testing {
  color: var(--accent-ink);
}

.word.crit {
  color: var(--crit-ink);
}

.word.warn {
  color: var(--warn-ink);
}

.ms {
  color: var(--ok-solid);
  font-size: var(--text-11);
}

.ms.slow {
  color: var(--warn-solid);
}

.spin {
  color: var(--accent-ink);
}

.dot {
  margin: 0 var(--space-1);
}

.stack {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.kept {
  color: var(--ink-3);
  font-size: 10px;
}
</style>
