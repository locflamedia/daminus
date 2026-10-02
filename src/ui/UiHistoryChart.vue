<!--
  History chart, from the boards "Charts" and "Data display": one or two series over the last
  scans on a monotone curve of 2.5 with a soft area fading from 22 % to 0, two to four dotted
  gridlines at round values labelled in ink-3, and the newest value marked at the end. One
  series stays accent and warms to amber only across the segment past `threshold`; the second
  series is lilac, never a status colour; a soft band marks the warning zone instead of a hard
  line. Hovering (or the arrow keys on the focused chart) draws a dashed crosshair, a marker
  and a card with the scan, the value and its change. The line draws once when it arrives
  (600 ms) and the area fades in; Reduce Motion shows the final drawing.

  Values, labels and the description are given by the caller already formatted for the
  language; this component only places them.
-->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import {
  areaPath,
  gridValues,
  linePoints,
  monotonePath,
  paddedDomain,
  scaleLinear,
  type Point,
} from '@/lib/chart-geometry'
import { shouldPlay } from '@/lib/motion'
import UiChartLegend, { type LegendItem } from './UiChartLegend.vue'

export interface HistorySeries {
  id: string
  values: readonly number[]
  /** `accent` is the first series, `lilac` the second. */
  tone?: 'accent' | 'lilac'
}

export interface HistoryTip {
  /** "22 Sep · scan #37". */
  title: string
  /** "7.28 GB". */
  value: string
  /** "+0.04", in the pill beside the value. */
  delta?: string
}

export interface HistoryBand {
  from: number
  to: number
  /** "warn from 85%". */
  label: string
}

const props = withDefaults(
  defineProps<{
    series: readonly HistorySeries[]
    /** Gridline labels, formatted by the caller ("7.5 GB"). */
    formatY: (value: number) => string
    /** Labels under the axis at scan positions; the first is left aligned, the last right. */
    xLabels?: readonly { index: number; text: string }[]
    /** Value range; defaults to the data with 10 % headroom. */
    domain?: readonly [number, number]
    /** Gridline values; defaults to two to four round values inside the domain. */
    grid?: readonly number[]
    /** Single series: from this value the stroke and the end marker turn amber. */
    threshold?: number
    band?: HistoryBand
    /** Value and change written next to the newest point. */
    endLabel?: { value: string; delta?: string }
    /** One card per scan for the hover, in series order of the first series. */
    tips?: readonly HistoryTip[]
    legend?: readonly LegendItem[]
    /** What a screen reader hears for the chart. */
    label: string
    size?: { width: number; height: number }
    plot?: { left: number; right: number; top: number; bottom: number }
    once?: string
  }>(),
  {
    xLabels: () => [],
    domain: undefined,
    grid: undefined,
    threshold: undefined,
    band: undefined,
    endLabel: undefined,
    tips: () => [],
    legend: () => [],
    size: () => ({ width: 760, height: 236 }),
    plot: () => ({ left: 48, right: 20, top: 20, bottom: 32 }),
    once: undefined,
  },
)

/** The scan under the pointer or the keyboard cursor; `null` when none. */
const hovered = defineModel<number | null>('hovered', { default: null })

const uid = useId()
const play = shouldPlay(props.once)
const svg = ref<SVGSVGElement | null>(null)

const W = computed(() => props.size.width)
const H = computed(() => props.size.height)
const box = computed(() => ({
  x0: props.plot.left,
  x1: W.value - props.plot.right,
  y0: props.plot.top,
  y1: H.value - props.plot.bottom,
}))

const domain = computed<[number, number]>(() =>
  props.domain
    ? [props.domain[0], props.domain[1]]
    : paddedDomain(
        props.series.flatMap((s) => s.values),
        0.1,
        0.05,
      ),
)
const yOf = computed(() => scaleLinear(domain.value, [box.value.y1, box.value.y0]))

const gridLines = computed(() =>
  (props.grid ?? gridValues(domain.value[0], domain.value[1], 4)).map((v) => ({
    value: v,
    y: Math.round(yOf.value(v) * 10) / 10,
  })),
)

interface Drawn {
  series: HistorySeries
  points: Point[]
  line: string
  area: string
  color: string
}

const drawn = computed<Drawn[]>(() =>
  props.series.map((s) => {
    const points = linePoints(s.values, box.value, domain.value)
    return {
      series: s,
      points,
      line: monotonePath(points),
      area: areaPath(points, box.value.y1),
      color: s.tone === 'lilac' ? 'var(--chart-lilac)' : 'var(--accent)',
    }
  }),
)

// Drawn back to front, so the first series sits on top.
const layers = computed(() => [...drawn.value].reverse())
const primary = computed(() => drawn.value[0])
const single = computed(() => props.series.length === 1)

