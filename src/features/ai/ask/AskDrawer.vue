<!--
  The Ask panel (board "AI · Ask", screen 10): a 480 px glass drawer from the right with no
  scrim, so the page it talks about stays readable on the left. Top to bottom: the header (the
  AI mark, "Ask about kho-hang", the model, the ⌘J hint and close), the context chips (project
  and scan, the severity mix, the baseline and what was sent), the thread, and the composer
  with the promise that commands are only for copying. A question opens the review sheet first;
  nothing leaves this Mac until Send there. The thread lives in memory for the session. ⌘J
  toggles the panel for the page the person is on.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAiPayloadStore } from '@/stores/ai-payload'
import { useAiProvidersStore } from '@/stores/ai-providers'
import { useAiThreadStore } from '@/stores/ai-thread'
import { useOverviewStore } from '@/stores/overview'
import { useReportStore } from '@/stores/report'
import UiAskComposer from '@/ui/UiAskComposer.vue'
import UiButton from '@/ui/UiButton.vue'
import UiChip from '@/ui/UiChip.vue'
import UiDrawer from '@/ui/UiDrawer.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import { formatNumber } from '@/lib/format'
import { estimateTokens } from '../payload/payload-lib'
import { scopeFromRoute } from './ask-scope'
import AskAnswer from './AskAnswer.vue'
import { severityMix, useAskSession, useScopeName } from './use-ask-session'

const { t } = useI18n()
const route = useRoute()
const thread = useAiThreadStore()
const payload = useAiPayloadStore()
const providers = useAiProvidersStore()
const reports = useReportStore()
const overview = useOverviewStore()
const session = useAskSession()

const scope = computed(() => thread.drawerScope)
const name = useScopeName(() => scope.value)
const turns = computed(() => thread.turnsOf(scope.value))
const text = ref('')
const log = ref<HTMLElement>()

const report = computed(() => reports.latest)
const mix = computed(() => severityMix(report.value?.items, scope.value))
const model = computed(() => {
  const view = providers.view
  const entry = view?.providers.find((p) => p.profile.id === view.provider)
  return view?.model ?? entry?.profile.models[0] ?? entry?.profile.name ?? ''
})
const sent = computed(() => {
  const preview = payload.preview
  if (!preview || turns.value.length === 0) return ''
  const n = estimateTokens(preview.total_bytes)
  const tokens = n >= 1000 ? `${formatNumber(Math.round(n / 100) / 10)}k` : formatNumber(n)
  return payload.providerName
    ? t('aiAsk.sent', { tokens, provider: payload.providerName })
    : t('aiAsk.sentNoProvider', { tokens })
})

// A new turn clears the composer: the question is in the thread now.
watch(
  () => thread.activeId,
  (id) => {
    if (id !== null) text.value = ''
  },
)

// Keep the newest words in view while they arrive.
watch(
  () => [turns.value.length, turns.value.at(-1)?.summary, turns.value.at(-1)?.findings.length],
  async () => {
    await nextTick()
    if (log.value) log.value.scrollTop = log.value.scrollHeight
  },
)

watch(
  () => thread.drawerOpen,
  (open) => {
    if (open && providers.view === null) void providers.load()
  },
  { immediate: true },
)

function onKeydown(e: KeyboardEvent) {
  if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'j') return
  e.preventDefault()
  thread.toggleDrawer(scopeFromRoute(route))
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function send(question: string) {
  session.ask(scope.value, question)
}
</script>

<template>
  <UiDrawer
    :open="thread.drawerOpen"
    :label="t('aiAsk.title', { name })"
    @close="thread.closeDrawer()"
  >
    <header class="head">
      <span class="orb" aria-hidden="true"><UiIcon name="spark" :size="18" /></span>
      <div class="titles">
        <b class="title">{{ t('aiAsk.title', { name }) }}</b>
        <span v-if="model" class="model">{{ model }}</span>
      </div>
      <UiKbd class="hint" :aria-label="t('aiAsk.toggleHint')">⌘J</UiKbd>
      <UiButton
        variant="secondary"
        size="small"
        icon="close"
        :aria-label="t('aiAsk.close')"
        @click="thread.closeDrawer()"
      />
    </header>
    <div class="context">
      <UiChip tone="neutral"
        >{{ name
        }}<template v-if="report?.seq != null">
          · {{ t('aiAsk.scanNo', { n: report.seq }) }}</template
        ></UiChip
      >
      <UiChip :tone="mix.crit > 0 ? 'crit' : mix.warn > 0 ? 'warn' : 'neutral'">{{
        mix.crit + mix.warn === 0
          ? t('aiAsk.mixClear')
          : [
              mix.crit > 0 ? t('aiAsk.mixCrit', { n: mix.crit }) : '',
              mix.warn > 0 ? t('aiAsk.mixWarn', { n: mix.warn }) : '',
            ]
              .filter(Boolean)
              .join(' · ')
      }}</UiChip>
      <UiChip v-if="overview.baselineSeq !== null" tone="neutral">{{
        t('aiAsk.vs', { n: overview.baselineSeq })
      }}</UiChip>
      <span v-if="sent" class="sent"><UiIcon name="eye" :size="12" />{{ sent }}</span>
    </div>
    <div ref="log" class="thread" role="log" :aria-label="t('aiAsk.threadLabel', { name })">
      <template v-for="turn in turns" :key="turn.id">
        <div class="q m-enter">{{ turn.question }}</div>
        <AskAnswer :turn="turn" @stop="session.cancel()" @retry="session.retry(turn)" />
      </template>
    </div>
    <footer class="foot">
      <UiAskComposer
        v-model="text"
        :label="t('aiAsk.composerLabel')"
        :placeholder="t(turns.length > 0 ? 'aiAsk.placeholderMore' : 'aiAsk.placeholder', { name })"
        :busy="session.busy.value"
        @send="send"
      />
      <span class="promise"><UiIcon name="lock" :size="12" />{{ t('aiAsk.promise') }}</span>
    </footer>
  </UiDrawer>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 20px var(--space-3);
}

.orb {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  /* The board's mark: the accent into a soft violet. */
  background: linear-gradient(150deg, var(--accent), #9b7fe0);
  color: #fff;
}

.titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.title {
  overflow: hidden;
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.hint {
  margin-left: auto;
}

.context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0 20px var(--space-3);
}

.sent {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
  color: var(--accent-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.thread {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  padding: var(--space-1) 20px var(--space-3);
  overflow-y: auto;
}

.q {
  align-self: flex-end;
  box-sizing: border-box;
  max-width: 340px;
  padding: 10px 14px;
  border-radius: 16px 16px 4px;
  background: var(--btn);
  color: var(--btn-ink);
  font-size: var(--text-13);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-3) 20px var(--space-4);
}

.promise {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
