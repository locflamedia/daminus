<!--
  Charts and data primitives, laid out like the boards "Charts", "Data display", "Project ·
  Disk", "Project · History", "Scan history" and "Project card": the history chart with its
  hover card, gauges and meters, bars, donut, scan strips, memory comparison, sparklines, the
  server table, share and stacked bars, the treemap, the heatmap, the topology strip and the
  issues per scan. Every number is a sample from the boards; the replay button remounts the
  charts so their arrival animation can be seen again.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import DiskRing from '@/layout/DiskRing.vue'
import { useFormat } from '@/composables/use-format'
import { bandOf, type Band } from '@/lib/chart-bands'
import { formatDate, formatDateLong } from '@/lib/format'
import type { TopologyInput } from '@/lib/topology'
import { useSettingsStore } from '@/stores/settings'
import UiBarChart from '@/ui/UiBarChart.vue'
import UiButton from '@/ui/UiButton.vue'
import UiChartLegend from '@/ui/UiChartLegend.vue'
import UiChip, { type ChipTone } from '@/ui/UiChip.vue'
import UiDonut, { type DonutPart } from '@/ui/UiDonut.vue'
import UiGauge from '@/ui/UiGauge.vue'
import UiHeatmap, { type HeatRow } from '@/ui/UiHeatmap.vue'
import UiHeatStrip from '@/ui/UiHeatStrip.vue'
import UiHistoryChart, { type HistoryTip } from '@/ui/UiHistoryChart.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiIssueColumns from '@/ui/UiIssueColumns.vue'
import UiKbd from '@/ui/UiKbd.vue'
import UiMeter from '@/ui/UiMeter.vue'
import UiRow from '@/ui/UiRow.vue'
import UiRowList from '@/ui/UiRowList.vue'
import UiSeg from '@/ui/UiSeg.vue'
import UiShareBar from '@/ui/UiShareBar.vue'
import UiSparkline from '@/ui/UiSparkline.vue'
import UiStackedBar, { type StackPart } from '@/ui/UiStackedBar.vue'
import UiTopology from '@/ui/UiTopology.vue'
import UiTopologyNode from '@/ui/UiTopologyNode.vue'
import UiTreemap, { type TreemapTile } from '@/ui/UiTreemap.vue'
import GalleryFrame from './GalleryFrame.vue'
import {
  DB_DAYS,
  DB_FIRST_SCAN,
  DB_SIZE,
  HEAT_ROWS,
  HEAT_STATE,
  ISSUES,
  ISSUE_DAYS,
  MEMORY_ONE,
  MEMORY_TWO,
  SCAN_DURATION,
  SCAN_FIRST,
  SPARKS,
  STRIPS,
  STRIP_STATE,
} from './chart-samples'

const { t } = useI18n()
const fmt = useFormat()
const settings = useSettingsStore()

// The charts remount when this changes, so each plays its arrival again.
const run = ref(0)
const range = ref('14')
const hovered = ref<number | null>(10)

// The server table writes the load per core to two decimals (1.55, 0.20), the thresholds to one.
const fixed = (v: number, digits: number) =>
  new Intl.NumberFormat(settings.language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v)
const fixed2 = (v: number) => fixed(v, 2)
const gb = (v: number) => fmt.measure(v, 'GB').text
const pct = (v: number) => fmt.measure(v, '%').text
const k = (key: string, params: Record<string, unknown> = {}) => t(`gallery.charts.${key}`, params)

// --- History chart -------------------------------------------------------------------

