<!--
  One answer in the Ask thread, from the board "AI · Ask": while the model is waited for, a
  line that names what is being read over three shimmer bars; then the health pill and how long
  it took, the summary as it streams (a caret marks the end while more may come) and the
  findings as cards. The health and every card's severity come from the checks the findings
  name, never from the AI. A send that failed shows the words for its error code and a way to
  try again; a stopped one says so quietly. Text is always text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { errorText } from '@/lib/issue-text'
import type { AiTurn } from '@/stores/ai-thread'
import { useOverviewStore } from '@/stores/overview'
import { useReportStore } from '@/stores/report'
import UiButton from '@/ui/UiButton.vue'
import { countInScope } from './ask-scope'
import AskFindingCard from './AskFindingCard.vue'
import { resolveFindings, worstTone } from '../findings/resolve-findings'

const props = defineProps<{ turn: AiTurn }>()
const emit = defineEmits<{ stop: []; retry: [] }>()

const { t } = useI18n()
const fmt = useFormat()
const report = computed(() => useReportStore().latest)
const baseline = computed(() => useOverviewStore().baselineSeq)

const live = computed(() => props.turn.status === 'waiting' || props.turn.status === 'streaming')
const waiting = computed(
  () => live.value && props.turn.summary === '' && props.turn.findings.length === 0,
)
const resolved = computed(() => resolveFindings(props.turn.findings, report.value))
const health = computed(() => (props.turn.status === 'done' ? worstTone(resolved.value) : null))
const reading = computed(() => {
  const n = countInScope(report.value, props.turn.scope)
  return baseline.value === null
    ? t('aiAsk.reading', { n })
    : t('aiAsk.readingDiff', { n, seq: baseline.value })
})
const took = computed(() =>
  props.turn.status === 'done' && props.turn.elapsedMs !== null
    ? t('aiAsk.answeredIn', { time: fmt.duration(props.turn.elapsedMs) })
    : null,
)
const failure = computed(() => (props.turn.error ? errorText(props.turn.error) : ''))
</script>

<template>
  <div class="answer" :aria-busy="live">
    <div v-if="waiting" class="think" role="status">
      <span class="reading"
        ><span class="dots" aria-hidden="true"><i /><i /><i /></span>{{ reading }}</span
      >
      <span class="m-think bar" style="width: 92%" />
      <span class="m-think bar" style="width: 78%" />
      <span class="m-think bar" style="width: 60%" />
    </div>
    <template v-else>
      <div v-if="health || took" class="meta">
        <span v-if="health" class="health" :class="health"
          ><span class="pip" aria-hidden="true" />{{
            t('aiAsk.health', { level: t(`aiAsk.healthLevel.${health}`) })
          }}</span
        >
        <span v-if="took" class="took">{{ took }}</span>
      </div>
      <p v-if="turn.summary" class="summary">
        {{ turn.summary }}<span v-if="live" class="caret" aria-hidden="true" />
      </p>
      <p v-else-if="turn.status === 'done' && resolved.length === 0" class="quiet">
        {{ t('aiAsk.noAnswerText') }}
      </p>
      <AskFindingCard v-for="finding in resolved" :key="finding.id" :finding="finding" />
    </template>
    <div v-if="live" class="foot">
      <UiButton variant="ghost" size="small" @click="emit('stop')">{{ t('aiAsk.stop') }}</UiButton>
    </div>
    <div v-else-if="turn.status === 'error'" class="state" role="alert">
      <span class="why">{{ failure }}</span>
      <UiButton variant="secondary" size="small" @click="emit('retry')">{{
        t('aiAsk.tryAgain')
      }}</UiButton>
    </div>
    <div v-else-if="turn.status === 'cancelled'" class="state" role="status">
      <span class="quiet">{{ t('aiAsk.stopped') }}</span>
      <UiButton variant="ghost" size="small" @click="emit('retry')">{{
        t('aiAsk.askAgain')
      }}</UiButton>
    </div>
  </div>
</template>

<style scoped>
.answer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.think {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.reading {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--accent-ink);
  font-size: var(--text-12);
}

.dots {
  display: inline-flex;
  gap: 3px;
}

.dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: ask-dot 1s ease-in-out infinite;
}

.dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.dots i:nth-child(3) {
  animation-delay: 0.3s;
}

.bar {
  height: 12px;
  max-width: 100%;
}

.meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.health {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: var(--text-12);
  font-weight: var(--weight-semibold);
}

.pip {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentcolor;
}

.health.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.health.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.health.info {
  background: var(--info-soft);
  color: var(--info-ink);
}

.took {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.summary {
  margin: 0;
  font-size: var(--text-13);
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.caret {
  display: inline-block;
  width: 6px;
  height: 13px;
  margin-left: 2px;
  border-radius: 1px;
  background: var(--accent);
  vertical-align: -2px;
  animation: ask-caret 1s steps(1) infinite;
}

.quiet {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.foot,
.state {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.why {
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

@keyframes ask-dot {
  50% {
    opacity: 0.3;
  }
}

@keyframes ask-caret {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dots i,
  .caret {
    animation: none;
  }
}
</style>
