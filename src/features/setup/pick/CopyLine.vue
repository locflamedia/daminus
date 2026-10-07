<!--
  A copyable command on a white pill, the form the failure card of a host uses: `$`, the whole
  command in mono and a Copy button that reads Copied for a moment. What is shown is what is
  copied, with control characters removed. Daminus never runs it.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cleanCommand } from '@/lib/command-safety'
import { useCopy } from '@/lib/use-copy'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ command: string }>()
const emit = defineEmits<{ copied: [command: string] }>()

const { t } = useI18n()
const { state, copy, enter, leave } = useCopy()
const clean = computed(() => cleanCommand(props.command).text)

async function onCopy() {
  if (await copy(clean.value)) emit('copied', clean.value)
}
</script>

<template>
  <span class="line">
    <code><span aria-hidden="true">$</span> {{ clean }}</code>
    <button
      type="button"
      class="copy"
      :class="{ done: state === 'copied' }"
      @click="onCopy"
      @pointerenter="enter"
      @pointerleave="leave"
      @focus="enter"
      @blur="leave"
    >
      <UiIcon :name="state === 'copied' ? 'check' : 'copy'" :size="12" />
      {{
        state === 'copied' ? t('ui.copied') : state === 'failed' ? t('ui.copyFailed') : t('ui.copy')
      }}
    </button>
  </span>
</template>

<style scoped>
.line {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--space-2);
  max-width: 100%;
  height: var(--h-control);
  padding: 0 var(--space-1) 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--ink);
}

code {
  min-width: 0;
  overflow-x: auto;
  font: var(--weight-regular) var(--text-12) var(--font-mono);
  white-space: pre;
}

code span {
  color: var(--ink-3);
}

.copy {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: 7px;
  background: var(--surface-0);
  box-shadow: 0 0 0 1px var(--surface-2);
  color: var(--ink-2);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.copy:hover {
  background: var(--surface-1);
}

.copy.done {
  color: var(--ok-ink);
}

.copy:focus-visible {
  box-shadow: var(--focus-ring);
}
</style>
