<!--
  Command line, from the board "Permission help": a 32 px dark pill with a `$`, the command in
  Geist Mono 12 and a Copy button. It exists so that what you copy is what you read:

  - the whole command is shown, on one line that scrolls sideways (never cut with an
    ellipsis), and the scroller takes focus so the keyboard can reach the end;
  - control characters, hidden and direction-changing characters are removed, and line breaks
    become spaces, before it is shown and before it is copied, so the two are the same text;
  - a command that pipes into a shell, decodes base64 or runs `rm` gets an amber strip under
    it that says so in words, and so does one that had characters removed. The warning does
    not block the copy: the person decides, with the facts in front of them.

  Copying goes through the clipboard plugin (src/api); the button reads Copy, then Copied for
  1.5 s, with a fixed width. Daminus never runs the command.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cleanCommand, commandRisks } from '@/lib/command-safety'
import { useCopy } from '@/lib/use-copy'
import UiCommandRisks from './UiCommandRisks.vue'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{ command: string; prompt?: string | false }>(), {
  prompt: '$',
})
const emit = defineEmits<{ copied: [command: string] }>()

const { t } = useI18n()
const { state, copy } = useCopy()

const cleaned = computed(() => cleanCommand(props.command))
const risks = computed(() => commandRisks(cleaned.value.text))

async function onCopy() {
  const text = cleaned.value.text
  if (await copy(text)) emit('copied', text)
}
</script>

<template>
  <div class="command">
    <div class="line">
      <span v-if="prompt" class="prompt" aria-hidden="true">{{ prompt }}</span>
      <span class="text" tabindex="0" role="region" :aria-label="t('ui.command.name')">{{
        cleaned.text
      }}</span>
      <button
        type="button"
        class="copy"
        :class="{ done: state === 'copied', failed: state === 'failed' }"
        @click="onCopy"
      >
        <span class="face" :aria-hidden="state !== 'idle'">{{ t('ui.copy') }}</span>
        <span class="face face-done" :aria-hidden="state !== 'copied'">
          <UiIcon name="check" :size="12" :stroke="2" />{{ t('ui.copied') }}
        </span>
        <span class="face" :aria-hidden="state !== 'failed'" :title="t('ui.copyFailed')">{{
          t('ui.failed')
        }}</span>
      </button>
      <span class="sr" role="status" aria-live="polite">{{
        state === 'copied' ? t('ui.copied') : state === 'failed' ? t('ui.copyFailed') : ''
      }}</span>
    </div>
    <UiCommandRisks :risks="risks" :removed="cleaned.removed" />
  </div>
</template>

<style scoped>
.command {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  min-width: 0;
  padding: 0 var(--space-1) 0 10px;
  border-radius: 9px;
  background: var(--code);
  color: var(--code-ink);
  font: var(--weight-regular) var(--text-12) var(--font-mono);
}

.prompt {
  flex: none;
  color: var(--code-dim);
}

.text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
}

.text::-webkit-scrollbar {
  display: none;
}

.text:focus-visible {
  border-radius: var(--radius-xs);
  box-shadow: var(--focus-ring);
}

.copy {
  display: inline-grid;
  place-items: center;
  flex: none;
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--code-ink) 12%, transparent);
  color: var(--code-ink);
  font: var(--weight-medium) var(--text-11) var(--font-sans);
  transition:
    background-color var(--dur-color) var(--ease-state),
    color var(--dur-color) var(--ease-state);
}

.copy:hover {
  background: color-mix(in srgb, var(--code-ink) 22%, transparent);
}

.copy:focus-visible {
  box-shadow: var(--focus-ring);
}

.copy.done {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.copy.failed {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

/* The three faces share one cell, so the button is as wide as the widest and never shifts. */
.face {
  display: inline-flex;
  grid-area: 1 / 1;
  align-items: center;
  gap: var(--space-1);
  white-space: nowrap;
  opacity: 0;
  filter: blur(2px);
  transition:
    opacity var(--dur-state) var(--ease-state),
    filter var(--dur-state) var(--ease-state);
}

.face[aria-hidden='false'] {
  opacity: 1;
  filter: none;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

@media (prefers-reduced-motion: reduce) {
  .face {
    filter: none;
  }
}
</style>
