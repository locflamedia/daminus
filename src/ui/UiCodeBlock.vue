<!--
  Code block, from the boards "AI" (fix and ask thread, Command safety), "Permission help"
  (evidence) and "Project · Security": a dark radius-10 panel (`--code`, the one darker step
  under the page in dark mode), Geist Mono 11/1.6. Long lines scroll sideways under a thin
  scroll bar that is always drawn, and keep their spacing. The light tone is for the payload
  view on a grey well. The snippet is text: control and hidden characters are removed before
  it is shown or copied, and colouring (comments, strings, an nginx statement's first word,
  SQL keywords) is applied to pieces of that text, never as markup. A Copy button (three
  faces: Copy, Copied, Failed) floats in the top corner; the same note and words that warn
  about a command warn about `| sh`, `base64 -d` and `rm` when the snippet is shell.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { cleanBlock, commandRisks } from '@/lib/command-safety'
import { tokenizeLine, type CodeLanguage } from '@/lib/code-tokens'
import UiCommandRisks from './UiCommandRisks.vue'
import UiCopyButton from './UiCopyButton.vue'

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

const cleaned = computed(() => cleanBlock(props.code))
const lines = computed(() =>
  cleaned.value.text.split('\n').map((line) => tokenizeLine(line, props.language)),
)
const risks = computed(() => (props.language === 'shell' ? commandRisks(cleaned.value.text) : []))
</script>

<template>
  <div class="block-wrap">
    <div class="block" :class="[`tone-${tone}`, { wrap, copyable }]">
      <div
        class="code"
        :class="{ 'code-scroll': !wrap }"
        tabindex="0"
        :role="label ? 'region' : undefined"
        :aria-label="label"
      >
        <div v-for="(line, row) in lines" :key="row" class="line">
          <span v-for="(token, col) in line" :key="col" :class="`t-${token.kind}`">{{
            token.text
          }}</span>
        </div>
      </div>
      <UiCopyButton v-if="copyable" :text="cleaned.text" variant="block" />
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
  --copy-fade: var(--code);

  position: relative;
  min-width: 0;
  overflow: hidden;
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
  --copy-fade: var(--surface-1);

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
  padding-right: 96px;
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

/* Inside the clipped block, so the ring is drawn inward. */
.code:focus-visible {
  box-shadow: inset 0 0 0 2px var(--accent);
}
</style>
