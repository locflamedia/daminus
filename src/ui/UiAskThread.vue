<!--
  Ask thread, from the board "AI": the person's question is a dark bubble at the right
  (radius 14 with a 4 px corner at the bottom right, at most 85 % wide), the answer a grey
  bubble at the left with a 24 px AI mark (radius 8, accent-soft, the sparkle) and a 4 px
  corner at the top left. An answer may carry code (a dark block, a copy button) and always
  names what it was based on ("Based on scan #42 of kho-hang, table sizes, row counts"), so
  nothing reads as unexplained. While the model is waited for, a shimmer bar stands where
  the answer will be; when the text lands its words fade in 60 ms apart (`animate` on the
  newest answer only). Everything is text: an answer is never markup, and never runs.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CodeLanguage } from '@/lib/code-tokens'
import { wordDelay } from '@/lib/motion'
import UiCodeBlock from './UiCodeBlock.vue'
import UiIcon from './UiIcon.vue'

export interface AskMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  code?: string
  language?: CodeLanguage
  /** What the answer was based on, in words. */
  basedOn?: string
}

const props = withDefaults(
  defineProps<{
    messages: readonly AskMessage[]
    /** The model is being waited for: a shimmer bar closes the thread. */
    pending?: boolean
    /** The id of the answer whose words should fade in. */
    animate?: string
  }>(),
  { pending: false, animate: undefined },
)

const { t } = useI18n()

const MAX_ANIMATED_WORDS = 60
const animated = computed(() => {
  const message = props.messages.find((m) => m.id === props.animate && m.role === 'ai')
  return message ? message.text.split(/(\s+)/) : null
})
</script>

<template>
  <div class="thread" role="log" :aria-label="t('ui.thread.ai')" aria-live="polite">
    <template v-for="message in messages" :key="message.id">
      <div v-if="message.role === 'user'" class="user">
        <span class="sr-only">{{ t('ui.thread.you') }}</span>
        {{ message.text }}
      </div>
      <div v-else class="ai">
        <span class="mark" aria-hidden="true"><UiIcon name="spark" :size="14" /></span>
        <div class="bubble">
          <span class="sr-only">{{ t('ui.thread.ai') }}</span>
          <span v-if="animate === message.id && animated" class="words">
            <template v-for="(piece, i) in animated" :key="i">
              <span
                v-if="piece.trim() !== '' && i / 2 < MAX_ANIMATED_WORDS"
                class="m-word"
                :style="{ '--d': wordDelay(i / 2) }"
                >{{ piece }}</span
              >
              <template v-else>{{ piece }}</template>
            </template>
          </span>
          <span v-else>{{ message.text }}</span>
          <UiCodeBlock v-if="message.code" :code="message.code" :language="message.language" />
          <span v-if="message.basedOn" class="based">{{ message.basedOn }}</span>
        </div>
      </div>
    </template>
    <div v-if="pending" class="ai" role="status" aria-busy="true">
      <span class="mark" aria-hidden="true"><UiIcon name="spark" :size="14" /></span>
      <div class="bubble"><span class="think m-think" /></div>
    </div>
  </div>
</template>

<style scoped>
.thread {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.user {
  align-self: flex-end;
  box-sizing: border-box;
  max-width: 85%;
  padding: 10px var(--space-3);
  border-radius: 14px 14px 4px;
  background: var(--btn);
  color: var(--btn-ink);
  font-size: var(--text-13);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ai {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;
}

.mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.bubble {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: 10px var(--space-3);
  border-radius: 4px 14px 14px;
  background: var(--surface-1);
  font-size: var(--text-13);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.based {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.think {
  width: 190px;
  max-width: 100%;
}
</style>
