<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { vEnter } from '@/lib/motion'
import type { OverviewTile as Tile } from '@/lib/project-overview'
import { tlsState } from '@/lib/tls-state'
import UiIcon from '@/ui/UiIcon.vue'
import UiSparkline from '@/ui/UiSparkline.vue'
import UiTlsChip from '@/ui/UiTlsChip.vue'
import UiTooltip from '@/ui/UiTooltip.vue'
import type { IconName } from '@/ui/icon-paths'

const props = defineProps<{
  tile: Tile
  host: string
  mysql: boolean
  index: number
  projectId: string
  /** How long ago the numbers were read, when the saved results are over a day old. */
  age?: string | null
}>()

const { t } = useI18n()
const fmt = useFormat()

const ICON: Record<Tile['id'], IconName> = {
  uptime: 'globe',
  disk: 'database',
  database: 'database',
  tls: 'lock',
}
const label = computed(() => {
  const id = props.tile.id
  if (id === 'uptime') {
    return props.host
      ? t('projectOverview.tile.uptime', { host: props.host })
      : t('projectOverview.tile.uptimeNone')
  }
  return t(`projectOverview.tile.${id}`)
})

const measure = computed(() => {
  const v = props.tile.value
  if (v === null) return null
  if (props.tile.unit === 'days') {
    const whole = Math.trunc(v)
    return {
      value: whole < 0 ? `−${Math.abs(whole)}` : String(whole),
      unit: t('projectOverview.tile.days'),
    }
  }
  return fmt.measure(v, props.tile.unit)
})

const lineTone = computed(() => {
  const { id, tone } = props.tile
  if (tone !== 'accent') return tone
  return id === 'disk' ? 'warn' : id === 'database' ? 'lilac' : id === 'tls' ? 'ok' : 'accent'
})
// Disk reads amber when it grew, as the board draws it; a calm size stays accent.
const growing = computed(() => (props.tile.delta ?? 0) > 0)
const sparkTone = computed(() => {
  if (props.age) return 'stale'
  if (props.tile.id === 'disk' && !growing.value && props.tile.tone === 'accent') return 'accent'
  return lineTone.value
})

const tls = computed(() => (props.tile.id === 'tls' ? tlsState(props.tile.item) : null))
const flagged = computed(
  () => tls.value !== null && (tls.value.tone !== 'ok' || tls.value.flags.length > 0),
)
const statusText = computed(() => {
  const code = props.tile.status
  return code === 200 ? t('projectOverview.tile.statusOk', { code }) : String(code ?? '')
})

const deltaText = computed(() => {
  const d = props.tile.delta
  if (props.age) return ''
  if (d === null || d === 0 || props.tile.id === 'uptime' || props.tile.id === 'tls') return ''
  return fmt.delta(d, props.tile.unit).text
})
const emptyText = computed(() => {
  if (props.tile.empty === 'needs_perm') return t('projectOverview.tile.needsPermission')
  if (props.tile.empty === 'none') return t('projectOverview.tile.notSetUp')
  return t('projectOverview.tile.noAnswer')
})
const sparkLabel = computed(() =>
  t('projectOverview.tile.spark', { name: label.value, n: props.tile.series.length }),
)
</script>

<template>
  <article v-enter="{ index }" class="tile" :class="{ old: age }">
    <header class="head">
      <UiIcon :name="ICON[tile.id]" :size="16" class="glyph" />
      <span class="label">{{ label }}</span>
      <UiTooltip
        v-if="tile.id === 'database' && mysql"
        :text="t('projectOverview.tile.mysqlClock')"
      >
        <span
          class="clock"
          tabindex="0"
          role="img"
          :aria-label="t('projectOverview.tile.mysqlClock')"
        >
          <UiIcon name="clock" :size="12" />
        </span>
      </UiTooltip>
      <span class="status">
        <UiTlsChip v-if="flagged && tile.item && !age" :item="tile.item" />
        <span v-else-if="tile.id === 'uptime' && tile.status" :class="age ? 'delta' : 'ok'">{{
          statusText
        }}</span>
        <span v-else-if="tile.renewed && !age" class="ok">{{
          t('projectOverview.tile.renewed')
        }}</span>
        <span v-else-if="deltaText" class="delta" :class="{ warn: growing }">{{ deltaText }}</span>
      </span>
    </header>
    <div class="body">
      <b v-if="measure" class="value">
        {{ measure.value }}<small v-if="measure.unit" class="unit"> {{ measure.unit }}</small>
      </b>
      <b v-else class="value empty" aria-hidden="true">—</b>
      <span v-if="measure === null" class="why">{{ emptyText }}</span>
      <div v-else-if="tile.series.length > 2" class="spark">
        <UiSparkline
          :values="tile.series"
          :tone="sparkTone"
          :height="36"
          :label="sparkLabel"
          :once="`overview-${projectId}-${tile.id}`"
        />
      </div>
    </div>
    <span v-if="age" class="age">{{ age }}</span>
  </article>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: 14px var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.glyph {
  flex: none;
  color: var(--ink-3);
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clock {
  display: inline-grid;
  margin-left: calc(-1 * var(--space-1));
  color: var(--ink-4);
}

.status {
  margin-left: auto;
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.ok {
  color: var(--ok-ink);
}

.delta {
  color: var(--ink-3);
}

.delta.warn {
  color: var(--warn-ink);
}

.body {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 36px;
}

.value {
  font-size: 26px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.03em;
  line-height: 1;
}

.unit {
  margin-left: 2px;
  color: var(--ink-3);
  font-size: var(--text-13);
  font-weight: var(--weight-regular);
  letter-spacing: 0;
}

.age {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.empty {
  color: var(--ink-4);
}

.why {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.spark {
  flex: none;
  width: 120px;
}
</style>
