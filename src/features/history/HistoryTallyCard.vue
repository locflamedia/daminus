<!--
  "Since #1", from the board "Scan history": fixed, marked as expected, open now and the oldest
  open issue, so neglect is visible, and a line when a host has not answered for a while and
  its checks are missing from the newest bars.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Tally } from '@/lib/scan-history-tally'
import type { UnreachableRun } from '@/lib/scan-history-chart'

const props = defineProps<{ tally: Tally | null; runs: readonly UnreachableRun[]; since: number }>()

const { t } = useI18n()

const lines = computed(() => {
  const s = props.tally
  return [
    { key: 'fixed', value: s?.fixed ?? 0, tone: 'ok' },
    { key: 'expected', value: s?.expected ?? 0, tone: 'plain' },
    { key: 'open', value: s?.open ?? 0, tone: 'warn' },
    {
      key: 'oldest',
      value: s?.oldestOpen == null ? null : s.oldestOpen,
      tone: 'crit',
    },
  ] as const
})
</script>

<template>
  <section class="card">
    <h3 class="head">{{ t('historyScreen.tally.title', { seq: tally?.since ?? since }) }}</h3>
    <dl class="lines">
      <div v-for="l in lines" :key="l.key" class="line">
        <dt>{{ t(`historyScreen.tally.${l.key}`) }}</dt>
        <dd :class="`tone-${l.tone}`">
          <template v-if="l.value === null">{{ t('historyScreen.tally.none') }}</template>
          <template v-else-if="l.key === 'oldest'">
            {{ t('historyScreen.tally.oldestValue', { n: l.value }, l.value) }}
          </template>
          <template v-else>{{ l.value }}</template>
        </dd>
      </div>
    </dl>
    <p v-for="run in runs" :key="run.host" class="note">
      {{
        t(
          'historyScreen.tally.unreachable',
          { host: run.host, since: run.since, n: run.scans },
          run.scans,
        )
      }}
    </p>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.head {
  min-height: 20px;
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
}

.line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: var(--ink-2);
  font-size: var(--text-12);
}

dt {
  margin: 0;
}

dd {
  margin: 0;
  font-size: 16px;
  font-weight: var(--weight-medium);
}

.tone-ok {
  color: var(--ok-ink);
}

.tone-plain {
  color: var(--ink-2);
}

.tone-warn {
  color: var(--warn-ink);
}

.tone-crit {
  color: var(--crit-ink);
}

.note {
  margin: auto 0 0;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
