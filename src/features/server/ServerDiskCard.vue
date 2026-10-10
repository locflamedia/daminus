<!--
  The disk trend of the server page, from the board "Server detail": the fullest filesystem
  over the last scans on the clock (scans happen on demand and unevenly), warn and crit bands
  behind the line with their own labels, the stroke warming past the warn line, a ring on every
  scan, and in the hover card of the newest scan the forecast in days at the pace of the last
  scans. Hovering or the arrow keys on the focused chart read any scan.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { useNow } from '@/composables/use-now'
import { axisTicks, DISK_SCANS, type DiskChart } from '@/lib/server-disk'
import { useSettingsStore } from '@/stores/settings'
import UiHistoryChart from '@/ui/UiHistoryChart.vue'
import UiIcon from '@/ui/UiIcon.vue'
import { diskTips } from './server-text'

const props = defineProps<{ chart: DiskChart | null; mount: string | null; scope: string }>()

const { t } = useI18n()
const fmt = useFormat()
const settings = useSettingsStore()
const now = useNow()
const hovered = ref<number | null>(null)

const SIZE = { width: 704, height: 255 }
const PLOT = { left: 12, right: 12, top: 8, bottom: 26 }

const sizes = computed(() => {
  const s = props.chart?.sizes
  if (!s || s.used === null || s.size === null || s.avail === null) return ''
  const used = fmt.measure(s.used, 'bytes')
  const size = fmt.measure(s.size, 'bytes')
  // "82.6 of 95 GB": the unit once when both sides share it.
  return t('serverScreen.disk.sizes', {
    used: used.unit === size.unit ? used.value : used.text,
    size: size.text,
    avail: fmt.measure(s.avail, 'bytes').text,
  })
})

const model = computed(() => {
  const c = props.chart
  if (!c) return null
  const locale = settings.language
  return {
    values: c.points.map((p) => p.value),
    times: c.points.map((p) => p.at),
    tips: diskTips(c, locale),
    labels: axisTicks(c.points, now.value, locale, t('serverScreen.disk.today')),
    bands: [
      {
        from: c.thresholds.crit,
        to: 100,
        tone: 'crit' as const,
        pill: true,
        label: t('serverScreen.disk.crit', { n: c.thresholds.crit }),
      },
      {
        from: c.thresholds.warn,
        to: c.thresholds.crit,
        tone: 'warn' as const,
        pill: true,
        label: t('serverScreen.disk.warn', { n: c.thresholds.warn }),
      },
    ],
  }
})
</script>

<template>
  <section
    class="card"
    :aria-label="t('serverScreen.disk.title', { mount: mount ?? '', n: DISK_SCANS })"
  >
    <h3 class="head">
      <UiIcon name="disk" :size="16" class="mark" />
      <i18n-t keypath="serverScreen.disk.title" tag="span" scope="global">
        <template #mount>
          <span class="mono mount">{{ chart?.mount ?? mount }}</span>
        </template>
        <template #n>{{ chart?.points.length ?? DISK_SCANS }}</template>
      </i18n-t>
      <span v-if="sizes" class="meta">{{ sizes }}</span>
    </h3>
    <div v-if="chart && model" class="plot">
      <UiHistoryChart
        :key="scope"
        v-model:hovered="hovered"
        :series="[{ id: 'disk', values: model.values }]"
        :times="model.times"
        :domain="chart.domain"
        :grid="chart.grid"
        :threshold="chart.thresholds.warn"
        :band="model.bands"
        :tips="model.tips"
        :x-labels="model.labels"
        :size="SIZE"
        :plot="PLOT"
        :date-inset="6"
        dots
        solid-end
        :label="t('serverScreen.disk.label', { mount: chart.mount })"
        :once="`${scope}:disk`"
      />
    </div>
    <p v-else class="empty">{{ t('serverScreen.disk.needsTwo') }}</p>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: 17px;
}

.mark {
  flex: none;
  color: var(--ink-3);
}

.mount {
  color: var(--ink-3);
  font-weight: var(--weight-regular);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
  white-space: nowrap;
}

.plot {
  min-width: 0;
}

.empty {
  display: grid;
  place-items: center;
  min-height: 196px;
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
