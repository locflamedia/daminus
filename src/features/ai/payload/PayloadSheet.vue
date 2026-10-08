<!--
  "What will be sent", from the board "AI payload": the one blocking sheet of AI, 1000 px wide
  over a dimmed, blurred window. A header with the provider tile, "Review before sending to
  {provider}" and the context line (project, scans, model, the question), then the numbers, the
  sections you can drop on the left and the exact text on the right, and a footer with the
  status of the redactor, Cancel and Send. Esc and Cancel close it without sending; Enter sends.
  Send carries the hash of the preview that is on screen: every change asks for a new preview
  first and Send waits for it. Mount it once at the window root; open it with
  `useAiPayloadStore().review(...)`. Text from the data or the model is always text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isAppError } from '@/api'
import { errorText } from '@/lib/issue-text'
import { useAiSend } from '@/features/ai/use-ai-send'
import { useAiPayloadStore, REVIEWS_BEFORE_OFFER } from '@/stores/ai-payload'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import UiSheet from '@/ui/UiSheet.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import UiSpinner from '@/ui/UiSpinner.vue'
import PayloadCode from './PayloadCode.vue'
import PayloadSections from './PayloadSections.vue'
import PayloadStats from './PayloadStats.vue'
import { maskedCount } from './payload-lib'

const { t } = useI18n()
const payload = useAiPayloadStore()
const sender = useAiSend()

const provider = computed(() => payload.providerName || t('ai.payload.providerFallback'))
const preview = computed(() => payload.preview)
const masked = computed(() =>
  preview.value ? maskedCount(`${preview.value.system}\n${preview.value.user}`) : 0,
)
const previewError = computed(() => (payload.error ? errorText(payload.error) : null))
const sendError = computed(() => {
  const e = sender.error.value
  return sender.status.value === 'error' && e && isAppError(e) ? errorText(e) : null
})
const contextParts = computed(() =>
  [
    { text: payload.context, mono: false },
    { text: payload.model, mono: true },
    { text: payload.question ? `“${payload.question}”` : '', mono: false },
  ].filter((p) => p.text),
)
const contextLine = computed(() => contextParts.value.map((p) => p.text).join(' · '))
/** "review n of 3": the send being reviewed now, known once a send has finished in this window. */
const reviewNumber = computed(() => Math.min(payload.reviewedSends + 1, REVIEWS_BEFORE_OFFER))
const showReview = computed(() => payload.reviewedSends > 0 && !payload.offerStopAsking)

function onEnter(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, a') || event.isComposing) return
  event.preventDefault()
  void payload.send()
}
</script>

<template>
  <UiSheet
    :open="payload.open"
    :title="t('ai.payload.title', { provider })"
    :context="contextLine"
    width="1000px"
    plain
    focus-panel
    @close="payload.close()"
  >
    <template #header="{ titleId, close }">
      <header class="head">
        <span class="tile"><UiIcon name="spark" :size="20" /></span>
        <div class="titles">
          <h2 :id="titleId" class="title">{{ t('ai.payload.title', { provider }) }}</h2>
          <span class="context"
            ><template v-for="(p, i) in contextParts" :key="i"
              ><template v-if="i > 0"> · </template
              ><span :class="{ mono: p.mono }">{{ p.text }}</span></template
            ></span
          >
        </div>
        <button type="button" class="esc" :aria-label="t('ui.cancel')" @click="close">
          <UiKbd>esc</UiKbd>
        </button>
      </header>
    </template>

    <div class="content" @keydown.enter="onEnter">
      <UiBanner
        v-if="previewError"
        tone="crit"
        icon="warn"
        alert
        :title="t('ai.payload.previewFailed')"
        :text="previewError"
      >
        <template #trailing>
          <UiButton size="small" @click="payload.refresh()">{{ t('ai.payload.retry') }}</UiButton>
        </template>
      </UiBanner>
      <template v-else-if="preview">
        <PayloadStats :bytes="preview.total_bytes" :system="preview.system" :user="preview.user" />
        <div class="main" :aria-busy="payload.loading">
          <PayloadSections
            :sections="preview.sections"
            :question="payload.question"
            @toggle="payload.toggle($event)"
          />
          <PayloadCode :system="preview.system" :user="preview.user" :stale="payload.loading" />
        </div>
      </template>
      <div v-else class="main" aria-busy="true">
        <div class="wait">
          <UiSkeleton v-for="n in 6" :key="n" height="44px" radius="10px" />
        </div>
        <UiSkeleton height="100%" radius="14px" />
      </div>
      <UiBanner
        v-if="sendError"
        tone="crit"
        icon="warn"
        alert
        :title="t('ai.payload.sendFailed')"
        :text="sendError"
      />
    </div>

    <template #footer-start>
      <label v-if="payload.offerStopAsking" class="ask">
        <input v-model="payload.dontAskAgain" type="checkbox" />
        {{ t('ai.payload.dontAsk', { subject: payload.subject || t('ai.payload.thisScope') }) }}
      </label>
      <span v-if="showReview" class="count">{{
        t('ai.payload.reviewOf', { n: reviewNumber, total: REVIEWS_BEFORE_OFFER })
      }}</span>
    </template>
    <template #footer-end>
      <span class="status" role="status">
        <template v-if="payload.loading">
          <UiSpinner :size="12" />{{ t('ai.payload.checking') }}
        </template>
        <span v-else-if="payload.sendable" class="ready">
          <UiIcon name="check" :size="12" />{{ t('ai.payload.ready', { n: masked }, masked) }}
        </span>
      </span>
      <UiButton variant="ghost" size="medium" class="cancel" @click="payload.close()">{{
        t('ui.cancel')
      }}</UiButton>
      <UiButton
        variant="primary"
        size="medium"
        lifted
        shortcut="⏎"
        :disabled="!payload.sendable || sender.busy.value"
        :busy="sender.busy.value"
        @click="payload.send()"
      >
        {{ t('ai.payload.send', { provider }) }}
      </UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6) var(--space-4);
}

.tile {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--surface-well);
  color: var(--ink);
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.02em;
}

.context {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-12);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.esc {
  margin-left: auto;
  border-radius: 5px;
}

.esc:focus-visible {
  box-shadow: var(--focus-ring);
}

.mono {
  font-family: var(--font-mono);
}

.cancel.cancel {
  --fg: var(--ink-2);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 calc(-1 * var(--space-5));
  padding-bottom: var(--space-4);
}

.content > :deep(.stats) {
  padding-inline: var(--space-6);
}

.main {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 300px;
  padding: 0 var(--space-6);
}

.wait {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ask {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-2);
  font-size: var(--text-12);
  accent-color: var(--btn);
}

.count {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: var(--space-2);
  color: var(--accent-ink);
  font-size: var(--text-12);
}

.ready {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ok-ink);
}
</style>