const base = new Date(2026, 8, 13)
const dayOf = (days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
const dateLabel = (days: number) => formatDate(dayOf(days), settings.language)

const historyTips = computed<HistoryTip[]>(() =>
  DB_SIZE.map((value, i) => {
    const delta = i === 0 ? undefined : fmt.delta(value - (DB_SIZE[i - 1] ?? value), 'GB')
    return {
      title: k('history.scanTitle', { date: dateLabel(DB_DAYS[i] ?? 0), n: DB_FIRST_SCAN + i }),
      value: gb(value),
      delta: delta?.value,
      spoken: [
        k('history.spoken', {
          n: DB_FIRST_SCAN + i,
          date: formatDateLong(dayOf(DB_DAYS[i] ?? 0), settings.language),
        }),
        gb(value),
        delta?.text,
      ]
        .filter(Boolean)
        .join(', '),
    }
  }),
)
const historyXLabels = computed(() => [
  { index: 0, text: dateLabel(0) },
  { index: 3, text: dateLabel(3) },
  { index: 6, text: dateLabel(6) },
  { index: 10, text: dateLabel(9) },
  { index: 13, text: k('history.today') },
])
const ranges = computed(() => [
  { value: '7', label: k('history.range7') },
  { value: '14', label: k('history.range14') },
  { value: 'all', label: k('history.rangeAll') },
])
const bigSize = computed(() => fmt.measure(DB_SIZE[DB_SIZE.length - 1] ?? 0, 'GB'))
const growth = computed(() => (((DB_SIZE[13] ?? 0) / (DB_SIZE[0] ?? 1) - 1) * 100).toFixed(1))

// --- Gauges and meters ---------------------------------------------------------------

const diskBand = (v: number): Band => bandOf(v, { warn: 80, crit: 90 })
const bandWord = (band: Band) => k(`table.${band}`)
const chipTone = (band: Band): ChipTone =>
  band === 'crit' ? 'crit' : band === 'warn' ? 'warn' : 'ok'

const durationTips = computed(() =>
  SCAN_DURATION.map((value, i) => {
    const n = SCAN_FIRST + i
    return {
      title: k('bars.scanTitle', { n }),
      value: fmt.measure(value, 's').text,
      spoken: `${k('bars.spoken', { n })}, ${fmt.measure(value, 's').text}`,
    }
  }),
)

const miniMeters = computed(() => [
  { id: 'load', label: k('gauges.load'), value: fmt.number(1.55), pct: 78, band: 'warn' as Band },
  { id: 'io', label: k('gauges.io'), value: pct(12), pct: 12, band: 'ok' as Band },
  { id: 'inodes', label: k('gauges.inodes'), value: pct(34), pct: 34, band: 'ok' as Band },
  { id: 'swap', label: k('gauges.swap'), value: pct(18), pct: 18, band: 'ok' as Band },
])

// --- Donut ----------------------------------------------------------------------------

const donutParts = computed<DonutPart[]>(() => [
  {
    id: 'other',
    label: k('donut.other'),
    value: 27.2,
    display: gb(27.2),
    color: 'grey',
    other: true,
  },
  { id: 'docker', label: k('donut.docker'), value: 18.2, display: gb(18.2), color: 'accent' },
  { id: 'system', label: k('donut.system'), value: 12.4, display: gb(12.4), color: 'accent-70' },
  { id: 'kho', label: 'kho-hang', value: 9.7, display: gb(9.7), color: 'lilac' },
  { id: 'logs', label: k('donut.logs'), value: 6.1, display: gb(6.1), color: 'blush' },
])

// --- Scan history strips --------------------------------------------------------------

function tally(pattern: string): string {
  const n = (c: string) => [...pattern].filter((x) => x === c).length
  const parts: string[] = []
  if (n('h') > 0) parts.push(k('strips.ok', { n: n('h') }))
  if (n('w') > 0) parts.push(k('strips.warn', { n: n('w') }))
  if (n('c') > 0) parts.push(k('strips.crit', { n: n('c') }))
  if (n('u') > 0 && n('h') === 0) parts.push(k('strips.none', { n: n('u') }))
  // The unreachable tail reads "unreachable for N scans" and replaces the healthy count.
  return n('u') > 0 ? k('strips.none', { n: n('u') }) : parts.join(' · ')
}
const stateWord: Record<string, string> = {
  h: 'healthy',
  w: 'warning',
  c: 'critical',
  u: 'unreachable',
}
const strips = computed(() =>
  STRIPS.map((s) => ({
    ...s,
    summary: tally(s.pattern),
    cells: [...s.pattern].map((c) => STRIP_STATE[c] ?? 'none'),
    titles: [...s.pattern].map((c, i) =>
      k('strips.cell', { n: 13 + i, state: k(`strips.${stateWord[c] ?? 'unreachable'}`) }),
    ),
  })),
)

// --- Sparklines -----------------------------------------------------------------------

const sparkTiles = computed(() =>
  SPARKS.map((s) => {
    const name = k(`sparks.${s.id}`)
    const unit =
      s.id === 'latency'
        ? 'ms'
        : s.id === 'memory'
          ? '%'
          : s.id === 'ssl'
            ? k('sparks.days')
            : s.id === 'logs'
              ? 'MB'
              : 'GB'
    const note = k(
      `sparks.${
        {
          latency: 'normal',
          database: 'past',
          files: 'stale',
          memory: 'rising',
          ssl: 'countdown',
          logs: 'rotation',
        }[s.id]
      }`,
    )
    const delta = {
      latency: k('sparks.steady'),
      database: fmt.delta(1.1, 'GB').text,
      files: k('sparks.ago'),
      memory: fmt.delta(6, '%').text,
      ssl: k('sparks.renews'),
      logs: fmt.delta(-640, 'MB').text,
    }[s.id]
    return {
      ...s,
      name,
      unit,
      note,
      change: delta,
      shown: s.id === 'database' || s.id === 'files' ? fmt.number(Number(s.value)) : s.value,
      deltaTone: s.delta,
      aria: k('sparks.aria', { name, value: s.value, unit, note }),
    }
  }),
)

// --- Memory comparison ----------------------------------------------------------------

const memorySeries = [
  { id: 'one', values: MEMORY_ONE, tone: 'accent' as const },
  { id: 'two', values: MEMORY_TWO, tone: 'lilac' as const },
]
const memoryLegend = computed(() => [
  { color: 'accent' as const, text: k('memory.one', { pct: pct(81) }) },
  { color: 'lilac' as const, text: k('memory.two', { pct: pct(47) }) },
])

// --- Server table -----------------------------------------------------------------------

const tableRows = computed(() => {
  const meter = (id: string, value: string, abs: string, width: number, band: Band) => ({
    id,
    value,
    abs,
    pct: width,
    band,
  })
  return [
    {
      id: 'vps-sg-1',
      meta: k('table.meta1'),
      dim: false,
      meters: [
        meter('disk', pct(92), `${fmt.number(73.6)} / 80 GB`, 92, 'crit'),
        meter('memory', pct(81), `${fmt.number(3.2)} / 4 GB`, 81, 'warn'),
        meter('load', fixed2(1.55), '3.1 / 2', 100, 'warn'),
        meter('io', pct(12), k('table.avg'), 12, 'warn'),
      ],
      sec: k('table.sec1'),
      secTone: 'ok' as ChipTone,
    },
    {
      id: 'vps-hn-2',
      meta: k('table.meta2'),
      dim: false,
      meters: [
        meter('disk', pct(64), `${fmt.number(25.6)} / 40 GB`, 64, 'ok'),
        meter('memory', pct(47), `${fmt.number(0.94)} / 2 GB`, 47, 'ok'),
        meter('load', fixed2(0.2), '0.4 / 2', 20, 'ok'),
        meter('io', pct(1), k('table.avg'), 2, 'ok'),
      ],
      sec: k('table.sec2'),
      secTone: 'crit' as ChipTone,
    },
    {
      id: 'vps-hn-3',
      meta: k('table.meta3'),
      dim: true,
      meters: [
        meter('disk', pct(58), k('table.ago'), 58, 'off'),
        meter('memory', pct(40), k('table.ago'), 40, 'off'),
        { id: 'load', value: '—', abs: '', pct: null, band: 'off' as Band },
        { id: 'io', value: '—', abs: '', pct: null, band: 'off' as Band },
      ],
      sec: k('table.sec3'),
      secTone: 'neutral' as ChipTone,
    },
  ]
})
const tableColumns = 'minmax(0, 1.7fr) repeat(4, minmax(0, 1fr)) 110px'
const thresholds = computed(() => [
  ['t1', pct(80), pct(90)],
  ['t2', pct(80), pct(90)],
  ['t3', k('table.left15'), k('table.left5')],
  ['t4', fixed(1, 1), fixed(2, 1)],
  ['t5', pct(10), pct(25)],
  ['t6', '14', '3'],
  ['t7', '1 s', '3 s'],
])

// --- Share bars and stacked bar ---------------------------------------------------------

const mb = (v: number) => fmt.measure(v * 1024 ** 2, 'bytes').text
const mbDelta = (v: number) => fmt.delta(v * 1024 ** 2, 'bytes').text
const stackParts = computed<StackPart[]>(() => [
  { id: 'logs', label: 'storage/logs', value: 640, display: mb(640), mono: true },
  { id: 'vendor', label: 'vendor', value: 312, display: mb(312), mono: true },
  { id: 'other', label: k('parts.other'), value: 39, display: mb(39), other: true, mono: true },
])
const tableShares = computed(() => [
  { id: 'events', pct: 74, size: gb(6.2), change: fmt.delta(1.02, 'GB').text, grow: true },
  { id: 'orders', pct: 13, size: gb(1.1), change: mbDelta(21), grow: false },
  { id: 'sessions', pct: 3, size: mb(212), change: mbDelta(36), grow: false },
])

// --- Treemap ----------------------------------------------------------------------------

const treemapTiles = computed<TreemapTile[]>(() => [
  {
    id: 'uploads',
    label: 'public/uploads',
    value: 2.6,
    display: gb(2.6),
    delta: mbDelta(40),
    deltaTone: 'warn',
  },
  {
    id: 'logs',
    label: 'storage/logs',
    value: 0.9,
    display: gb(0.9),
    delta: fmt.delta(0.9, 'GB').text,
    deltaTone: 'warn',
    grow: true,
    growth: 0.9,
  },
  {
    id: 'app',
    label: 'storage/app',
    value: 1.1,
    display: gb(1.1),
    delta: mbDelta(20),
    deltaTone: 'warn',
  },
  { id: 'git', label: '.git', value: 0.4, display: gb(0.4), delta: k('treemap.noChange') },
  {
    id: 'other',
    label: k('treemap.other'),
    value: 0.4,
    display: gb(0.4),
    delta: k('treemap.noChange'),
    other: true,
  },
])

// --- Heatmap ----------------------------------------------------------------------------

const heatColumns = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  label: `#${i + 1}`,
}))
const heatRows = computed<HeatRow[]>(() =>
  HEAT_ROWS.map((row) => ({
    id: row.id,
    icon: row.icon,
    label: k(`heatmap.${row.id}`),
    cells: [...row.pattern].map((c) => HEAT_STATE[c] ?? 'none'),
    titles: [...row.pattern].map((c, i) =>
      k('heatmap.cell', {
        scan: `#${i + 1}`,
        group: k(`heatmap.${row.id}`),
        state: k(`heatmap.${{ o: 'ok', w: 'warn', c: 'crit', n: 'none' }[c] ?? 'none'}`),
      }),
    ),
  })),
)
const heatLegend = computed(() => [
  { color: 'heat-ok' as const, text: k('heatmap.ok'), shape: 'square' as const },
  { color: 'heat-warn' as const, text: k('heatmap.warn'), shape: 'square' as const },
  { color: 'heat-crit' as const, text: k('heatmap.crit'), shape: 'square' as const },
  { color: 'heat-none' as const, text: k('heatmap.none'), shape: 'square' as const },
])

