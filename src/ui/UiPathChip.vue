<!--
  Path chip, from the board "Micro UI": 24 px, radius 6, a folder icon, the path in mono 11.5
  with its middle cut (root and leaf stay), and a 20 px copy button that appears on hover or
  keyboard focus. The full path is the tooltip and is what gets copied; the text is only ever
  rendered as text. The copy button's hit area is larger than its 20 px.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { middleEllipsis } from '@/lib/micro'
import { useCopy } from '@/lib/use-copy'
import UiIcon from './UiIcon.vue'
import UiTooltip from './UiTooltip.vue'

const props = withDefaults(defineProps<{ path: string; max?: number; copyable?: boolean }>(), {
  max: 28,
  copyable: true,
})
const emit = defineEmits<{ copied: [path: string] }>()

const { t } = useI18n()
const { state, copy } = useCopy()
const shown = computed(() => middleEllipsis(props.path, props.max))

async function onCopy() {
  if (await copy(props.path)) emit('copied', props.path)
}
</script>

<template>
  <UiTooltip :text="path" :disabled="shown === path">
    <span class="path">
      <UiIcon name="folder" :size="12" />
      <span class="text">{{ shown }}</span>
      <button
        v-if="copyable"
        type="button"
        class="copy"
        :class="{ done: state === 'copied' }"
        :aria-label="state === 'copied' ? t('ui.copied') : t('ui.copyPath')"
        @click="onCopy"
      >
        <UiIcon :name="state === 'copied' ? 'check' : 'copy'" :size="12" />
      </button>
    </span>
  </UiTooltip>
</template>

<style scoped>
.path {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 24px;
  min-width: 0;
  padding: 0 2px 0 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-0);
  color: var(--ink-3);
}

.text {
  color: var(--ink);
  font: var(--weight-regular) 11.5px var(--font-mono);
  white-space: nowrap;
}

.copy {
  position: relative;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  color: var(--ink-4);
  opacity: 0;
  transition:
    opacity var(--dur-color) var(--ease-state),
    background-color var(--dur-color) var(--ease-state);
}

/* A 28 px target around the 20 px visual. */
.copy::after {
  position: absolute;
  inset: -4px;
  content: '';
}

.path:hover .copy,
.copy:focus-visible,
.copy.done {
  opacity: 1;
}

.copy:hover {
  background: var(--surface-1);
  color: var(--ink);
}

.copy.done {
  color: var(--ok-ink);
}

.copy:focus-visible {
  box-shadow: var(--focus-ring);
}
</style>
