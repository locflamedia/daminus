<!--
  "Included", from the board "AI payload" (3): one 44 px row per section (a box, the name 12/500,
  one line of what it holds in ink-3, the size in mono 11). The question is always sent: its box
  is grey and cannot be switched. A section left out is dimmed to 70 %, keeps its size, and has
  an empty box. Under the list the masking rules as chips, so nothing is magic.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SectionInfo } from '@/api'
import { kilobytes } from './payload-lib'

defineProps<{ sections: readonly SectionInfo[]; question: string; busy?: boolean }>()
const emit = defineEmits<{ toggle: [id: SectionInfo['id']] }>()

const { t, n } = useI18n()

const RULES = ['sk-', 'ghp_', 'AKIA', 'xox', 'PEM', 'entropy ≥ 20', 'IP + host'] as const

const NAMES = {
  question: 'ai.payload.sections.question',
  project_config: 'ai.payload.sections.project_config',
  check_results: 'ai.payload.sections.check_results',
  diff: 'ai.payload.sections.diff',
  server_facts: 'ai.payload.sections.server_facts',
  top_disk_paths: 'ai.payload.sections.top_disk_paths',
} as const

const ONE_DECIMAL = { minimumFractionDigits: 1, maximumFractionDigits: 1 }
/** "9.8 KB", one decimal as on the board. */
function kb(bytes: number): string {
  return `${n(kilobytes(bytes), ONE_DECIMAL)} KB`
}

function describe(s: SectionInfo, question: string): string {
  switch (s.id) {
    case 'question':
      return t('ai.payload.sections.questionDesc', { n: [...question].length })
    case 'check_results':
      return t('ai.payload.sections.check_resultsDesc', { n: s.items })
    default:
      return t(`ai.payload.sections.${s.id}Desc`)
  }
}
</script>

<template>
  <div class="col">
    <span class="head">{{ t('ai.payload.included') }}</span>
    <label
      v-for="s in sections"
      :key="s.id"
      class="sec"
      :class="{ off: !s.included, lock: s.id === 'question' }"
    >
      <input
        class="in"
        type="checkbox"
        :checked="s.included"
        :disabled="s.id === 'question'"
        @change="emit('toggle', s.id)"
      />
      <span class="box" aria-hidden="true">
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m3.5 8.4 3 3L12.5 5" />
        </svg>
      </span>
      <span class="txt">
        <span class="name">{{ t(NAMES[s.id]) }}</span>
        <span class="desc">{{ describe(s, question) }}</span>
      </span>
      <span class="kb">{{ kb(s.bytes) }}</span>
    </label>
    <div class="rules">
      <span class="head">{{ t('ai.payload.rules') }}</span>
      <div class="chips">
        <span v-for="r in RULES" :key="r" class="chip">{{ r }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
}

.head {
  padding: 0 2px 4px;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.sec {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  flex: none;
  height: 44px;
  padding: 0 10px;
  border-radius: 10px;
  background: var(--surface-well);
  cursor: pointer;
  transition:
    opacity var(--dur-color) var(--ease-state),
    background-color var(--dur-color) var(--ease-state);
}

.sec.off {
  background: transparent;
  opacity: 0.7;
}

.sec.lock {
  cursor: default;
}

.in {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.box {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: var(--btn);
  color: var(--btn-ink);
}

.lock .box {
  background: var(--ink-5);
}

.off .box {
  background: var(--surface-0);
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
}

.off .box svg {
  opacity: 0;
}

.sec:has(.in:focus-visible) {
  box-shadow: var(--focus-ring);
}

.txt {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.name {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.desc {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb {
  color: var(--ink-3);
  font: var(--weight-regular) var(--text-11) var(--font-mono);
}

.rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-well);
}

.rules .head {
  padding: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--surface-0);
  box-shadow: 0 0 0 1px rgb(40 48 90 / 8%);
  color: var(--ink-2);
  font: var(--weight-medium) var(--text-11) var(--font-mono);
  white-space: nowrap;
}
</style>