/** First scan of the single series at or past the threshold; -1 when it never gets there. */
const firstPast = computed(() => {
  const values = props.series[0]?.values
  if (!single.value || props.threshold === undefined || !values) return -1
  return values.findIndex((v) => v >= (props.threshold ?? Infinity))
})
const strokeStops = computed<[number, string][]>(() => {
  const i = firstPast.value
  const amber = 'var(--chart-amber)'
  if (i < 0)
    return [
      [0, 'var(--chart-accent-70)'],
      [1, 'var(--accent)'],
    ]
  if (i === 0)
    return [
      [0, amber],
      [1, amber],
    ]
  const x = (primary.value?.points[i - 1]?.[0] ?? 0) / W.value
  return [
    [0, 'var(--chart-accent-70)'],
    [x, 'var(--accent)'],
    [1, amber],
  ]
})
const pastEnd = computed(() => {
  const values = props.series[0]?.values
  return (
    firstPast.value >= 0 &&
    values !== undefined &&
    (values[values.length - 1] ?? -Infinity) >= (props.threshold ?? Infinity)
  )
})

const ends = computed(() =>
  drawn.value.map((d, i) => {
    const point = d.points[d.points.length - 1]
    const past = i === 0 && pastEnd.value
    return { point, color: past ? 'var(--chart-amber)' : d.color, past }
  }),
)

const xTicks = computed(() => {
  const points = primary.value?.points ?? []
  const last = props.xLabels.length - 1
  return props.xLabels.flatMap((l, k) => {
    const x = points[l.index]?.[0]
    if (x === undefined) return []
    return [{ ...l, x, anchor: k === 0 ? 'start' : k === last ? 'end' : 'middle' }]
  })
})

const count = computed(() => primary.value?.points.length ?? 0)
const cursor = computed(() => {
  const i = hovered.value
  if (i === null || i < 0 || i >= count.value) return null
  return {
    index: i,
    x: primary.value?.points[i]?.[0] ?? 0,
    markers: drawn.value.map((d) => ({ y: d.points[i]?.[1] ?? 0, color: d.color })),
    tip: props.tips[i],
  }
})

function onPointer(e: PointerEvent) {
  const el = svg.value
  if (!el || count.value === 0) return
  const rect = el.getBoundingClientRect()
  if (rect.width === 0) return
  const x = ((e.clientX - rect.left) / rect.width) * W.value
  const span = box.value.x1 - box.value.x0
  const i = Math.round(((x - box.value.x0) / span) * (count.value - 1))
  hovered.value = Math.min(count.value - 1, Math.max(0, i))
}

function onKey(e: KeyboardEvent) {
  const n = count.value
  if (n === 0) return
  const at = hovered.value
  let next: number | null | undefined
  if (e.key === 'ArrowLeft') next = at === null ? n - 1 : Math.max(0, at - 1)
  else if (e.key === 'ArrowRight') next = at === null ? n - 1 : Math.min(n - 1, at + 1)
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = n - 1
  else if (e.key === 'Escape' && at !== null) next = null
  if (next === undefined) return
  e.preventDefault()
  if (e.key === 'Escape') e.stopPropagation()
  hovered.value = next
}

const spoken = computed(() => {
  const tip = cursor.value?.tip
  return tip ? [tip.title, tip.value, tip.delta].filter(Boolean).join(', ') : ''
})
const gid = (name: string) => `${name}-${uid}`
</script>

