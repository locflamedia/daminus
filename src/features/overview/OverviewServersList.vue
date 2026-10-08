<!--
  The servers as one card of rows (board "Narrow window"): where the window is narrow and the
  cards sit two across, an odd last cell is the fourth cell of the grid and the servers take it:
  "Servers" with how many, then a row per host with its ring, name and disk share, on a zebra.
  The names and rings stay; load and memory live on the server's own page.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ServerCell } from '@/lib/overview-servers'
import { serverScan, type ServerScan } from '@/lib/overview-scan'
import { useScanStore } from '@/stores/scan'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ cells: readonly ServerCell[]; neutral: boolean }>()

const { t } = useI18n()
const scan = useScanStore()

const CIRCUMFERENCE = 44

interface Row {
  host: string
  arc: number
  tone: 'normal' | 'warn' | 'crit'
  down: boolean
  scan: ServerScan
  text: string
}

function textOf(cell: ServerCell, state: ServerScan): string {
  if (state === 'reading') return t('overviewScreen.servers.reading')
  if (state === 'queued') return t('scanChip.queued')
  if (cell.state === 'unreachable') return t('overviewScreen.servers.unreachable')
  if (cell.state === 'not-scanned') return t('overviewScreen.servers.notScanned')
  return cell.disk === null ? '—' : `${cell.disk}%`
}

const rows = computed<Row[]>(() =>
  props.cells.map((cell) => {
    const state = serverScan(cell.host, scan.run)
    const down = cell.state === 'unreachable' && state === null
    return {
      host: cell.host,
      arc: down ? 0 : ((cell.disk ?? 0) / 100) * CIRCUMFERENCE,
      tone: props.neutral || cell.disk === null ? 'normal' : cell.diskTone,
      down,
      scan: state,
      text: textOf(cell, state),
    }
  }),
)
</script>

<template>
  <section class="list-card" :aria-label="t('overviewScreen.servers.title')">
    <h2 class="head">
      <UiIcon name="server" :size="16" />
      {{ t('overviewScreen.servers.title') }}
      <span class="count">{{ cells.length }}</span>
    </h2>
    <div class="rows">
      <RouterLink
        v-for="row in rows"
        :key="row.host"
        class="row"
        :class="{ down: row.down }"
        :to="{ name: 'server', params: { host: row.host } }"
      >
        <svg class="ring" width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <circle class="track" cx="9" cy="9" r="7" fill="none" stroke-width="2.4" />
          <circle
            class="fill"
            :class="`tone-${row.tone}`"
            cx="9"
            cy="9"
            r="7"
            fill="none"
            stroke-width="2.4"
            stroke-linecap="round"
            :stroke-dasharray="`${row.arc} ${CIRCUMFERENCE}`"
          />
        </svg>
        <span class="host mono">{{ row.host }}</span>
        <span class="pct" :class="`tone-${row.tone}`">{{ row.text }}</span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.list-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding-bottom: 4px;
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: normal;
}

.head :deep(.icon) {
  color: var(--ink-3);
}

.count {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* The first row is the tinted one, as the board draws it. */
.row:nth-child(odd) {
  background: var(--surface-1);
}

.row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-size: var(--text-12);
}

.row:focus-visible {
  box-shadow: var(--focus-ring);
}

.row.down {
  opacity: 0.6;
}

.ring {
  transform: rotate(-90deg);
}

.track {
  stroke: var(--surface-3);
}

.fill {
  stroke: var(--accent);
}

.fill.tone-warn {
  stroke: var(--warn-solid);
}

.fill.tone-crit {
  stroke: var(--crit-solid);
}

.host {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pct {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.pct.tone-warn {
  color: var(--warn-ink);
}

.pct.tone-crit {
  color: var(--crit-ink);
}
</style>
