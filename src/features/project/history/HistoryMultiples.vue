<!--
  Three curves, one cursor, from the board "Project · History": project disk, database and
  response time on one real-time axis (scans are uneven), soft monotone lines with a fading fill
  and a dashed crosshair that rides all three together. The card takes focus once; the arrow
  keys, Home, End and Escape move the cursor, and the card for the scan opens with it and reads
  the same sentence. A spike points at what else turned in the same scan.
-->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Project, ScanFact, ScanSummary } from '@/api'
import { useFormat } from '@/composables/use-format'
import { focusedByKeyboard, stepCursor } from '@/lib/chart-cursor'
import { formatDate, formatClock } from '@/lib/format'
import { drawSeries, nearestScan, timeAxis, xOf, CHART_H, CHART_W } from '@/lib/history-chart'
import type { ComparePair } from '@/lib/history-range'
import {
  leadingEntry,
  seriesDelta,
  topAt,
  type SeriesFacts,
  type SeriesId,
  type SeriesPoint,
} from '@/lib/history-series'
import { sameScanTrouble } from '@/lib/history-strip'
import { shouldPlay } from '@/lib/motion'
import { GROWTH_SHARE } from '@/lib/presentation-hints'
import { useSettingsStore } from '@/stores/settings'
import UiCard from '@/ui/UiCard.vue'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'

const props = defineProps<{
  scans: readonly ScanSummary[]
  series: SeriesFacts
  facts: readonly ScanFact[]
  project: Project | undefined
  projectId: string
  pair: ComparePair | null
}>()

const { t } = useI18n()
const fmt = useFormat()
const settings = useSettingsStore()
const uid = useId()
const play = shouldPlay(`history-curves-${props.projectId}`)

const SERIES: { id: SeriesId; icon: IconName; color: string; unit: 'bytes' | 'ms' }[] = [
  { id: 'disk', icon: 'disk', color: 'var(--accent)', unit: 'bytes' },
  { id: 'database', icon: 'database', color: 'var(--chart-lilac)', unit: 'bytes' },
  { id: 'response', icon: 'pulse', color: 'var(--chart-blush)', unit: 'ms' },
]

const axis = computed(() =>
  timeAxis(props.scans.map((s) => ({ seq: s.seq, at: Date.parse(s.finished_at) }))),
)

const cursor = ref<number | null>(null)
const keyboard = ref(false)
const plot = ref<HTMLElement[]>([])

function when(scan: ScanSummary): string {
  const at = new Date(scan.finished_at)
  return `${formatDate(at, settings.language)} ${formatClock(at, settings.language)}`
}

function split(value: number, unit: 'bytes' | 'ms') {
  return fmt.measure(value, unit)
}

function trouble(seq: number | null) {
  const scan = props.scans.find((s) => s.seq === seq)
  if (!scan) return null
  const found = sameScanTrouble(scan, props.projectId, ['response', 'uptime'])
  return found
    ? t('projectHistory.chart.same', {
        group: t(`projectHistory.strip.group.${found.group}`),
        state: t(`projectHistory.strip.state.${found.state}`),
      })
    : null
}

function responseWord(seq: number): string {
  const level = props.scans
    .find((s) => s.seq === seq)
    ?.projects.find((p) => p.id === props.projectId)?.checks['url.http']
  return level === 'crit'
    ? t('projectHistory.chart.down')
    : level === 'warn'
      ? t('projectHistory.chart.slow')
      : ''
}

function valueAt(points: readonly SeriesPoint[], seq: number): SeriesPoint | undefined {
  return points.find((p) => p.seq === seq)
}

const rows = computed(() =>
  SERIES.map((s) => {
    const points = props.series[s.id]
    const drawn = drawSeries(points, axis.value)
    const last = points[points.length - 1]
    const delta = props.pair ? seriesDelta(points, props.pair.from, props.pair.to) : null
    const growing =
      s.unit === 'bytes' &&
      delta !== null &&
      delta.from > 0 &&
      delta.change / delta.from >= GROWTH_SHARE
    return {
      ...s,
      points,
      drawn,
      value: last ? split(last.value, s.unit) : null,
      sub: subOf(s.id, last?.value ?? null),
      delta: delta
        ? {
            text: fmt.delta(delta.change, s.unit).text,
            tone: growing ? 'warn' : 'plain',
          }
        : null,
    }
  }),
)

