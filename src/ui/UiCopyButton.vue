<!--
  The copy button of a command or a code block, from the board "AI" (Command safety): a 24 px
  pill with three faces in one cell, so it never changes width. Copy at rest; Copied, with a
  tick, for 1.6 s; Failed, with a cross, until the pointer comes back, with the tooltip
  "Couldn't copy. Select the text and press ⌘C." open while it is showing. It copies exactly
  the text it is given (the caller has already cleaned it) through the clipboard wrapper, and
  the status region is the only thing that announces the result.

  `line` sits at the end of a command line; `bar` is the white 28 px button of the tall bar
  (board "Host key changed"), with the copy glyph; `block` floats in the top corner of a code block,
  with a fade of the block's own colour (`--copy-fade`) so text never runs under the button.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCopy, type CopyState } from '@/lib/use-copy'
import UiIcon from './UiIcon.vue'
import UiTooltip from './UiTooltip.vue'

const props = withDefaults(
  defineProps<{
    text: string
    variant?: 'line' | 'block' | 'bar'
    /** Holds one face still, for the gallery that draws all three. */
    forceState?: CopyState
  }>(),
  { variant: 'line', forceState: undefined },
)
const emit = defineEmits<{ copied: [text: string] }>()

const { t } = useI18n()
const { state: live, copy, enter, leave } = useCopy()
const state = computed(() => props.forceState ?? live.value)

async function onCopy(text: string) {
  if (await copy(text)) emit('copied', text)
}
</script>

<template>
  <span class="copy-root" :class="`copy-${variant}`">
    <UiTooltip :text="t('ui.copyFailedHint')" :pinned="live === 'failed' && !forceState">
      <button
        type="button"
        class="copy"
        :class="{ done: state === 'copied', failed: state === 'failed' }"
        :aria-label="t('ui.copy')"
        @click="onCopy(text)"
        @pointerenter="enter"
        @pointerleave="leave"
        @focus="enter"
        @blur="leave"
      >
        <span class="face" :data-on="state === 'idle'" aria-hidden="true">
          <UiIcon v-if="variant !== 'line'" name="copy" :size="12" :stroke="1.6" />{{
            t('ui.copy')
          }}
        </span>
        <span class="face" :data-on="state === 'copied'" aria-hidden="true">
          <UiIcon name="check" :size="12" :stroke="1.6" />{{ t('ui.copied') }}
        </span>
        <span class="face" :data-on="state === 'failed'" aria-hidden="true">
          <UiIcon name="close" :size="12" :stroke="1.6" />{{ t('ui.failed') }}
        </span>
      </button>
    </UiTooltip>
    <span class="sr" role="status" aria-live="polite">{{
      state === 'copied' ? t('ui.copied') : state === 'failed' ? t('ui.copyFailed') : ''
    }}</span>
  </span>
</template>

<style scoped>
.copy-line,
.copy-bar {
  display: contents;
}

.copy-block {
  position: absolute;
  top: 8px;
  right: 8px;
}

.copy {
  display: inline-grid;
  place-items: center;
  flex: none;
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--code-btn-ink) 10%, transparent);
  color: var(--code-btn-ink);
  font: var(--weight-medium) var(--text-11) var(--font-sans);
  transition:
    background-color var(--dur-color) var(--ease-state),
    color var(--dur-color) var(--ease-state);
}

.copy-block .copy {
  border-radius: 7px;
  background: var(--code-btn);
  box-shadow: -16px 0 12px 4px var(--copy-fade, transparent);
}

.copy:hover {
  background: color-mix(in srgb, var(--code-btn-ink) 22%, transparent);
}

.copy-bar .copy {
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--surface-0);
  color: var(--ink);
  font-size: var(--text-12);
}

.copy-bar .copy:hover {
  background: var(--surface-1);
}

.copy-block .copy:hover {
  background: color-mix(in srgb, var(--code-btn-ink) 10%, var(--code-btn));
}

.copy:focus-visible {
  box-shadow: var(--focus-ring);
}

.copy-root .copy.done {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.copy-root .copy.failed {
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

.face[data-on='true'] {
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
