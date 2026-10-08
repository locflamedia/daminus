<!--
  The host chips under the toolbar of a running scan (board "Overview · scanning"): one chip per
  host with a word for where it is (queued, reading…, done, failed), the cause in its tooltip.
  The note at the right says the cards keep their order until the scan ends.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { scanHosts, type ChipState } from '@/lib/overview-scan'
import { useScanStore } from '@/stores/scan'
import UiIcon from '@/ui/UiIcon.vue'

const { t } = useI18n()
const scan = useScanStore()

const hosts = computed(() => scanHosts(scan.run))

const TONE: Record<ChipState, string> = {
  queued: 'idle',
  reading: 'busy',
  done: 'ok',
  failed: 'crit',
}

function tone(chip: ChipState, outcome: string | undefined): string {
  return chip === 'done' && outcome === 'partial' ? 'warn' : TONE[chip]
}

/** One of four words; a host waiting for the SSH agent says so. */
function word(chip: ChipState, agentWait: boolean): string {
  return agentWait
    ? t('scanHost.agent_wait')
    : t(`scanChip.${chip === 'reading' ? 'reading' : chip}`)
}
</script>

<template>
  <div class="chips">
    <span
      v-for="h in hosts"
      :key="h.host"
      class="host-chip"
      :class="tone(h.chip, h.outcome?.state)"
      :title="t(`scanHost.${h.detail}`)"
    >
      <span class="mark"><UiIcon name="server" :size="12" /></span>
      <span class="mono">{{ h.host }}</span>
      <span class="state">{{ word(h.chip, h.agentWait) }}</span>
    </span>
    <span class="grow" />
    <span class="note">{{ t('toolbar.orderHolds') }}</span>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.host-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--h-control-sm);
  padding: 0 10px 0 5px;
  border-radius: var(--radius-full);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.host-chip .mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--surface-0);
}

.host-chip .state {
  font-weight: var(--weight-regular);
}

.host-chip.ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.host-chip.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.host-chip.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.host-chip.busy {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.host-chip.idle {
  background: var(--surface-1);
  color: var(--ink-3);
}

.grow {
  flex-grow: 1;
}

.note {
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
