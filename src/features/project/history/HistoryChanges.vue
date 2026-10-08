<!--
  "What changed", from the board "Project · History": the diff of two scans in words. Grew,
  started, updated, fixed; each row has a glyph, where it happened and by how much, and what got
  fixed is shown too, in green. Every row is read from the two saved reports, never guessed.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ComparePair } from '@/lib/history-range'
import type { ChangeKind, ChangeRow } from '@/lib/history-diff'
import { checkName } from '@/lib/issue-text'
import { staggerDelay } from '@/lib/motion'
import UiCard from '@/ui/UiCard.vue'

defineProps<{
  rows: readonly ChangeRow[]
  pair: ComparePair | null
  reading: boolean
  gone: boolean
}>()

const { t } = useI18n()

const GLYPH: Record<ChangeKind, string> = {
  grew: '▲',
  started: '!',
  updated: '↻',
  fixed: '✓',
  clean: '✓',
}

function title(row: ChangeRow): string {
  const params = { ...row.params }
  if (typeof params.check === 'string') params.check = checkName(params.check)
  return t(`projectHistory.change.title.${row.title}`, params)
}

function value(row: ChangeRow): string {
  return ['fixed', 'clean', 'warn', 'crit'].includes(row.value)
    ? t(`projectHistory.change.value.${row.value}`)
    : row.value
}
</script>

<template>
  <UiCard class="changes" :style="{ '--card-gap': '8px' }">
    <div class="head">
      <svg
        class="diff"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 3v10 M12 3v10 M4 8h8" />
      </svg>
      <span class="title">{{ t('projectHistory.changes.title') }}</span>
      <span v-if="pair" class="meta">{{
        t('projectHistory.changes.between', { from: pair.from, to: pair.to })
      }}</span>
    </div>
    <ul v-if="rows.length > 0" class="list">
      <li
        v-for="(row, i) in rows"
        :key="row.id"
        class="row"
        :class="[`tone-${row.tone}`, 'm-enter']"
        :style="{ '--d': staggerDelay(i, 80) }"
      >
        <span class="glyph" aria-hidden="true">{{ GLYPH[row.kind] }}</span>
        <div class="words">
          <span class="t">{{ title(row) }}</span>
          <span class="s">{{ t(`projectHistory.change.sub.${row.sub}`, row.subParams) }}</span>
        </div>
        <span v-if="row.value" class="v">{{ value(row) }}</span>
      </li>
    </ul>
    <p v-else-if="reading" class="note" role="status">{{ t('projectHistory.changes.reading') }}</p>
    <p v-else-if="gone" class="note">{{ t('projectHistory.changes.gone') }}</p>
    <p v-else-if="pair && pair.from === pair.to" class="note">
      {{ t('projectHistory.changes.same') }}
    </p>
    <p v-else class="note">{{ t('projectHistory.changes.empty') }}</p>
  </UiCard>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.head .diff {
  color: var(--ink-3);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px;
  border-radius: var(--radius-sm);
}

.tone-warn {
  --tone-bg: var(--warn-soft);
  --tone-ink: var(--warn-ink);
  background: color-mix(in srgb, var(--warn-soft) 30%, var(--surface-0));
}

.tone-info {
  --tone-bg: var(--info-soft);
  --tone-ink: var(--info-ink);
  background: var(--surface-1);
}

.tone-ok {
  --tone-bg: var(--ok-soft);
  --tone-ink: var(--ok-ink);
  background: color-mix(in srgb, var(--ok-soft) 40%, var(--surface-0));
}

.glyph {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--tone-bg);
  color: var(--tone-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-semibold);
}

.words {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.t {
  overflow: hidden;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  line-height: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.s {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v {
  color: var(--tone-ink);
  font-family: var(--font-mono);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.note {
  margin: 0;
  padding: var(--space-3) var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