/** The line under a chart's number; `total` is that number, to word a part of it as the board does. */
function subOf(id: SeriesId, total: number | null = null): string {
  const pair = props.pair
  if (id === 'response') {
    const url = props.project?.urls[0]
    let host = ''
    try {
      host = url ? new URL(url).hostname : ''
    } catch {
      host = url ?? ''
    }
    return host ? t('projectHistory.chart.responseSub', { host }) : ''
  }
  const to = pair?.to ?? props.scans[props.scans.length - 1]?.seq
  if (to === undefined) return ''
  const check = id === 'disk' ? 'disk.path' : 'db.size'
  const after = topAt(props.facts, props.project, check, to)
  const before = pair
    ? topAt(props.facts, props.project, check, pair.from)
    : new Map<string, number>()
  const lead = leadingEntry(after, before)
  if (!lead) return ''
  if (id === 'disk') {
    // "storage/logs is 0.9 of it": in the unit of the total above it, the unit is not repeated.
    const part = fmt.measure(lead.bytes, 'bytes')
    const whole = total === null ? null : fmt.measure(total, 'bytes')
    return t('projectHistory.chart.folderSub', {
      name: lead.name,
      size: whole !== null && whole.unit === part.unit ? part.value : part.text,
    })
  }
  return lead.growth !== null && lead.growth > 0
    ? t('projectHistory.chart.tableSub', {
        name: lead.name,
        delta: fmt.delta(lead.growth, 'bytes').text,
      })
    : t('projectHistory.chart.tableSize', {
        name: lead.name,
        size: fmt.measure(lead.bytes, 'bytes').text,
      })
}

const hasAny = computed(() => rows.value.some((r) => r.drawn))

function tipLeft(seq: number): string {
  const scan = props.scans.find((s) => s.seq === seq)
  return scan ? `${(xOf(axis.value, Date.parse(scan.finished_at)) / CHART_W) * 100}%` : '0%'
}

function tipRight(seq: number): boolean {
  const scan = props.scans.find((s) => s.seq === seq)
  return scan ? axis.value.fraction(Date.parse(scan.finished_at)) > 0.55 : false
}

/** The chart that carries the card: under the pointer, else the first with a point at the scan. */
const hoverChart = ref<SeriesId | null>(null)
const cardChart = computed<SeriesId | null>(() => {
  const seq = cursor.value
  if (seq === null) return null
  if (!keyboard.value && hoverChart.value && valueAt(props.series[hoverChart.value], seq))
    return hoverChart.value
  return SERIES.find((s) => valueAt(props.series[s.id], seq))?.id ?? null
})

const reading = computed(() => {
  const seq = cursor.value
  const scan = props.scans.find((s) => s.seq === seq)
  if (seq === null || !scan) return ''
  const parts = SERIES.flatMap((s) => {
    const p = valueAt(props.series[s.id], seq)
    return p
      ? [
          t('projectHistory.chart.part', {
            name: t(`projectHistory.chart.${s.id}`),
            value: split(p.value, s.unit).text,
          }),
        ]
      : []
  })
  return t('projectHistory.chart.reading', { seq, when: when(scan), parts: parts.join(', ') })
})

function onPointer(e: PointerEvent, id: SeriesId) {
  keyboard.value = false
  const box = plot.value[0]?.getBoundingClientRect()
  if (!box || box.width === 0) return
  hoverChart.value = id
  cursor.value = nearestScan(
    axis.value,
    Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
  )
}

function onLeave() {
  if (!keyboard.value) cursor.value = null
  hoverChart.value = null
}

function onKey(e: KeyboardEvent) {
  const seqs = props.scans.map((s) => s.seq)
  const at = cursor.value === null ? null : seqs.indexOf(cursor.value)
  const { next, handled } = stepCursor(e.key, at, seqs.length)
  if (!handled) return
  e.preventDefault()
  if (e.key === 'Escape') e.stopPropagation()
  keyboard.value = true
  cursor.value = next === null ? null : (seqs[next] ?? null)
}

function onFocus(e: FocusEvent) {
  const el = e.currentTarget
  if (!(el instanceof Element) || !focusedByKeyboard(el)) return
  keyboard.value = true
  const last = props.scans[props.scans.length - 1]
  if (cursor.value === null && last) cursor.value = last.seq
}

function onBlur() {
  keyboard.value = false
  cursor.value = null
}

const cursorLeft = computed(() => (cursor.value === null ? null : tipLeft(cursor.value)))
</script>

