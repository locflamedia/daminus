<!--
  "Changes since #n" (board "Overview · results"): a diff of the latest scan against the
  baseline, as plain rows in two columns. The title follows the state of the screen: it names
  the scan while one still runs, and says how old the results are when they are.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChangeRow } from './overview-list-text'

const props = defineProps<{
  rows: readonly ChangeRow[]
  more: number
  /** The scan the changes lead to, and the one they are measured from. */
  seq: number | null
  baseline: number | null
  scanning: boolean
  oldDays: number | null
}>()

const { t } = useI18n()

const title = computed(() => {
  const seq = props.seq ?? 0
  if (props.scanning) return t('overviewScreen.changes.titleScanning', { seq })
  if (props.oldDays !== null) {
    const ago = t('time.daysAgoLong', { n: props.oldDays }, props.oldDays)
    return t('overviewScreen.changes.titleOld', { seq, ago })
  }
  return t('overviewScreen.changes.title', { seq: props.baseline ?? 0 })
})

const empty = computed(() =>
  props.baseline === null
    ? t('overviewScreen.changes.noBaseline')
    : t('overviewScreen.changes.empty', { seq: props.baseline }),
)
</script>

<template>
  <section class="changes">
    <header class="head">
      <h2>{{ title }}</h2>
      <RouterLink class="link" to="/history"
        >{{ t('overviewScreen.changes.history') }} ›</RouterLink
      >
    </header>
    <ul v-if="rows.length > 0" class="list">
      <li v-for="row in rows" :key="row.id" class="row" :class="`tone-${row.tone}`">
        <span class="glyph" aria-hidden="true">{{ row.glyph }}</span>
        <span class="text" :title="row.text">{{ row.text }}</span>
        <span class="value mono">{{ row.value }}</span>
      </li>
    </ul>
    <p v-else class="empty">{{ empty }}</p>
    <p v-if="more > 0" class="more">{{ t('overviewScreen.changes.more', { n: more }) }}</p>
  </section>
</template>

<style scoped>
.changes {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  line-height: normal;
}

.head h2 {
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.link {
  margin-left: auto;
  border-radius: var(--radius-xs);
  color: var(--accent-ink);
  font-size: var(--text-12);
}

.link:focus-visible {
  box-shadow: var(--focus-ring);
}

.list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

/* The left column carries the soft well; the right one stays clear. */
.row:nth-child(odd) {
  background: var(--surface-well);
}

.glyph {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  font-size: var(--text-11);
  font-weight: var(--weight-semibold);
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.tone-crit .glyph {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.tone-crit .value {
  color: var(--crit-ink);
}

.tone-warn .glyph {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.tone-warn .value {
  color: var(--warn-ink);
}

.tone-info .glyph {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.tone-info .value {
  color: var(--accent-ink);
}

.tone-ok .glyph {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.tone-ok .value {
  color: var(--ok-ink);
}

.empty,
.more {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}

[data-range='narrow'] .list {
  grid-template-columns: minmax(0, 1fr);
}
</style>
