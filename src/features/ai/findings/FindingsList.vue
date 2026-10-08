<!--
  The ranked list of the Findings page, from the board "AI · Findings": a card whose rows are a
  28 px rank tile, the title (12/500) over where it is (mono 10) and the severity in words at
  the right. The chosen row takes the severity's wash and a soft shadow. The order is the AI's
  suggestion; the severity word and colour come from the check. Selection moves with the arrow
  keys and takes no animation.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { severityWords, type ResolvedFinding } from './resolve-findings'

defineProps<{
  findings: readonly ResolvedFinding[]
  selected: string
  /** Whether the order is the AI's (numbers shown) or the checks' own (no numbers). */
  ranked: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n()

function move(event: KeyboardEvent, list: readonly ResolvedFinding[], index: number) {
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (step === 0) return
  event.preventDefault()
  const next = list[index + step]
  if (!next) return
  emit('select', next.id)
  const row = (event.currentTarget as HTMLElement).parentElement?.children[index + step]
  ;(row as HTMLElement | undefined)?.focus()
}
</script>

<template>
  <ul class="list" role="listbox" :aria-label="t('aiFindings.list')">
    <li
      v-for="(finding, i) in findings"
      :key="finding.id"
      class="row m-enter"
      :class="[finding.tone, { on: finding.id === selected }]"
      :style="{ '--d': `${i * 60}ms` }"
      role="option"
      tabindex="0"
      :aria-selected="finding.id === selected"
      @click="emit('select', finding.id)"
      @keydown.enter.prevent="emit('select', finding.id)"
      @keydown="move($event, findings, i)"
    >
      <span class="rank">{{ ranked ? i + 1 : '' }}</span>
      <span class="text">
        <b class="title">{{ finding.item ? finding.title : t('aiFindings.unmatched') }}</b>
        <span v-if="finding.item" class="where">{{ finding.owner }} · {{ finding.where }}</span>
      </span>
      <span v-if="severityWords(finding)" class="sev">{{ severityWords(finding) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 52px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  cursor: default;
}

.row.on {
  box-shadow: var(--shadow-lift);
}

.row.on.crit {
  background: var(--crit-soft);
}

.row.on.warn {
  background: var(--warn-soft);
}

.row.on.info,
.row.on.plain {
  background: var(--surface-1);
}

.rank {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--surface-1);
  font-family: var(--font-mono);
  font-size: var(--text-11);
  font-weight: var(--weight-semibold);
}

.row.crit .rank {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.row.warn .rank {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.row.on .rank {
  background: var(--surface-0);
}

.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.title,
.where {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.where {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
}

.sev {
  font-size: 10px;
  font-weight: var(--weight-medium);
}

.row.crit .sev {
  color: var(--crit-ink);
}

.row.warn .sev {
  color: var(--warn-ink);
}

.row.info .sev {
  color: var(--info-ink);
}
</style>
