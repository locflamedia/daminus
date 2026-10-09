<!--
  Inline code, from the board "Micro UI": a token of a command or a path inside a sentence,
  mono 11.5 on a 5 px chip: white on a grey row, grey on a white one (`on`). The whole token
  copies on a click, so it is a button; the control and hidden characters are removed from
  what is copied (the same text that is shown). The text is only ever rendered as text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cleanCommand } from '@/lib/command-safety'
import { useCopy } from '@/lib/use-copy'

const props = withDefaults(defineProps<{ text: string; on?: 'grey' | 'white' }>(), {
  on: 'grey',
})
const emit = defineEmits<{ copied: [text: string] }>()

const { t } = useI18n()
const { state, copy } = useCopy()
const clean = computed(() => cleanCommand(props.text).text)

async function onCopy() {
  if (await copy(clean.value)) emit('copied', clean.value)
}
</script>

<template>
  <button
    type="button"
    class="code"
    :class="[`on-${on}`, { done: state === 'copied' }]"
    :aria-label="t('ui.copyText', { text: clean })"
    @click="onCopy"
  >
    {{ clean }}
  </button>
</template>

<style scoped>
.code {
  display: inline;
  padding: 1px 6px;
  border-radius: 5px;
  color: var(--ink);
  font: var(--weight-regular) var(--text-mono-11-5) var(--font-mono);
  transition: background-color var(--dur-color) var(--ease-state);
}

.on-grey {
  background: var(--surface-0);
}

.on-white {
  background: var(--surface-1);
}

.on-grey:hover {
  background: var(--surface-2);
}

.on-white:hover {
  background: var(--surface-2);
}

.code:focus-visible {
  box-shadow: var(--focus-ring);
}

.done {
  background: var(--ok-soft);
  color: var(--ok-ink);
}
</style>
