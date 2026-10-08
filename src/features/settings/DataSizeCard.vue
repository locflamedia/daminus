<!--
  "Size over scans": the folder's size after each scan as a line, what a scan costs, where it
  levels off at the current limit, and three facts (oldest scan, files, largest part).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate, formatMeasure } from '@/lib/format'
import { linePoints, monotonePath } from '@/lib/chart-geometry'
import { bytesPerScan, growth, largestPart, levelOff } from '@/lib/data-view'
import { vDraw } from '@/lib/motion'
import { useDataStore } from '@/stores/data'
import DataCard from './DataCard.vue'

const { t } = useI18n()
const data = useDataStore()

const size = (bytes: number) => formatMeasure(bytes, 'bytes').text

const W = 560
const H = 90
const BOX = { x0: 4, x1: W - 4, y0: 12, y1: 78 }

const curve = computed(() => {
  const sizes = growth(data.usage?.scan_sizes ?? [])
  const top = sizes[sizes.length - 1]
  if (sizes.length < 2 || top === undefined) return null
  const points = linePoints(sizes, BOX, [0, top])
  const line = monotonePath(points)
  const last = points[points.length - 1]
  const first = points[0]
  if (!last || !first) return null
  return { line, area: `${line} L${last[0]} ${H} L${first[0]} ${H} Z` }
})

const perScan = computed(() => (data.usage ? bytesPerScan(data.usage) : 0))
const level = computed(() => {
  const keep = data.retention.keep_scans
  const bytes = data.usage ? levelOff(data.usage, keep) : null
  return keep === null || bytes === null
    ? null
    : t('settingsData.size.levels', { keep, size: size(bytes) })
})

const largest = computed(() => {
  if (!data.usage) return '—'
  const { id, bytes } = largestPart(data.usage)
  const part = t(`settingsData.size.part${id === 'scans' ? 'Scans' : id === 'ai' ? 'Ai' : 'Logs'}`)
  return t('settingsData.size.largestValue', { part, size: size(bytes) })
})

const oldest = computed(() =>
  data.oldest
    ? t('settingsData.size.oldestValue', {
        seq: data.oldest.seq,
        date: formatDate(data.oldest.finished_at),
      })
    : '—',
)
</script>

<template>
  <DataCard
    :title="t('settingsData.size.title')"
    icon="clock"
    :aside="perScan > 0 ? t('settingsData.size.perScan', { size: size(perScan) }) : undefined"
  >
    <svg
      v-if="curve"
      class="chart"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="t('settingsData.size.curve')"
    >
      <path :d="curve.area" class="area" />
      <path v-draw :d="curve.line" class="line" vector-effect="non-scaling-stroke" />
    </svg>
    <span v-if="level" class="note">{{ level }}</span>
    <div class="facts">
      <div class="fact">
        <span class="note">{{ t('settingsData.size.oldest') }}</span>
        <b class="value">{{ oldest }}</b>
      </div>
      <div class="fact">
        <span class="note">{{ t('settingsData.size.files') }}</span>
        <b class="value">{{ t('settingsData.size.filesValue', { n: data.usage?.scans ?? 0 }) }}</b>
      </div>
      <div class="fact">
        <span class="note">{{ t('settingsData.size.largest') }}</span>
        <b class="value">{{ largest }}</b>
      </div>
    </div>
  </DataCard>
</template>

<style scoped>
.chart {
  flex: none;
  width: 100%;
  height: 110px;
}

.area {
  fill: var(--accent);
  fill-opacity: 0.08;
}

.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
}

.note {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin-top: auto;
}

.fact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-well);
}

.value {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}
</style>
