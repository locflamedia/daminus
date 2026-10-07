<!--
  "Scans", from the board "Scan history": number, date, the issue tags, hosts reached (amber
  under the full count) and how long it took. Picking two rows compares them: the newer of the
  pair is lit, the older tinted, and the chart above solidifies the same two columns.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '@/lib/format'
import { hostsShort, type ScanRow } from '@/lib/scan-history-chart'
import { useSettingsStore } from '@/stores/settings'
import UiIcon from '@/ui/UiIcon.vue'
import { vEnter } from '@/lib/motion'
import { describeCounts, scanDuration } from './history-text'

const props = defineProps<{
  rows: readonly ScanRow[]
  total: number
  selection: readonly number[]
  scope: string
}>()
const emit = defineEmits<{ toggle: [seq: number] }>()

const { t } = useI18n()
const settings = useSettingsStore()

const newest = computed(() => (props.selection.length === 2 ? Math.max(...props.selection) : null))

function state(seq: number): 'newer' | 'older' | 'none' {
  if (!props.selection.includes(seq)) return 'none'
  return seq === newest.value || props.selection.length < 2 ? 'newer' : 'older'
}

const views = computed(() =>
  props.rows.map((row) => {
    const locale = settings.language
    return {
      row,
      date: formatDate(row.startedAt, locale),
      duration: scanDuration(row.durationMs, locale),
      short: hostsShort(row.hosts),
      aria: t('historyScreen.list.row', {
        seq: row.seq,
        date: formatDate(row.startedAt, locale),
        issues: describeCounts(row, locale),
        reached: row.hosts.reached,
        total: row.hosts.total,
        duration: scanDuration(row.durationMs, locale),
      }),
    }
  }),
)

const foot = computed(() =>
  props.total > props.rows.length
    ? t('historyScreen.list.footCut', { n: props.rows.length, total: props.total })
    : t('historyScreen.list.foot', { n: props.rows.length }),
)
</script>

<template>
  <section class="card">
    <h3 class="head">
      <UiIcon name="folder" :size="16" class="mark" />
      {{ t('historyScreen.list.title') }}
      <span class="meta">{{ t('historyScreen.list.meta') }}</span>
    </h3>
    <ul class="rows" :aria-label="t('historyScreen.list.label')">
      <li
        v-for="(v, i) in views"
        :key="`${scope}:${v.row.seq}`"
        v-enter="{ index: Math.min(i, 8), once: `${scope}:scan:${v.row.seq}` }"
      >
        <button
          type="button"
          class="row"
          :class="`pick-${state(v.row.seq)}`"
          :aria-pressed="state(v.row.seq) !== 'none'"
          :aria-label="v.aria"
          :title="
            state(v.row.seq) === 'none'
              ? t('historyScreen.list.pick')
              : t('historyScreen.list.picked')
          "
          @click="emit('toggle', v.row.seq)"
        >
          <b class="mono num">#{{ v.row.seq }}</b>
          <span class="date">{{ v.date }}</span>
          <span class="tags" aria-hidden="true">
            <span v-if="v.row.crit > 0" class="tag crit">{{ v.row.crit }}</span>
            <span v-if="v.row.warn > 0" class="tag warn">{{ v.row.warn }}</span>
            <span v-if="v.row.info > 0" class="tag info">{{ v.row.info }}</span>
          </span>
          <span class="mono hosts" :class="{ short: v.short }" aria-hidden="true">
            {{ v.row.hosts.reached }}/{{ v.row.hosts.total }}
          </span>
          <span class="mono time" aria-hidden="true">{{ v.duration }}</span>
          <UiIcon name="chevron-right" :size="14" class="go" />
        </button>
      </li>
    </ul>
    <p class="foot">{{ foot }}</p>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.mark {
  flex: none;
  color: var(--ink-3);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
  white-space: nowrap;
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows > li:nth-child(odd) .row.pick-none {
  background: var(--surface-well);
}

.row {
  display: grid;
  grid-template-columns: 44px 72px minmax(0, 1fr) 60px 48px 20px;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: var(--text-12);
  text-align: left;
  transition: background-color var(--dur-color) var(--ease-state);
}

.row:hover {
  background: var(--surface-1);
}

.row:focus-visible {
  box-shadow: var(--focus-ring);
}

.row.pick-newer {
  background: var(--accent-soft);
}

.row.pick-older {
  background: color-mix(in srgb, var(--chart-lilac-soft) 30%, var(--surface-0));
}

.num {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.tags {
  display: flex;
  gap: 4px;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.tag.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.tag.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.tag.info {
  background: var(--info-soft);
  color: var(--info-ink);
}

.hosts.short {
  color: var(--warn-ink);
}

.time {
  color: var(--ink-3);
}

.go {
  color: var(--ink-4);
}

.pick-none .go {
  opacity: 0.6;
}

.foot {
  margin: auto 0 0;
  padding-top: var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