<template>
  <div class="history">
    <div
      class="stage"
      tabindex="0"
      role="group"
      aria-roledescription="chart"
      :aria-label="label"
      @pointermove="onPointer"
      @pointerleave="hovered = null"
      @keydown="onKey"
      @blur="hovered = null"
    >
      <svg ref="svg" class="svg" :viewBox="`0 0 ${W} ${H}`" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient
            v-for="(d, i) in drawn"
            :id="gid(`area${i}`)"
            :key="d.series.id"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0"
              :style="{ stopColor: d.color }"
              :stop-opacity="single ? 0.22 : i === 0 ? 0.16 : 0.18"
            />
            <stop v-if="single" offset="0.7" :style="{ stopColor: d.color }" stop-opacity="0.04" />
            <stop offset="1" :style="{ stopColor: d.color }" stop-opacity="0" />
          </linearGradient>
          <linearGradient
            :id="gid('stroke')"
            x1="0"
            y1="0"
            :x2="W"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop
              v-for="[offset, color] in strokeStops"
              :key="offset"
              :offset="offset"
              :style="{ stopColor: color }"
            />
          </linearGradient>
        </defs>

        <template v-if="band">
          <rect
            class="band"
            :x="box.x0"
            :y="yOf(band.to)"
            :width="box.x1 + plot.right - box.x0 - 8"
            :height="yOf(band.from) - yOf(band.to)"
            rx="8"
          />
          <text class="band-text" :x="W - 12" :y="yOf(band.from) - 8" text-anchor="end">
            {{ band.label }}
          </text>
        </template>

        <path
          class="grid"
          :d="gridLines.map((g) => `M${box.x0} ${g.y} H${box.x1}`).join(' ')"
          fill="none"
          stroke-dasharray="2 6"
          stroke-linecap="round"
        />
        <text
          v-for="g in gridLines"
          :key="g.value"
          class="axis"
          :x="box.x0 - 12"
          :y="g.y + 4"
          text-anchor="end"
        >
          {{ formatY(g.value) }}
        </text>

        <g v-for="(d, k) in layers" :key="d.series.id">
          <path
            class="area"
            :class="{ 'm-fill': play }"
            :d="d.area"
            :style="{ '--d': '300ms', fill: `url(#${gid(`area${drawn.length - 1 - k}`)})` }"
          />
          <path
            class="curve"
            :class="{ 'm-draw': play }"
            pathLength="1"
            :d="d.line"
            fill="none"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            :style="{ stroke: single ? `url(#${gid('stroke')})` : d.color }"
          />
        </g>

        <g v-if="cursor" class="cursor">
          <line
            :x1="cursor.x"
            :x2="cursor.x"
            :y1="box.y0"
            :y2="box.y1"
            class="crosshair"
            stroke-dasharray="3 4"
            stroke-linecap="round"
          />
          <template v-for="(m, k) in cursor.markers" :key="k">
            <circle :cx="cursor.x" :cy="m.y" r="7" :style="{ fill: m.color }" fill-opacity="0.14" />
            <circle
              :cx="cursor.x"
              :cy="m.y"
              r="4.5"
              class="dot"
              stroke-width="2.5"
              :stroke="m.color"
            />
          </template>
        </g>

        <g
          v-for="(e, k) in ends"
          :key="k"
          class="end"
          :class="{ 'm-pop': play }"
          :style="{ '--d': '500ms' }"
        >
          <circle
            v-if="e.point && e.past"
            :cx="e.point[0]"
            :cy="e.point[1]"
            r="9"
            :fill="e.color"
            fill-opacity="0.16"
          />
          <circle
            v-if="e.point"
            :cx="e.point[0]"
            :cy="e.point[1]"
            r="4.5"
            class="dot"
            stroke-width="2.5"
            :stroke="e.color"
          />
        </g>

        <template v-if="endLabel && ends[0]?.point">
          <text
            class="end-value"
            :x="ends[0].point[0] - 16"
            :y="ends[0].point[1] - 13"
            text-anchor="end"
          >
            {{ endLabel.value }}
          </text>
          <text
            v-if="endLabel.delta"
            class="end-delta"
            :x="ends[0].point[0] - 16"
            :y="ends[0].point[1] + 1"
            text-anchor="end"
          >
            {{ endLabel.delta }}
          </text>
        </template>

        <text
          v-for="t in xTicks"
          :key="t.index"
          class="axis"
          :x="t.x"
          :y="H - 4"
          :text-anchor="t.anchor"
        >
          {{ t.text }}
        </text>
      </svg>

      <div
        v-if="cursor?.tip"
        class="tip"
        :style="{
          left: `clamp(0px, calc(${(cursor.x / W) * 100}% - 74px), calc(100% - 148px))`,
          top: `clamp(0px, calc(${((cursor.markers[0]?.y ?? 0) / H) * 100}% - 76px), calc(100% - 56px))`,
        }"
        aria-hidden="true"
      >
        <span class="tip-title">{{ cursor.tip.title }}</span>
        <span class="tip-row">
          <b class="tip-value">{{ cursor.tip.value }}</b>
          <span v-if="cursor.tip.delta" class="tip-delta">{{ cursor.tip.delta }}</span>
        </span>
      </div>
      <span class="sr-only" aria-live="polite">{{ spoken }}</span>
    </div>
    <UiChartLegend v-if="legend.length > 0 || $slots.default" :items="legend">
      <slot />
    </UiChartLegend>
  </div>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.stage {
  position: relative;
  border-radius: var(--radius-sm);
  outline: none;
}

.stage:focus-visible {
  box-shadow: var(--focus-ring);
}

.svg {
  display: block;
  width: 100%;
  height: auto;
}

.svg text {
  font-family: var(--font-sans);
}

.axis {
  fill: var(--ink-3);
  font-size: 11px;
}

.grid {
  stroke: var(--surface-3);
}

.band {
  fill: var(--warn-soft);
  fill-opacity: 0.7;
}

.band-text {
  fill: var(--warn-ink);
  font-size: 11px;
  font-weight: 500;
}

.crosshair {
  stroke: var(--ink-4);
}

.dot {
  fill: var(--chart-knob);
}

.end-value {
  fill: var(--ink);
  font-size: 12px;
  font-weight: 500;
}

.end-delta {
  fill: var(--warn-ink);
  font-size: 11px;
  font-weight: 500;
}

.tip {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: max-content;
  min-width: 148px;
  height: 56px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-pop);
  pointer-events: none;
}

.tip-title {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.2;
  white-space: nowrap;
}

.tip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.tip-value {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.tip-delta {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 var(--space-2);
  border-radius: 9px;
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}
</style>