// --- Topology ---------------------------------------------------------------------------

const topologyStates = computed(() => ({
  ok: k('topology.healthy'),
  warn: k('topology.warning'),
  crit: k('topology.critical'),
  unknown: k('topology.unknown'),
}))
const split: TopologyInput[] = [
  { id: 'fe', label: 'FE', host: 'vps-a', state: 'ok' },
  { id: 'be', label: 'BE', host: 'vps-b', state: 'ok' },
  { id: 'db', label: 'DB', host: 'vps-b', state: 'warn' },
  { id: 'worker', label: 'Worker', host: 'vps-b', state: 'ok' },
  { id: 'cache', label: 'Cache', host: 'vps-b', state: 'ok' },
  { id: 'queue', label: 'Queue', host: 'vps-b', state: 'unknown' },
]
const single: TopologyInput[] = [
  { id: 'fe', label: 'FE', host: 'vps-sg-1', state: 'ok' },
  { id: 'be', label: 'BE', host: 'vps-sg-1', state: 'warn' },
  { id: 'db', label: 'DB', host: 'vps-sg-1', state: 'crit' },
]
const moreLabel = (n: number) => k('topology.more', { n })

// The Project card board's three forms: one server, split across two, and three or more.
const byServer: { id: string; caption: string; items: TopologyInput[] }[] = [
  {
    id: 'one',
    caption: 'one',
    items: [
      { id: 'fe', label: 'FE', host: 'vps-hn-3', state: 'ok' },
      { id: 'be', label: 'BE', host: 'vps-hn-3', state: 'ok' },
      { id: 'db', label: 'DB', host: 'vps-hn-3', state: 'ok' },
    ],
  },
  {
    id: 'split',
    caption: 'split',
    items: [
      { id: 'fe', label: 'FE', host: 'vps-sg-1', state: 'ok' },
      { id: 'be', label: 'BE', host: 'vps-sg-2', state: 'ok' },
      { id: 'db', label: 'DB', host: 'vps-sg-2', state: 'ok' },
    ],
  },
  {
    id: 'many',
    caption: 'many',
    items: [
      { id: 'app', label: 'APP', host: 'vps-sg-2', state: 'ok' },
      { id: 'worker', label: 'WORKER', host: 'vps-sg-2', state: 'ok' },
      { id: 'db', label: 'DB', host: 'db-main', state: 'ok' },
      { id: 'cache', label: 'CACHE', host: 'cache-1', state: 'ok' },
    ],
  },
]

