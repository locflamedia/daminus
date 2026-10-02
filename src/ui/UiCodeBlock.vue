<!--
  Code block, from the board "AI" (fix and ask thread), "Permission help" (evidence) and
  "Project · Security": a dark radius-10 panel (`--code`, the one darker step under the page
  in dark mode), Geist Mono 11/1.6, long lines scroll sideways and keep their spacing. The
  light tone is for the payload view on a grey well. The snippet is text: control and hidden
  characters are removed before it is shown or copied, and colouring (comments, strings, an
  nginx statement's first word, SQL keywords) is applied to pieces of that text, never as
  markup. A copy button sits in the corner (28 square, radius 8); the same words and key
  that copy a command warn about `| sh`, `base64 -d` and `rm` when the snippet is shell.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cleanBlock, commandRisks } from '@/lib/command-safety'
import { tokenizeLine, type CodeLanguage } from '@/lib/code-tokens'
import { useCopy } from '@/lib/use-copy'
import UiCommandRisks from './UiCommandRisks.vue'
import UiIcon from './UiIcon.vue'

const props = withDefaults(
  defineProps<{
    code: string
    language?: CodeLanguage
    tone?: 'dark' | 'light'
    copyable?: boolean
    /** Names the scrolling region for assistive technology. */
    label?: string
    /** Wrap long lines instead of scrolling (the payload view). */
    wrap?: boolean
  }>(),
  { language: 'plain', tone: 'dark', copyable: true, label: undefined, wrap: false },
)

const { t } = useI18n()
const { state, copy } = useCopy()

const cleaned = computed(() => cleanBlock(props.code))
const lines = computed(() =>
  cleaned.value.text.split('\n').map((line) => tokenizeLine(line, props.language)),
)
const risks = computed(() => (props.language === 'shell' ? commandRisks(cleaned.value.text) : []))
const copyLabel = computed(() =>
  state.value === 'copied'
    ? t('ui.copied')
    : state.value === 'failed'
      ? t('ui.copyFailed')
      : t('ui.copy'),
)
</script>

<template>
  <div class="block-wrap">
    <div class="block" :class="[`tone-${tone}`, { wrap, copyable }]">
      <div class="code" tabindex="0" :role="label ? 'region' : undefined" :aria-label="label">
        <div v-for="(line, row) in lines" :key="row" class="line">
          <span v-for="(token, col) in line" :key="col" :class="`t-${token.kind}`">{{
            token.text
          }}</span>
        </div>
      </div>
      <button
        v-if="copyable"
        type="button"
        class="copy"
        :class="{ done: state === 'copied' }"
        :aria-label="copyLabel"
        :title="copyLabel"
        @click="copy(cleaned.text)"
      >
        <Transition name="swap" mode="out-in">
          <UiIcon v-if="state === 'copied'" key="done" name="check" :size="14" :stroke="2" />
          <UiIcon v-else key="copy" name="copy" :size="14" />
        </Transition>
      </button>
      <span class="sr" role="status" aria-live="polite">{{
        state === 'idle' ? '' : copyLabel
      }}</span>
    </div>
    <UiCommandRisks :risks="risks" :removed="cleaned.removed" />
  </div>
</template>

<style scoped>
.block-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.block {
  --c-ink: var(--code-ink);
  --c-key: var(--code-key);
  --c-str: var(--code-str);
  --c-comment: var(--code-dim);
  --c-prompt: var(--code-dim);

  position: relative;
  min-width: 0;
  border-radius: var(--radius-sm);
  background: var(--code);
  color: var(--c-ink);
}

.tone-light {
  --c-ink: var(--ink);
  --c-key: var(--accent-ink);
  --c-str: var(--crit-ink);
  --c-comment: var(--ink-3);
  --c-prompt: var(--ink-3);

  background: var(--surface-1);
}

.code {
  margin: 0;
  padding: var(--space-3);
  overflow-x: auto;
  font: var(--weight-regular) var(--text-11) / 1.6 var(--font-mono);
  white-space: pre;
  tab-size: 2;
}

.copyable .code {
  padding-right: 40px;
}

.wrap .code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.line {
  min-height: 1.6em;
}

.t-comment {
  color: var(--c-comment);
}

.t-string {
  color: var(--c-str);
}

.t-key {
  color: var(--c-key);
}

.t-prompt {
  color: var(--c-prompt);
}

.copy {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--ink-5);
  transition:
    background-color var(--dur-color) var(--ease-state),
    color var(--dur-color) var(--ease-state);
}

.tone-light .copy {
  color: var(--ink-3);
}

.copy:hover {
  background: color-mix(in srgb, var(--code-ink) 12%, transparent);
  color: var(--code-ink);
}

.tone-light .copy:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.copy.done {
  color: var(--code-ok);
}

.tone-light .copy.done {
  color: var(--ok-ink);
}

.code:focus-visible,
.copy:focus-visible {
  box-shadow: var(--focus-ring);
}

.swap-enter-active,
.swap-leave-active {
  transition:
    opacity calc(var(--dur-state) / 2) var(--ease-state),
    filter calc(var(--dur-state) / 2) var(--ease-state);
}

.swap-enter-from,
.swap-leave-to {
  opacity: 0;
  filter: blur(2px);
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

@media (prefers-reduced-motion: reduce) {
  .swap-enter-from,
  .swap-leave-to {
    filter: none;
  }
}
</style>
