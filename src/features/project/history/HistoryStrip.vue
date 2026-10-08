<!--
  The strip of the History tab, from the board: five check groups by scans. Soft cells carry a
  glyph too (! warn, × crit, – not run), so colour is never the only signal; the two compared
  scans are ringed. The grid takes the arrow keys, one cell a tab stop.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScanSummary } from '@/api'
import type { ComparePair } from '@/lib/history-range'
import type { StripRow } from '@/lib/history-strip'
import UiCard from '@/ui/UiCard.vue'
import UiHeatmap, { type HeatRow } from '@/ui/UiHeatmap.vue'

const props = defineProps<{
  scans: readonly ScanSummary[]
  rows: readonly StripRow[]
  pair: ComparePair | null
}>()

const { t } = useI18n()

const columns = computed(() => props.scans.map((s) => ({ id: String(s.seq), label: `#${s.seq}` })))
const heat = computed<HeatRow[]>(() =>
  props.rows.map((r) => ({
    id: r.id,
    label: t(`projectHistory.strip.group.${r.id}`),
    icon: r.icon,
    cells: r.cells,
    titles: r.cells.map((state, i) =>
      t('projectHistory.strip.cell', {
        seq: props.scans[i]?.seq ?? 0,
        group: t(`projectHistory.strip.group.${r.id}`),
        state: t(`projectHistory.strip.state.${state}`),
      }),
    ),
  })),
)
const legend = computed(() => [
  {
    color: 'heat-ok' as const,
    text: t('projectHistory.strip.legend.ok'),
    shape: 'square' as const,
  },
  {
    color: 'heat-warn' as const,
    text: t('projectHistory.strip.legend.warn'),
    shape: 'square' as const,
  },
  {
    color: 'heat-crit' as const,
    text: t('projectHistory.strip.legend.crit'),
    shape: 'square' as const,
  },
  {
    color: 'heat-none' as const,
    text: t('projectHistory.strip.legend.none'),
    shape: 'square' as const,
  },
])
const selected = computed(() =>
  props.pair ? [String(props.pair.from), String(props.pair.to)] : [],
)
</script>

<template>
  <UiCard class="strip" :style="{ '--card-gap': '8px' }">
    <UiHeatmap
      :columns="columns"
      :rows="heat"
      :selected="selected"
      :legend="legend"
      :note="t('projectHistory.strip.note')"
      :label="t('projectHistory.strip.label')"
      :once="`history-strip`"
    />
  </UiCard>
</template>

<style scoped>
.strip {
  flex: none;
}
</style>