// --- Issues per scan --------------------------------------------------------------------

const issueScans = computed(() =>
  ISSUES.map((s, i) => {
    const n = i + 1
    const day = new Date(2026, 8, ISSUE_DAYS[i] ?? 1)
    const total = s.crit + s.warn + s.info
    const count = t('gallery.charts.issues.count', { n: total }, { plural: total })
    const description = k('issues.of', s)
    return {
      ...s,
      id: String(n),
      label: `#${n}`,
      description,
      tip: {
        title: k('issues.cardTitle', { n, date: formatDate(day, settings.language) }),
        value: count,
        spoken: [
          k('issues.spoken', { n, date: formatDateLong(day, settings.language) }),
          count,
          description,
        ].join(', '),
      },
    }
  }),
)
// --- Chart focus ------------------------------------------------------------------------

const focusScans = computed(() => issueScans.value.slice(4))
const focusAt = ref<number | null>(5)
const focusReads = computed(() =>
  focusAt.value === null ? '' : (focusScans.value[focusAt.value]?.tip.spoken ?? ''),
)
const focusCells = ['ok', 'ok', 'warn', 'ok', 'crit', 'crit', 'ok'] as const
const focusCellTitles = computed(() =>
  focusCells.map((state, i) =>
    k('strips.cell', {
      n: 5 + i,
      state: k(`strips.${{ ok: 'healthy', warn: 'warning', crit: 'critical' }[state]}`),
    }),
  ),
)

const issueLegend = computed(() => [
  { color: 'issue-crit' as const, text: k('issues.critical') },
  { color: 'issue-warn' as const, text: k('issues.warning') },
  { color: 'issue-info' as const, text: k('issues.info') },
])
</script>

