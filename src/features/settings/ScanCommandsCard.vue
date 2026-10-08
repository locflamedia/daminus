<!--
  Settings › Scan, "What runs on each host": the exact read-only commands of the groups that are
  on, then where the time went per group in the newest scan, and Copy all. A group that turns
  on or off adds or removes its lines with a cross-fade.
-->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyText } from '@/api'
import {
  type CommandLine,
  commandLines,
  commandsText,
  estimateSeconds,
  groupTimes,
} from '@/lib/scan-commands'
import { useHistoryStore } from '@/stores/history'
import { useScanSettingsStore } from '@/stores/scan-settings'
import { useSetupStore } from '@/stores/setup'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'

const { t } = useI18n()
const store = useScanSettingsStore()
const history = useHistoryStore()
const setup = useSetupStore()

const lines = computed(() => commandLines(store.scan.disabled_groups))
const times = computed(() => groupTimes(history.view))
const longest = computed(() => Math.max(0.1, ...(times.value?.times.map((x) => x.seconds) ?? [])))
const hostCount = computed(() => setup.entries.length)
const seconds = computed(() =>
  estimateSeconds(history.view, hostCount.value, store.scan.hosts_at_once),
)
const who = computed(() => {
  const first = setup.entries[0]
  const user = first?.resolved?.user
  return first && user ? { user, host: first.host.alias } : null
})

function note(line: CommandLine): string {
  return line.note ? t(`settingsScan.runs.notes.${line.note}`) : ''
}

function seconds1(n: number): string {
  return t('settingsScan.runs.time', { n: n.toFixed(1) })
}

onMounted(() => {
  void history.load()
  if (setup.listing === null) void setup.load()
})
</script>

<template>
  <section class="card" aria-labelledby="scan-runs-title">
    <h3 id="scan-runs-title" class="ct">
      <UiIcon name="terminal" />{{ t('settingsScan.runs.title') }}
      <span class="m">{{ t('settingsScan.runs.readOnly') }}</span>
    </h3>
    <div class="code" role="region" :aria-label="t('settingsScan.runs.title')" tabindex="0">
      <div class="line d">
        {{
          who
            ? t('settingsScan.runs.as', { who: `${who.user}@${who.host}` })
            : t('settingsScan.runs.asYou')
        }}
      </div>
      <TransitionGroup name="fade">
        <div
          v-for="line in lines"
          :key="line.key"
          class="line"
          :class="{ warn: line.kind === 'command' && line.group === 'code_changes' }"
        >
          <template v-if="line.kind === 'command'">
            {{ line.text }}<span v-if="line.note" class="d note">{{ note(line) }}</span>
          </template>
          <span v-else class="d">{{ note(line) }}</span>
        </div>
      </TransitionGroup>
      <div v-if="seconds !== null" class="line ok">
        {{ t('settingsScan.runs.estimate', { s: seconds, n: hostCount }, hostCount) }}
      </div>
    </div>
    <ul
      v-if="times && times.times.length > 0"
      class="bars"
      :aria-label="t('settingsScan.runs.where')"
    >
      <li v-for="item in times.times" :key="item.group" class="bar-row">
        <span>{{ t(`settingsScan.runs.groups.${item.group}`) }}</span>
        <span class="bar"><i :style="{ width: `${(item.seconds / longest) * 100}%` }" /></span>
        <span class="mono val">{{ seconds1(item.seconds) }}</span>
      </li>
    </ul>
    <div class="foot">
      <span class="lbl">
        {{
          times
            ? t('settingsScan.runs.fromScan', { seq: times.seq })
            : t('settingsScan.runs.noScan')
        }}
      </span>
      <UiButton size="small" icon="copy" class="copy" @click="copyText(commandsText(lines))">
        {{ t('settingsScan.runs.copyAll') }}
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-hairline);
}

.ct {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.ct :deep(svg) {
  color: var(--ink-3);
}

.m {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.code {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--code);
  color: var(--code-ink);
  font: 400 10.5px / 1.65 var(--font-mono);
}

.code:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.line {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.d {
  color: var(--code-dim);
}

.note {
  margin-left: 1.5ch;
}

.ok {
  color: var(--code-ok);
}

.warn {
  color: var(--code-warn);
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity var(--dur-state) var(--ease-out),
    transform var(--dur-state) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bar-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 40px;
  gap: var(--space-2);
  align-items: center;
  color: var(--ink-2);
  font-size: var(--text-11);
}

.bar {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--surface-2);
}

.bar i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 3px;
  background: var(--chart-accent-70);
  transition: width var(--dur-bar) var(--ease-out);
}

.val {
  color: var(--ink-3);
  text-align: right;
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: auto;
}

.lbl {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.copy {
  margin-left: auto;
}
</style>