<template>
  <UiCard
    class="multi"
    tabindex="0"
    role="group"
    aria-roledescription="chart"
    :aria-label="t('projectHistory.chart.label')"
    :aria-describedby="`${uid}-hint`"
    :class="{ keyboard }"
    :style="{ '--card-gap': '0', '--card-pad': '8px 16px' }"
    @keydown="onKey"
    @focus="onFocus"
    @blur="onBlur"
  >
    <span :id="`${uid}-hint`" class="sr-only">{{ t('projectHistory.chart.hint') }}</span>
    <span class="sr-only" role="status" aria-live="polite">{{ reading }}</span>
    <div v-for="(row, i) in rows" :key="row.id" class="sm">
      <div class="meta">
        <span class="name"
          ><UiIcon :name="row.icon" :size="14" />{{ t(`projectHistory.chart.${row.id}`) }}</span
        >
        <span v-if="row.value" class="big"
          >{{ row.value.value }}<span class="unit">&nbsp;{{ row.value.unit }}</span></span
        >
        <span v-else class="none">{{ t('projectHistory.chart.noData') }}</span>
        <span class="sub" :title="row.sub">{{ row.sub }}</span>
      </div>
      <div
        :ref="
          (el) => {
            if (el) plot[i] = el as HTMLElement
          }
        "
        class="plot"
        @pointermove="onPointer($event, row.id)"
        @pointerleave="onLeave"
      >
        <svg
          v-if="row.drawn"
          :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient :id="`${uid}-${row.id}`" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" :stop-color="row.color" stop-opacity=".2" />
              <stop offset="1" :stop-color="row.color" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path :d="`M0 ${CHART_H - 0.5} H${CHART_W}`" class="base" />
          <path :d="row.drawn.area" :fill="`url(#${uid}-${row.id})`" :class="{ 'm-fill': play }" />
          <path
            :d="row.drawn.line"
            :class="{ 'm-draw': play }"
            :style="{ '--d': `${i * 120}ms` }"
            fill="none"
            :stroke="row.color"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
          <template v-for="end in [pair?.from, pair?.to]" :key="end">
            <circle
              v-if="end !== undefined && row.drawn.points.get(end)"
              :cx="row.drawn.points.get(end)?.[0]"
              :cy="row.drawn.points.get(end)?.[1]"
              :r="end === pair?.to ? 4 : 3.5"
              :fill="end === pair?.to ? row.color : 'var(--surface-0)'"
              :stroke="row.color"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </template>
        </svg>
        <template v-if="cursor !== null && cursorLeft">
          <span
            class="cursor"
            :class="{ ink: keyboard }"
            :style="{ left: cursorLeft }"
            aria-hidden="true"
          />
          <span
            v-if="valueAt(row.points, cursor) && row.drawn?.points.get(cursor)"
            class="dot"
            :style="{
              left: cursorLeft,
              top: `${((row.drawn?.points.get(cursor)?.[1] ?? 0) / CHART_H) * 100}%`,
              borderColor: row.color,
            }"
            aria-hidden="true"
          />
        </template>
        <div
          v-if="cursor !== null && cardChart === row.id"
          class="tip"
          :class="{ flip: tipRight(cursor) }"
          :style="{ left: cursorLeft ?? undefined }"
          aria-hidden="true"
        >
          <span class="t1">{{
            t('projectHistory.chart.tipTitle', {
              seq: cursor,
              when: when(scans.find((s) => s.seq === cursor) as ScanSummary),
            })
          }}</span>
          <span class="t2"
            >{{ split(valueAt(row.points, cursor)?.value ?? 0, row.unit).text }}
            <span v-if="row.id === 'response' && responseWord(cursor)" class="warn">{{
              responseWord(cursor)
            }}</span></span
          >
          <span v-if="trouble(cursor)" class="t3">{{ trouble(cursor) }}</span>
        </div>
      </div>
      <div class="side">
        <span v-if="row.delta" class="delta" :class="row.delta.tone">{{ row.delta.text }}</span>
        <span v-if="row.delta && pair" class="since">{{
          t('projectHistory.chart.since', { seq: pair.from })
        }}</span>
      </div>
    </div>
    <p v-if="!hasAny" class="empty">{{ t('projectHistory.chart.noData') }}</p>
  </UiCard>
</template>

<style scoped>
.multi {
  outline: none;
}

.multi:focus-visible {
  box-shadow: var(--focus-ring);
}

.sm {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) 88px;
  gap: var(--space-3);
  align-items: center;
  height: 150px;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.big {
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: -0.02em;
}

.unit {
  color: var(--ink-3);
  font-size: var(--text-12);
  font-weight: var(--weight-regular);
}

.none,
.sub {
  color: var(--ink-3);
  font-size: var(--text-11);
}

/* One line under the number, cut at the end, never broken across the column. */
.sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plot {
  position: relative;
  height: 128px;
}

.plot svg {
  display: block;
  width: 100%;
  height: 128px;
  overflow: visible;
}

.base {
  stroke: var(--surface-3);
  fill: none;
}

.cursor {
  position: absolute;
  top: -10px;
  bottom: -10px;
  width: 0;
  border-left: 1.5px dashed var(--accent-mid);
  pointer-events: none;
  z-index: 2;
}

.cursor.ink {
  border-left-color: var(--ink);
}

.dot {
  position: absolute;
  z-index: 2;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border: 2px solid;
  border-radius: 50%;
  background: var(--surface-0);
  pointer-events: none;
}

.tip {
  position: absolute;
  top: -6px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--surface-0);
  box-shadow: var(--shadow-pop);
  white-space: nowrap;
  pointer-events: none;
}

.tip.flip {
  transform: translateX(calc(-100% - 24px));
}

.t1,
.t3 {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.t2 {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.t2 .warn {
  color: var(--warn-ink);
  font-weight: var(--weight-regular);
}

.side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.delta {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.delta.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.delta.plain {
  background: var(--surface-1);
  color: var(--ink-3);
}

.since {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.empty {
  margin: 0;
  padding: var(--space-4);
  color: var(--ink-3);
  font-size: var(--text-12);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