<template>
  <div class="charts">
    <div class="toolbar">
      <p class="lede">{{ k('lede') }}</p>
      <UiButton variant="soft" size="small" @click="run += 1">{{ k('replay') }}</UiButton>
    </div>

    <div :key="run" class="stack">
      <div class="two">
        <GalleryFrame
          :title="k('history.title')"
          :text="k('history.text')"
          :spec="k('history.spec')"
        >
          <div class="head">
            <span class="tile accent"><UiIcon name="database" /></span>
            <span class="ttl"
              ><b>{{ k('history.name') }}</b
              ><span>{{ k('history.sub') }}</span></span
            >
            <UiSeg v-model="range" class="push" :options="ranges" :label="k('history.title')" />
          </div>
          <div class="figure">
            <span class="big"
              >{{ bigSize.value }}<small>{{ bigSize.unit }}</small></span
            >
            <UiChip tone="warn" icon="send">{{
              k('history.since', { value: fmt.measure(1.07, 'GB').text, scan: 41 })
            }}</UiChip>
            <span class="muted">{{
              k('history.over', { pct: `+${fmt.number(Number(growth))}%`, n: 14 })
            }}</span>
          </div>
          <UiHistoryChart
            v-model:hovered="hovered"
            :series="[{ id: 'size', values: DB_SIZE }]"
            :format-y="gb"
            :x-labels="historyXLabels"
            :domain="[6.5, 8.75]"
            :threshold="8"
            :tips="historyTips"
            :label="k('history.aria')"
            :legend="[
              { color: 'accent', text: k('history.legendSize') },
              { color: 'amber', text: k('history.legendCrossed') },
            ]"
          >
            <span v-if="hovered !== null">{{
              k('history.hovered', { n: DB_FIRST_SCAN + hovered })
            }}</span>
          </UiHistoryChart>
        </GalleryFrame>

        <GalleryFrame :title="k('gauges.title')" :text="k('gauges.text')" :spec="k('gauges.spec')">
          <div class="head">
            <span class="tile"><UiIcon name="server" /></span>
            <span class="ttl"
              ><b>{{ k('gauges.host') }}</b
              ><span>{{ k('gauges.hostSub') }}</span></span
            >
          </div>
          <div class="gauges">
            <UiGauge
              :pct="92"
              :band="diskBand(92)"
              :value="pct(92)"
              :caption="k('gauges.diskAbs')"
              :label="k('gauges.disk')"
              :description="k('gauges.diskAria')"
            >
              <template #state
                ><UiChip :tone="chipTone('crit')">{{ k('gauges.crit') }}</UiChip></template
              >
            </UiGauge>
            <UiGauge
              :pct="81"
              :band="diskBand(81)"
              :value="pct(81)"
              :caption="k('gauges.memoryAbs')"
              :label="k('gauges.memory')"
              :description="k('gauges.memoryAria')"
            >
              <template #state
                ><UiChip :tone="chipTone('warn')">{{ k('gauges.warn') }}</UiChip></template
              >
            </UiGauge>
          </div>
          <div class="minis">
            <UiMeter
              v-for="m in miniMeters"
              :key="m.id"
              shape="row"
              :label="m.label"
              :value="m.value"
              :pct="m.pct"
              :band="m.band"
              :band-label="bandWord(m.band)"
            />
          </div>
        </GalleryFrame>
      </div>

      <div class="three">
        <GalleryFrame :title="k('bars.title')" :text="k('bars.text')" :spec="k('bars.spec')">
          <div class="head">
            <span class="tile accent"><UiIcon name="clock" /></span>
            <span class="ttl"
              ><b>{{ k('bars.title') }}</b
              ><span>{{ k('bars.sub') }}</span></span
            >
            <span class="ttl end"
              ><b>{{ fmt.measure(2.2, 's').text }}</b
              ><span class="good">{{ fmt.delta(-0.6, 's').text }}</span></span
            >
          </div>
          <UiBarChart
            :values="SCAN_DURATION"
            :labels="{ first: '#29', last: '#42' }"
            :tips="durationTips"
            :label="k('bars.aria')"
            :legend="[
              { color: 'accent', text: k('bars.latest') },
              { color: 'bar-old', text: k('bars.earlier') },
              { color: 'ink-4', shape: 'ring', text: k('bars.average') },
            ]"
          />
        </GalleryFrame>

        <GalleryFrame :title="k('donut.title')" :text="k('donut.text')">
          <div class="head">
            <span class="tile"><UiIcon name="folder" /></span>
            <span class="ttl"
              ><b>{{ k('donut.title') }}</b
              ><span>{{ k('donut.sub') }}</span></span
            >
          </div>
          <UiDonut
            :parts="donutParts"
            :value="fmt.number(73.6)"
            :caption="k('donut.caption')"
            :label="k('donut.aria')"
          />
        </GalleryFrame>

        <GalleryFrame :title="k('strips.title')" :text="k('strips.sub')">
          <div class="head">
            <span class="tile ok"><UiIcon name="shield" /></span>
            <span class="ttl"
              ><b>{{ k('strips.title') }}</b
              ><span>{{ k('strips.sub') }}</span></span
            >
          </div>
          <div class="stripes">
            <UiHeatStrip
              v-for="s in strips"
              :key="s.name"
              :name="s.name"
              :summary="s.summary"
              :cells="s.cells"
              :titles="s.titles"
            />
          </div>
          <UiChartLegend
            size="small"
            :items="[
              { color: 'strip-ok', shape: 'square', text: k('strips.healthy') },
              { color: 'strip-warn', shape: 'square', text: k('strips.warning') },
              { color: 'strip-crit', shape: 'square', text: k('strips.critical') },
              { color: 'strip-none', shape: 'square', text: k('strips.unreachable') },
            ]"
          />
        </GalleryFrame>
      </div>

      <div class="two wide">
        <GalleryFrame :title="k('memory.title')" :text="k('memory.text')">
          <div class="head">
            <span class="tile"><UiIcon name="trend" /></span>
            <span class="ttl"
              ><b>{{ k('memory.title') }}</b
              ><span>{{ k('memory.sub') }}</span></span
            >
            <UiChartLegend class="push" :items="memoryLegend" />
          </div>
          <UiHistoryChart
            :series="memorySeries"
            :format-y="pct"
            :domain="[30, 100]"
            :grid="[40, 60, 80]"
            :band="{ from: 85, to: 100, label: k('memory.band') }"
            :size="{ width: 640, height: 252 }"
            :plot="{ left: 44, right: 8, top: 16, bottom: 24 }"
            :label="k('memory.aria')"
          />
        </GalleryFrame>

        <GalleryFrame :title="k('sparks.title')" :text="k('sparks.text')">
          <div class="sparks">
            <div v-for="s in sparkTiles" :key="s.id" class="spark-tile">
              <div class="spark-head">
                <span>{{ s.name }}</span>
                <span class="delta" :class="`d-${s.deltaTone}`">{{ s.change }}</span>
              </div>
              <b class="spark-value"
                >{{ s.shown }}<span class="unit"> {{ s.unit }}</span></b
              >
              <UiSparkline :values="s.values" :tone="s.tone" :height="32" :label="s.aria" />
              <span class="note">{{ s.note }}</span>
            </div>
            <div class="spark-tile">
              <div class="spark-head">
                <span>{{ k('sparks.few') }}</span>
              </div>
              <b class="spark-value">{{ fmt.measure(212, 'ms').text }}</b>
              <UiSparkline :values="[210, 212]" />
            </div>
          </div>
        </GalleryFrame>
      </div>

      <GalleryFrame :title="k('table.title')" :text="k('table.text')" :spec="k('table.spec')">
        <UiRowList :label="k('table.title')">
          <UiRow as="li" header :columns="tableColumns">
            <span>{{ k('table.host') }}</span>
            <span>{{ k('table.disk') }}</span>
            <span>{{ k('table.memory') }}</span>
            <span>{{ k('table.load') }}</span>
            <span>{{ k('table.io') }}</span>
            <span class="end">{{ k('table.security') }}</span>
          </UiRow>
          <UiRow
            v-for="row in tableRows"
            :key="row.id"
            as="li"
            size="status"
            :columns="tableColumns"
            :class="{ dim: row.dim }"
          >
            <span class="host">
              <span class="host-tile"><UiIcon name="server" /></span>
              <span class="host-text"
                ><b class="mono">{{ row.id }}</b
                ><span>{{ row.meta }}</span></span
              >
            </span>
            <UiMeter
              v-for="m in row.meters"
              :key="m.id"
              :label="k(`table.${m.id}`)"
              :value="m.value"
              :abs="m.abs"
              :pct="m.pct"
              :band="m.band"
              :band-label="bandWord(m.band)"
            />
            <UiChip class="end" :tone="row.secTone">{{ row.sec }}</UiChip>
          </UiRow>
        </UiRowList>
        <div class="thresholds">
          <b>{{ k('table.thresholds') }}</b>
          <UiRowList :label="k('table.thresholds')">
            <UiRow as="li" header columns="minmax(0, 1fr) 80px 80px">
              <span>{{ k('table.metric') }}</span>
              <span>{{ k('table.warnFrom') }}</span>
              <span>{{ k('table.critFrom') }}</span>
            </UiRow>
            <UiRow
              v-for="[id, warn, crit] in thresholds"
              :key="id"
              as="li"
              size="compact"
              columns="minmax(0, 1fr) 80px 80px"
            >
              <span>{{ k(`table.${id}`) }}</span>
              <span class="mono warn-ink">{{ warn }}</span>
              <span class="mono crit-ink">{{ crit }}</span>
            </UiRow>
          </UiRowList>
        </div>
      </GalleryFrame>

      <div class="two even">
        <GalleryFrame :title="k('parts.title')" :text="k('parts.text')">
          <div class="parts">
            <UiRowList :label="k('parts.table')">
              <UiRow as="li" header columns="minmax(0, 1fr) 80px 64px">
                <span>{{ k('parts.table') }}</span>
                <span class="end">{{ k('parts.size') }}</span>
                <span class="end">{{ k('parts.change') }}</span>
              </UiRow>
              <UiRow
                v-for="(s, i) in tableShares"
                :key="s.id"
                as="li"
                size="compact"
                columns="minmax(0, 1fr) 80px 64px"
              >
                <span class="share-cell"
                  ><span class="mono">{{ s.id }}</span
                  ><UiShareBar
                    :pct="s.pct"
                    :tone="s.grow ? 'grow' : 'accent'"
                    :on-grey="i % 2 === 0"
                /></span>
                <b class="end value">{{ s.size }}</b>
                <span class="end change" :class="{ grew: s.grow }">{{ s.change }}</span>
              </UiRow>
            </UiRowList>
            <b>{{ k('parts.stack') }}</b>
            <UiStackedBar :parts="stackParts" :label="k('parts.stackAria')" />
          </div>
        </GalleryFrame>

        <GalleryFrame
          :title="k('treemap.title')"
          :text="k('treemap.text')"
          :spec="k('treemap.sub')"
        >
          <UiTreemap :tiles="treemapTiles" :label="k('treemap.aria')" />
        </GalleryFrame>
      </div>

      <GalleryFrame :title="k('heatmap.title')" :text="k('heatmap.text')" :spec="k('heatmap.sub')">
        <UiHeatmap
          :columns="heatColumns"
          :rows="heatRows"
          :selected="['8', '12']"
          :legend="heatLegend"
          :note="k('heatmap.note')"
          :label="k('heatmap.aria')"
        />
      </GalleryFrame>

      <div class="two even">
        <GalleryFrame
          :title="k('byServer.title')"
          :text="k('byServer.text')"
          spec="row 40 · node 24 r6 · letters 10/600 mono"
        >
          <div v-for="form in byServer" :key="form.id" class="by-server">
            <UiTopology
              mode="servers"
              :list="false"
              :components="form.items"
              :url-label="k('topology.url')"
              :states="topologyStates"
              :more-label="moreLabel"
              :label="k(`byServer.${form.id}`)"
            />
            <span class="muted">{{ k(`byServer.${form.id}`) }}</span>
          </div>
          <div class="by-server">
            <UiTopology
              mode="servers"
              list
              :components="byServer[2]?.items ?? []"
              :url-label="k('topology.url')"
              :states="topologyStates"
              :more-label="moreLabel"
              :label="k('byServer.list')"
            />
            <span class="muted">{{ k('byServer.list') }}</span>
          </div>
        </GalleryFrame>

        <GalleryFrame
          :title="k('issues.title')"
          :text="k('issues.text')"
          spec="16 px an issue · column 22 · r5 · gap 6 · bars 120"
        >
          <div class="ct">
            <UiIcon name="clock" class="muted-icon" />
            {{ k('issues.title') }}
            <UiChartLegend class="push" size="small" :items="issueLegend" />
          </div>
          <UiIssueColumns :scans="issueScans" :compared="['11', '12']" :label="k('issues.aria')" />
        </GalleryFrame>
      </div>

      <GalleryFrame
        :title="k('topology.title')"
        :text="k('topology.text')"
        spec="24 · r6 · dot 6 · 11 px · link dashed 4"
      >
        <div class="nodes">
          <div class="node-case">
            <UiTopologyNode
              label="FE"
              caption="vps-sg-1"
              state="ok"
              :state-label="topologyStates.ok"
            />
            <span class="muted">{{ k('topology.healthy') }}</span>
          </div>
          <div class="node-case">
            <UiTopologyNode
              label="BE"
              :caption="k('topology.compose')"
              state="warn"
              :state-label="topologyStates.warn"
            />
            <span class="muted">{{ k('topology.warning') }}</span>
          </div>
          <div class="node-case">
            <UiTopologyNode
              label="DB"
              caption="vps-sg-1"
              state="crit"
              :state-label="topologyStates.crit"
            />
            <span class="muted">{{ k('topology.critical') }}</span>
          </div>
          <div class="node-case">
            <UiTopologyNode
              label="Worker"
              caption="pm2"
              state="unknown"
              :state-label="topologyStates.unknown"
            />
            <span class="muted">{{ k('topology.unknown') }}</span>
          </div>
          <div class="node-case">
            <UiTopologyNode label="+2" :state-label="moreLabel(2)" />
            <span class="muted">{{ k('topology.overflow') }}</span>
          </div>
        </div>
        <UiTopology
          :components="single"
          :url-label="k('topology.url')"
          :states="topologyStates"
          :more-label="moreLabel"
          :label="k('topology.aria')"
        />
        <UiTopology
          :components="split"
          :url-label="k('topology.url')"
          :states="topologyStates"
          :more-label="moreLabel"
          :label="k('topology.full')"
        />
        <span class="muted">{{ k('topology.full') }}</span>
      </GalleryFrame>

      <GalleryFrame
        :title="k('gauges.ring')"
        :text="k('gauges.ringText')"
        spec="16 · r7 · stroke 2.4 · 44 around"
      >
        <div class="rings">
          <DiskRing :pct="42" />
          <DiskRing :pct="87" />
          <DiskRing :pct="94" />
          <DiskRing :pct="null" reading />
          <DiskRing :pct="64" dim />
        </div>
      </GalleryFrame>

      <GalleryFrame :title="k('focus.title')" :text="k('focus.text')">
        <div class="focus">
          <UiIssueColumns
            v-model:hovered="focusAt"
            :scans="focusScans"
            :compared="['11', '12']"
            :label="k('focus.aria')"
          />
          <div class="focus-side">
            <span class="reads">{{ k('focus.reads') }}: “{{ focusReads }}”</span>
            <span class="keys">
              <span class="key"><UiKbd>← →</UiKbd>{{ k('focus.move') }}</span>
              <span class="key"><UiKbd>Home End</UiKbd>{{ k('focus.ends') }}</span>
              <span class="key"><UiKbd>esc</UiKbd>{{ k('focus.leave') }}</span>
            </span>
          </div>
        </div>
        <b class="muted">{{ k('focus.cells') }}</b>
        <UiHeatStrip
          :name="k('focus.stripName')"
          :summary="k('focus.stripSummary')"
          :cells="focusCells"
          :titles="focusCellTitles"
        />
        <div class="notes">
          <p>
            <b>{{ k('focus.ringHead') }}</b> {{ k('focus.ring') }}
          </p>
          <p>
            <b>{{ k('focus.readingHead') }}</b> {{ k('focus.reading') }}
          </p>
          <p>
            <b>{{ k('focus.tabHead') }}</b> {{ k('focus.tab') }}
          </p>
        </div>
      </GalleryFrame>
    </div>
  </div>
