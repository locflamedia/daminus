<!--
  Command line, from the boards "Permission help" and "AI" (Command safety): a 32 px dark pill
  with a `$`, the command in Geist Mono 12 and a Copy button. It exists so that what you copy
  is what you read:

  - the whole command is shown, on one line that scrolls sideways under a thin scroll bar that
    is always drawn (never cut with an ellipsis), and the scroller takes focus so the keyboard
    can reach the end;
  - control characters, hidden and direction-changing characters are removed, and line breaks
    become spaces, before it is shown and before it is copied, so the two are the same text;
  - a command that pipes into a shell, decodes base64 or runs `rm` gets an amber note under it
    with one line for each risk, and so does one that had characters removed. The note does
    not block the copy: the person decides, with the facts in front of them.

  Copying goes through the clipboard plugin (src/api); the button reads Copy, Copied for 1.6 s
  or Failed, with a fixed width. Daminus never runs the command.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cleanCommand, commandRisks } from '@/lib/command-safety'
import UiCommandRisks from './UiCommandRisks.vue'
import UiCopyButton from './UiCopyButton.vue'

const props = withDefaults(defineProps<{ command: string; prompt?: string | false }>(), {
  prompt: '$',
})
const emit = defineEmits<{ copied: [command: string] }>()

const { t } = useI18n()

const cleaned = computed(() => cleanCommand(props.command))
const risks = computed(() => commandRisks(cleaned.value.text))
</script>

<template>
  <div class="command">
    <div class="line">
      <span v-if="prompt" class="prompt" aria-hidden="true">{{ prompt }}</span>
      <span
        class="text code-scroll"
        tabindex="0"
        role="region"
        :aria-label="t('ui.command.name')"
        >{{ cleaned.text }}</span
      >
      <UiCopyButton :text="cleaned.text" @copied="emit('copied', $event)" />
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

/*
  The text sits at the same height with or without the 8 px scroll bar under it: the line is
  22 px tall below a 5 px lead, and whatever the bar covers of the line box is empty space.
*/
.text {
  box-sizing: border-box;
  flex: 1 1 auto;
  align-self: stretch;
  min-width: 0;
  padding-top: 5px;
  overflow: auto hidden;
  --scroll-h: 8px;
  --scroll-top: 2px;
  --scroll-bottom: 2px;
  --scroll-inset: 0px;
  white-space: nowrap;
  line-height: 22px;
}

.text:focus-visible {
  border-radius: var(--radius-xs);
  box-shadow: var(--focus-ring);
}
</style>
