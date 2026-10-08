<!--
  "Compare", from the board "Scan history": what is new, fixed and unchanged between the two
  picked scans, the rows with the owner and how many scans an unchanged issue has stood, and
  under them how many hosts each scan reached and how long it took. The toggle reads the same
  two scans from either side. Words for the issues are the ones the project cards use.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { issueText } from '@/lib/issue-text'
import type { Compare, CompareKind, ScanFigures } from '@/lib/scan-history-compare'
import { itemIssue } from '@/lib/server-issue'
import { useSettingsStore } from '@/stores/settings'
import UiSeg from '@/ui/UiSeg.vue'
import { vEnter } from '@/lib/motion'
import { scanDuration } from './history-text'

const props = defineProps<{
  compare:
    | (Compare & {
        pair: { older: number; newer: number }
        figures: { older: ScanFigures; newer: ScanFigures } | null
      })
    | null
  selected: number
  reverse: boolean
  reading: boolean
  scope: string
}>()
const emit = defineEmits<{ reverse: [value: boolean] }>()

const { t } = useI18n()
const settings = useSettingsStore()

const options = computed(() => {
  const pair = props.compare?.pair
  return pair
    ? [
        { value: 'newer', label: t('historyScreen.compare.newer', { seq: pair.newer }) },
        { value: 'older', label: t('historyScreen.compare.older', { seq: pair.older }) },
      ]
    : []
})

const TAG: Record<CompareKind, string> = {
  new: 'tagNew',
  fixed: 'tagFixed',
  still: 'tagStill',
}

const rows = computed(() =>
  (props.compare?.rows ?? []).map((row) => ({
    row,
    title: issueText(itemIssue(row.item), settings.language),
    owner:
      row.kind === 'still' && row.scans !== null
        ? t('historyScreen.compare.scansOpen', { owner: row.owner, n: row.scans }, row.scans)
        : row.owner,
  })),
)

function figure(pick: 'hosts' | 'duration'): string {
  const f = props.compare?.figures
  if (!f) return ''
  const locale = settings.language
  const a =
    pick === 'hosts'
      ? `${f.older.hosts.reached}/${f.older.hosts.total}`
      : scanDuration(f.older.durationMs, locale)
  const b =
    pick === 'hosts'
      ? `${f.newer.hosts.reached}/${f.newer.hosts.total}`
      : scanDuration(f.newer.durationMs, locale)
  return `${a} → ${b}`
}

const hint = computed(() =>
  props.selected === 1 ? t('historyScreen.compare.pickOne') : t('historyScreen.compare.pickTwo'),
)
</script>

<template>
  <section class="card">
    <h3 class="head">
      {{ t('historyScreen.compare.title') }}
      <UiSeg
        v-if="compare"
        class="dir"
        :model-value="reverse ? 'older' : 'newer'"
        :options="options"
        :label="t('historyScreen.compare.direction')"
        @update:model-value="emit('reverse', $event === 'older')"
      />
    </h3>

    <p v-if="!compare" class="hint" role="status">
      {{ reading ? t('historyScreen.compare.reading') : hint }}
    </p>
    <template v-else>
      <div class="counts">
        <div class="count new">
          <b>{{ compare.new }}</b
          ><span>{{ t('historyScreen.compare.new') }}</span>
        </div>
        <div class="count fixed">
          <b>{{ compare.fixed }}</b
          ><span>{{ t('historyScreen.compare.fixed') }}</span>
        </div>
        <div class="count still">
          <b>{{ compare.still }}</b
          ><span>{{ t('historyScreen.compare.still') }}</span>
        </div>
      </div>
      <ul v-if="rows.length > 0" class="rows" :aria-label="t('historyScreen.compare.rows')">
        <li
          v-for="(r, i) in rows"
          :key="`${scope}:${reverse}:${r.row.id}`"
          v-enter="{ index: i, once: `${scope}:${reverse}:cmp:${r.row.id}` }"
          class="row"
        >
          <span class="kind" :class="r.row.kind">{{
            t(`historyScreen.compare.${TAG[r.row.kind]}`)
          }}</span>
          <span class="title" :class="{ gone: r.row.kind === 'fixed' }">{{ r.title }}</span>
          <span class="owner">{{ r.owner }}</span>
        </li>
      </ul>
      <p v-else class="hint">{{ t('historyScreen.compare.unchanged') }}</p>
      <div v-if="compare.figures" class="figures">
        <div class="fig">
          <span class="lbl">{{ t('historyScreen.compare.hosts') }}</span>
          <span class="mono">{{ figure('hosts') }}</span>
        </div>
        <div class="fig">
          <span class="lbl">{{ t('historyScreen.compare.duration') }}</span>
          <span class="mono">{{ figure('duration') }}</span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.head {
  display: flex;
  align-items: center;
  min-height: 28px;
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.dir {
  margin-left: auto;
}

.hint {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.counts {
  display: flex;
  gap: var(--space-2);
}

.count {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: var(--text-11);
}

.count b {
  font-size: 20px;
  font-weight: var(--weight-medium);
}

.count.new {
  background: var(--warn-soft);
}

.count.new b {
  color: var(--warn-ink);
}

.count.fixed {
  background: var(--ok-soft);
}

.count.fixed b {
  color: var(--ok-ink);
}

.count.still {
  background: var(--surface-1);
}

.count.still b {
  color: var(--ink-2);
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  border-radius: var(--radius-xs);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.kind.new {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.kind.fixed {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.kind.still {
  background: var(--surface-1);
  color: var(--ink-3);
}

.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title.gone {
  color: var(--ink-3);
  text-decoration: line-through;
}

.owner {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.figures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin-top: auto;
}

.fig {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-well);
}

.lbl {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.fig .mono {
  font-size: var(--text-12);
}
</style>
