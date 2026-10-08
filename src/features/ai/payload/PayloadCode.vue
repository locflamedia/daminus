<!--
  The exact text, from the board "AI payload" (4): a dark panel (radius 14) with a 40 px bar
  (the file name in mono 12, a tag "masked values in amber", Copy on the right) and numbered
  lines in mono 11.5 / 1.75. A masked value is drawn on an amber tint (radius 4). The system
  text and the user text are one listing, in the order they are sent. Everything is text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCopy } from '@/lib/use-copy'
import UiIcon from '@/ui/UiIcon.vue'
import { codeLines } from './payload-lib'

const props = defineProps<{ system: string; user: string; stale?: boolean }>()
const { t } = useI18n()
const lines = computed(() => codeLines(props.system, props.user))
const copy = useCopy()
const copyLabel = computed(() =>
  copy.state.value === 'copied'
    ? t('ai.payload.copied')
    : copy.state.value === 'failed'
      ? t('ai.payload.copyFailed')
      : t('ai.payload.copy'),
)
</script>

<template>
  <div class="panel" :class="{ stale }">
    <div class="bar">
      <span class="file">payload.json</span>
      <span class="tag">{{ t('ai.payload.maskedTag') }}</span>
      <button
        type="button"
        class="copy"
        :aria-label="t('ai.payload.copy')"
        @click="copy.copy(`${system}\n${user}`)"
        @pointerenter="copy.enter"
        @pointerleave="copy.leave"
      >
        <UiIcon name="copy" :size="12" />{{ copyLabel }}
      </button>
    </div>
    <div class="code" tabindex="0" role="region" :aria-label="t('ai.payload.codeLabel')">
      <div v-for="line in lines" :key="line.n" class="ln">
        <span class="no">{{ line.n }}</span
        ><span class="tx"
          ><template v-for="(p, i) in line.pieces" :key="i"
            ><mark v-if="p.masked" class="mask">{{ p.text }}</mark
            ><template v-else>{{ p.text }}</template></template
          ></span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-radius: 14px;
  background: var(--code);
  transition: opacity var(--dur-color) var(--ease-state);
}

.panel.stale {
  opacity: 0.6;
}

.bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 14px;
  background: rgb(255 255 255 / 4%);
}

.file {
  color: var(--code-btn-ink);
  font: var(--weight-regular) var(--text-12) var(--font-mono);
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: rgb(244 201 138 / 16%);
  color: var(--code-warn);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  border-radius: 6px;
  color: var(--code-dim);
  font-size: var(--text-11);
}

.copy:hover {
  color: var(--code-ink);
}

.copy:focus-visible,
.code:focus-visible {
  box-shadow: var(--focus-ring);
  outline: none;
}

.code {
  flex: 1 1 auto;
  min-height: 0;
  padding: 10px 0;
  overflow: auto;
  color: var(--code-ink);
  font: var(--weight-regular) 11.5px / 1.75 var(--font-mono);
}

.ln {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 12px;
  padding: 0 14px;
}

.no {
  color: var(--code-dim);
  text-align: right;
  user-select: none;
}

.tx {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.mask {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--code-warn);
  color: var(--code);
}
</style>
