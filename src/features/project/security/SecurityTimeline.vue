<!--
  "How it unfolded", from the board "Project · Security": the last scans as a vertical line that
  turns red where trouble starts. The order of events is the best clue after a compromise, and
  the saved scans make it free. Each line is read from the report of that scan.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { staggerDelay } from '@/lib/motion'
import { lineGradient, type TimelineEvent, type TimelineTone } from '@/lib/security-timeline'
import { formatDate } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'
import UiCard from '@/ui/UiCard.vue'
import UiIcon from '@/ui/UiIcon.vue'
import { useMsg } from './use-msg'

const props = defineProps<{
  events: readonly TimelineEvent[]
  play: boolean
  latestSeq: number | null
}>()

const { t } = useI18n()
const msg = useMsg()
const fmt = useFormat()
const settings = useSettingsStore()

const COLORS: Record<TimelineTone, string> = {
  ok: 'var(--ok-solid)',
  warn: 'var(--warn-solid)',
  crit: 'var(--crit-solid)',
  info: 'var(--accent)',
}

const gradient = computed(() => lineGradient(props.events, COLORS))

function stamp(e: TimelineEvent): string {
  const day =
    e.seq === props.latestSeq
      ? t('projectSecurity.timeline.today')
      : formatDate(e.at, settings.language)
  return t('projectSecurity.timeline.line', { seq: `#${e.seq}`, date: day })
}

function text(e: TimelineEvent): string {
  const base = msg('event', e.text)
  return e.more > 0 ? `${base} ${t('projectSecurity.event.more', { n: e.more })}` : base
}
</script>

<template>
  <UiCard v-if="events.length > 0" class="tl" :style="{ '--card-gap': '10px' }">
    <div class="head">
      <UiIcon name="clock" :size="16" />
      <span class="title">{{ t('projectSecurity.timeline.title') }}</span>
      <span class="meta">{{ t('projectSecurity.timeline.meta', { n: events.length }) }}</span>
    </div>
    <ol class="list">
      <span
        class="line"
        :class="{ 'm-grow': play }"
        aria-hidden="true"
        :style="{ background: gradient }"
      />
      <li v-for="(e, i) in events" :key="e.seq" class="ev">
        <span
          class="dot"
          :class="[`t-${e.tone}`, { 'm-pop': play }]"
          :style="{ '--d': staggerDelay(i, 700) }"
        />
        <div class="tx" :class="{ 'm-late': play }" :style="{ '--d': staggerDelay(i, 700) }">
          <span class="when">{{ stamp(e) }}</span>
          <span class="what">{{ text(e) }}</span>
          <span class="sr-only">{{ fmt.dateTime(e.at) }}</span>
        </div>
      </li>
    </ol>
  </UiCard>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.head .icon {
  color: var(--ink-3);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0 0 0 2px;
  list-style: none;
}

.line {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 9px;
  width: 2px;
  border-radius: 2px;
  transform-origin: top;
}

.line.m-grow {
  transform-origin: top;
  animation-name: line-down;
}

@keyframes line-down {
  from {
    transform: scaleY(0);
  }
}

.ev {
  position: relative;
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 10px;
  align-items: start;
}

.dot {
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--surface-0);
}

.dot.t-ok {
  box-shadow: inset 0 0 0 4px var(--ok-solid);
}

.dot.t-warn {
  box-shadow: inset 0 0 0 4px var(--warn-solid);
}

.dot.t-crit {
  box-shadow: inset 0 0 0 4px var(--crit-solid);
}

.dot.t-info {
  box-shadow: inset 0 0 0 4px var(--accent);
}

.tx {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.when {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-11);
}

.what {
  font-size: var(--text-12);
  line-height: 1.4;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
