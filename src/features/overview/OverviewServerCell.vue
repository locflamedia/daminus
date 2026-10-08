<!--
  One server of the strip (board "Overview · results"): a disk ring with the server mark inside,
  the name and the disk share, then load and memory. The ring is the accent and turns amber from
  80 percent, critical from 90. A server that did not answer fades and offers Retry; while a scan
  runs a server being read has a turning ring and says what is happening in words.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { ServerScan } from '@/lib/overview-scan'
import type { ServerCell } from '@/lib/overview-servers'
import { useHostKeyReview } from '@/features/host-key/use-host-key-review'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{
  cell: ServerCell
  scan: ServerScan
  /** Old results: nothing is amber or red until a fresh scan. */
  neutral: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const keys = useHostKeyReview()
const fmt = useFormat()

const CIRCUMFERENCE = 106.8
const down = computed(() => props.cell.state === 'unreachable' && props.scan === null)
const arc = computed(() => ((props.cell.disk ?? 0) / 100) * CIRCUMFERENCE)
const tone = computed(() =>
  props.neutral || props.cell.disk === null ? 'normal' : props.cell.diskTone,
)
const reading = computed(() => props.scan === 'reading')

const pct = computed(() => (down.value || props.cell.disk === null ? '—' : `${props.cell.disk}%`))
const load = computed(() =>
  props.cell.load === null
    ? null
    : t('overviewScreen.servers.load', { n: fmt.number(props.cell.load) }),
)
const mem = computed(() =>
  props.cell.memUsed === null ? null : t('overviewScreen.servers.mem', { n: props.cell.memUsed }),
)
const detail = computed(() => {
  if (props.scan === 'reading') return t('overviewScreen.servers.readingDisk')
  if (props.scan === 'queued') return t('overviewScreen.servers.waitSlot')
  if (props.cell.state === 'unreachable' && keys.has(props.cell.outcome)) {
    return t(`scanHost.${props.cell.outcome?.state}`)
  }
  if (props.cell.state === 'unreachable') {
    return props.cell.silentDays === null
      ? t('overviewScreen.servers.unreachable')
      : t('overviewScreen.servers.unreachableFor', { n: props.cell.silentDays })
  }
  if (props.cell.state === 'not-scanned') return t('overviewScreen.servers.notScanned')
  return [load.value, props.scan === 'done' ? null : mem.value].filter(Boolean).join(' · ')
})
</script>

<template>
  <article class="sv" :class="{ down }">
    <span
      class="r"
      role="img"
      :aria-label="
        cell.disk === null ? undefined : t('overviewScreen.servers.diskRing', { n: cell.disk })
      "
    >
      <svg
        class="g"
        :class="[`tone-${tone}`, { reading }]"
        width="40"
        height="40"
        viewBox="0 0 40 40"
        aria-hidden="true"
      >
        <template v-if="down">
          <circle
            class="dashed"
            cx="20"
            cy="20"
            r="17"
            fill="none"
            stroke-width="2"
            stroke-dasharray="3 4"
          />
        </template>
        <template v-else>
          <circle class="track" cx="20" cy="20" r="17" fill="none" stroke-width="3" />
          <circle
            class="fill"
            cx="20"
            cy="20"
            r="17"
            fill="none"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="
              reading ? `${CIRCUMFERENCE * 0.25} ${CIRCUMFERENCE}` : `${arc} ${CIRCUMFERENCE}`
            "
          />
        </template>
      </svg>
      <UiIcon name="server" :size="16" />
    </span>
    <div class="text">
      <span class="top">
        <RouterLink class="host mono" :to="{ name: 'server', params: { host: cell.host } }">{{
          cell.host
        }}</RouterLink>
        <span class="pct" :class="`tone-${tone}`">{{ pct }}</span>
      </span>
      <span class="sub">
        <span class="detail">{{ detail }}</span>
        <span class="end">
          <span v-if="scan === 'reading'" class="tag busy">{{
            t('overviewScreen.servers.reading')
          }}</span>
          <span v-else-if="scan === 'queued'" class="tag">{{ t('scanChip.queued') }}</span>
          <span v-else-if="scan === 'done'" class="done">✓ {{ t('scanChip.done') }}</span>
          <button
            v-else-if="down && keys.has(cell.outcome)"
            type="button"
            class="tag action"
            :aria-label="t('hostKey.reviewFor', { host: cell.host })"
            @click="keys.review(cell.host, cell.outcome)"
          >
            {{ t('hostKey.review') }}
          </button>
          <button v-else-if="down" type="button" class="tag action" @click="emit('retry')">
            {{ t('overviewScreen.servers.retry') }}
          </button>
        </span>
      </span>
    </div>
  </article>
</template>

<style scoped>
.sv {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: var(--space-3);
  border-radius: 14px;
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
}

.sv.down {
  opacity: 0.7;
}

.r {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--ink-3);
}

.g {
  position: absolute;
  inset: 0;
  transform: rotate(-90deg);
}

.track {
  stroke: var(--surface-2);
}

.dashed {
  stroke: var(--ink-5);
}

.fill {
  stroke: var(--accent);
  transition: stroke-dasharray var(--dur-slide) var(--ease-out);
}

.tone-warn .fill {
  stroke: var(--warn-solid);
}

.tone-crit .fill {
  stroke: var(--crit-solid);
}

.g.reading {
  transform-origin: center;
  animation: ring-turn 0.9s linear infinite;
}

.g.reading .track {
  stroke: var(--accent-soft);
}

.g.reading .fill {
  stroke: var(--accent-ink);
}

@keyframes ring-turn {
  from {
    transform: rotate(-90deg);
  }

  to {
    transform: rotate(270deg);
  }
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: normal;
}

.top,
.sub {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.host {
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The whole cell opens the server. */
.host::after {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  content: '';
}

.host:focus-visible {
  outline: none;
}

.host:focus-visible::after {
  box-shadow: var(--focus-ring);
}

.pct {
  margin-left: auto;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.pct.tone-warn {
  color: var(--warn-ink);
}

.pct.tone-crit {
  color: var(--crit-ink);
}

.down .pct {
  color: var(--ink-3);
}

.sub {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.end {
  margin-left: auto;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.tag.busy {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

/* Retry sits above the cell's link. */
.tag.action {
  position: relative;
  z-index: 1;
}

.tag.action:focus-visible {
  box-shadow: var(--focus-ring);
}

.done {
  color: var(--ok-ink);
  font-weight: var(--weight-medium);
}

@media (prefers-reduced-motion: reduce) {
  .g.reading {
    animation: none;
  }
}
</style>