</template>

<style scoped>
.charts {
  /* The Charts board's cards are padded 20 px; every frame here takes the same. */
  --frame-pad: 20px;

  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.lede {
  max-width: 80ch;
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.two {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--space-4);
}

.two.wide {
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
}

.two.even {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.three {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

@media (max-width: 1100px) {
  .two,
  .two.wide,
  .two.even,
  .three {
    grid-template-columns: minmax(0, 1fr);
  }
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.tile {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink-3);
}

.tile.ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.tile.accent {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.ttl {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.ttl b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.ttl span {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.ttl.end {
  margin-left: auto;
  text-align: right;
}

.ttl .good {
  color: var(--ok-ink);
}

.by-server {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.muted-icon {
  color: var(--ink-3);
}

.ct {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.push {
  margin-left: auto;
}

.figure {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

/* A chip normally sits at the top of its row; here it follows the number's baseline. */
.figure :deep(.chip) {
  align-self: baseline;
}

.big {
  font-size: var(--text-28);
  letter-spacing: var(--track-28);
  line-height: 1.1;
}

.big small {
  margin-left: var(--space-1);
  color: var(--ink-3);
  font-size: var(--text-13);
  letter-spacing: 0;
}

.muted {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.focus {
  display: grid;
  grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

/* Room above the chart for the card, which opens over the focused column. */
.focus > :first-child {
  padding-top: 56px;
}

.focus-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reads {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-11);
}

.keys {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.notes {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.notes p {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.notes b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.gauges {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.minis {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stripes {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sparks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.spark-tile {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: 10px var(--space-3);
  border-radius: 12px;
  background: var(--surface-1);
  line-height: normal;
}

.spark-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.delta {
  margin-left: auto;
  font-weight: var(--weight-medium);
}

.d-flat {
  color: var(--ink-3);
}

.d-warn {
  color: var(--warn-ink);
}

.d-ok {
  color: var(--ok-ink);
}

.spark-value {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.unit {
  margin-left: 3px;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.note {
  color: var(--ink-2);
  font-size: var(--text-11);
}

.host {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.host-tile {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--surface-0);
  box-shadow: var(--shadow-node);
  color: var(--ink-3);
}

.host-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: normal;
}

.host-text b {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.host-text span {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dim {
  opacity: 0.55;
}

.end {
  align-self: center;
  justify-self: end;
  text-align: right;
}

.mono {
  font-family: var(--font-mono);
}

.thresholds {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 520px;
}

.warn-ink {
  color: var(--warn-ink);
  font-size: var(--text-11);
}

.crit-ink {
  color: var(--crit-ink);
  font-size: var(--text-11);
}

.parts {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.share-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.value {
  font-weight: var(--weight-medium);
}

.change {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.change.grew {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}

.nodes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-2);
}

.node-case {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.rings {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}
</style>
