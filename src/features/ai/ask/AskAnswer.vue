<!--
  One answer in the Ask thread, from the board "AI · Ask": while the model is waited for, a
  line that names what is being read over three shimmer bars; then the health pill and how long
  it took, the summary as it streams (a caret marks the end while more may come) and the
  findings as cards. The health comes from the scope's own results and every card's severity from the check the
  finding names, never from the AI. A send that failed shows the words for its error code and a way to
  try again; a stopped one says so quietly. Text is always text.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { errorText } from '@/lib/issue-text'
import type { AiTurn } from '@/stores/ai-thread'
import { useOverviewStore } from '@/stores/overview'
import { useReportStore } from '@/stores/report'
import UiButton from '@/ui/UiButton.vue'
import { countInScope, inScope } from './ask-scope'
import { cleanText } from '@/lib/command-safety'
import AskFindingCard from './AskFindingCard.vue'
import { resolveFindings } from '../findings/resolve-findings'
import { severityMix } from './use-ask-session'

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
// The health is the scope's own: the worst active result of what the question was about, not
// only of the findings the model happened to name.
const health = computed<'crit' | 'warn' | 'ok' | null>(() => {
  if (props.turn.status !== 'done' && props.turn.status !== 'streaming') return null
  const items = report.value?.items.filter((i) => inScope(i, props.turn.scope)) ?? []
  if (items.length === 0) return null
  const mix = severityMix(items, props.turn.scope)
  return mix.crit > 0 ? 'crit' : mix.warn > 0 ? 'warn' : 'ok'
})

const WORD_STEP_MS = 45
// Words that arrive fade in 45 ms apart, counted from the batch they came in; an answer that
// is already finished when it is shown (another scope's thread, opened again) just appears.
const animated = props.turn.status === 'waiting' || props.turn.status === 'streaming'
const summaryText = computed(() => cleanText(props.turn.summary))
const words = computed(() => summaryText.value.match(/\S+\s*|\s+/g) ?? [])
const delays = ref<number[]>([])
watch(
  () => words.value.length,
  (n) => {
    const had = delays.value.length
    delays.value =
      n < had
        ? []
        : [...delays.value, ...Array.from({ length: n - had }, (_, i) => i * WORD_STEP_MS)]
  },
  { immediate: true, flush: 'sync' },
)
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
        <template v-if="animated"
          ><span
            v-for="(word, i) in words"
            :key="i"
            class="w"
            :style="{ animationDelay: `${delays[i] ?? 0}ms` }"
            >{{ word }}</span
          ></template
        ><template v-else>{{ summaryText }}</template
        ><Transition name="caret"><span v-if="live" class="caret" aria-hidden="true" /></Transition>
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
  border-radius: 5px;
  /* The board's shimmer is grey-blue (surface-2, well, surface-2), not the accent tint. */
  background: linear-gradient(90deg, var(--surface-2), var(--surface-well), var(--surface-2));
  background-size: 200% 100%;
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

.health.ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
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

.w {
  white-space: pre-wrap;
  animation: ask-word 300ms var(--ease-out) both;
}

.caret-enter-active,
.caret-leave-active {
  transition: opacity 200ms ease;
}

.caret-enter-from,
.caret-leave-to {
  opacity: 0;
}

@keyframes ask-word {
  from {
    opacity: 0;
    filter: blur(3px);
  }
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
  .caret,
  .w {
    animation: none;
  }

  .caret-enter-active,
  .caret-leave-active {
    transition: none;
  }
}
</style>
