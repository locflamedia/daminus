<!--
  One host's lane while discover reads it. Head: a disc (tick, ring while reading, dashed ring
  while queued), the host, what the line is for (time and system, the source being read, the
  reason it failed), and the count of finds. Below, the counts by kind (a kind with nothing is
  dim, not hidden), the state chip when it is not simply done, one amber row per source it
  could not read with the fix to copy, and a collapsed Details row next to "Read again".
-->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { readingFraction } from '@/lib/discover-view'
import UiButton from '@/ui/UiButton.vue'
import UiChip from '@/ui/UiChip.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiRoll from '@/ui/UiRoll.vue'
import LaneCounts from './LaneCounts.vue'
import LaneDisc from './LaneDisc.vue'
import LaneFixRows from './LaneFixRows.vue'
import type { LaneView } from './use-discover-lanes'

const props = defineProps<{ lane: LaneView }>()
defineEmits<{ readAgain: [host: string] }>()

const { t } = useI18n()
const { duration } = useFormat()
const detailsId = useId()
const open = ref(false)

const failed = computed(() => props.lane.state === 'timeout' || props.lane.state === 'unreachable')
const settled = computed(() => !['queued', 'running'].includes(props.lane.state))

/** The second line of the head. */
const sub = computed(() => {
  const l = props.lane
  switch (l.state) {
    case 'running':
      return t(`setupDiscover.lane.line.${l.reading}`)
    case 'queued':
      return t('setupDiscover.lane.queued')
    case 'timeout':
      return t('setupDiscover.lane.timeout')
    case 'unreachable':
      if (l.outcome === 'auth_failed') return t('setupDiscover.lane.authFailed')
      if (l.outcome?.startsWith('host_key')) return t('setupDiscover.lane.hostKey')
      return t('setupDiscover.lane.unreachable')
    default: {
      const time = l.ms === null ? null : duration(l.ms)
      const where = l.via ? t('setupDiscover.lane.via', { host: l.via }) : l.os
      return [time, where].filter((x): x is string => !!x).join(' · ')
    }
  }
})

const chip = computed(() => {
  const l = props.lane
  const time = l.ms === null ? '' : duration(l.ms)
  switch (l.state) {
    case 'running':
      return {
        tone: 'info' as const,
        busy: true,
        text: t('setupDiscover.lane.chipReading', {
          source: t(`setupDiscover.lane.source.${l.reading}`),
        }),
      }
    case 'incomplete':
      return {
        tone: 'warn' as const,
        icon: 'warn' as const,
        text: t('setupDiscover.lane.chipIncomplete', { time }),
      }
    case 'timeout':
      return {
        tone: 'warn' as const,
        icon: 'clock' as const,
        text: t('setupDiscover.lane.chipTimeout', { time }),
      }
    case 'unreachable':
      return {
        tone: 'crit' as const,
        icon: 'unreachable' as const,
        text: t('setupDiscover.lane.chipUnreachable', { time }),
      }
    default:
      return null
  }
})

const chipNote = computed(() => {
  const l = props.lane
  if (l.state === 'running') return t('setupDiscover.lane.live')
  if (l.state === 'incomplete' && l.rows.length > 0) {
    return t('setupDiscover.lane.unread', { n: l.rows.length }, l.rows.length)
  }
  return null
})

/** The collapsed row says what was dropped or could not be read, in one line. */
const summary = computed(() => {
  const { dropped, unreadable } = props.lane.details
  const parts: string[] = []
  if (dropped > 0) parts.push(t('setupDiscover.details.dropped', { n: dropped }, dropped))
  if (unreadable.length === 1) {
    parts.push(t('setupDiscover.details.envOne', { path: unreadable[0] ?? '' }))
  } else if (unreadable.length > 1) {
    parts.push(t('setupDiscover.details.envMany', { n: unreadable.length }))
  }
  return parts
})

/** Done with nothing to say needs no row; a host that was not fully read always has one. */
const showFoot = computed(
  () => settled.value && (props.lane.state !== 'done' || summary.value.length > 0),
)
const showDetailsRow = computed(() => props.lane.state === 'incomplete' || summary.value.length > 0)
const progress = computed(() => readingFraction(props.lane.reading) + 0.06)
</script>

<template>
  <li
    class="lane"
    :class="[`lane-${lane.state}`, { scanning: lane.state === 'running' }]"
    :data-testid="`lane-${lane.host}`"
    :data-state="lane.state"
  >
    <span v-if="lane.state === 'running'" class="scanline" aria-hidden="true" />
    <div class="head">
      <LaneDisc :state="lane.state" :progress="progress" />
      <div class="who">
        <span class="name">{{ lane.host }}</span>
        <span class="sub" :class="{ read: lane.state === 'running', bad: failed }">
          <Transition name="line" mode="out-in">
            <span :key="sub">{{ sub }}</span>
          </Transition>
        </span>
      </div>
      <span v-if="lane.state === 'running'" class="count">
        <UiRoll :text="String(lane.found)" />
      </span>
      <span v-else-if="lane.state !== 'queued' && !failed" class="count">
        {{ t('setupDiscover.lane.found', { n: lane.found }) }}
      </span>
    </div>

    <div v-if="lane.state !== 'queued'" class="more">
      <div v-if="chip" class="state">
        <UiChip :tone="chip.tone" :busy="chip.busy" :icon="chip.icon">{{ chip.text }}</UiChip>
        <span v-if="chipNote" class="note">{{ chipNote }}</span>
      </div>
      <LaneCounts v-if="!failed" :host="lane.host" :counts="lane.counts" />
    </div>

    <LaneFixRows v-if="lane.state === 'incomplete'" :rows="lane.rows" />

    <div v-if="showFoot" class="foot" :class="{ bare: !showDetailsRow }">
      <button
        v-if="showDetailsRow"
        type="button"
        class="details"
        :aria-expanded="open"
        :aria-controls="detailsId"
        @click="open = !open"
      >
        <UiIcon name="chevron-down" :size="12" class="chev" :class="{ open }" />
        <b>{{ t('setupDiscover.details.label') }}</b>
        <span class="summary">{{
          summary.length > 0 ? summary.join(' · ') : t('setupDiscover.details.nothing')
        }}</span>
      </button>
      <span v-else class="grow" />
      <UiButton
        variant="ghost"
        size="small"
        icon="refresh"
        :data-testid="`read-again-${lane.host}`"
        @click="$emit('readAgain', lane.host)"
      >
        {{ t('setupDiscover.readAgain') }}
      </UiButton>
    </div>
    <div v-if="open && showDetailsRow" :id="detailsId" class="expanded">
      <span v-for="part in summary" :key="part">{{ part }}</span>
      <span v-if="summary.length === 0">{{ t('setupDiscover.details.nothing') }}</span>
      <template v-if="lane.details.unreadable.length > 0">
        <span class="expanded-title">{{ t('setupDiscover.details.envTitle') }}</span>
        <code v-for="p in lane.details.unreadable" :key="p">{{ p }}</code>
      </template>
    </div>
  </li>
</template>

<style scoped>
.lane {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 10px var(--space-3);
  border-radius: 14px;
  list-style: none;
}

.lane-queued {
  opacity: 0.75;
}

.scanning {
  overflow: hidden;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.scanline {
  position: absolute;
  inset: 0 auto 0 0;
  width: 40%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--accent) 10%, transparent),
    transparent
  );
  animation: scan 1.6s var(--ease-in-out) infinite;
  pointer-events: none;
}

@keyframes scan {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(260%);
  }
}

.head {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
}

.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  overflow: hidden;
  font: var(--weight-medium) var(--text-13) var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  display: block;
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub.read {
  color: var(--accent-ink);
}

.sub.bad {
  color: var(--warn-ink);
}

.lane-unreachable .sub.bad {
  color: var(--crit-ink);
}

.line-enter-active,
.line-leave-active {
  transition:
    opacity var(--dur-state) var(--ease-out),
    transform var(--dur-state) var(--ease-out);
}

.line-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.line-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.count {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.more {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-left: 44px;
}

.state {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.note {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.foot {
  position: relative;
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  padding: 0 var(--space-1) 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.foot.bare {
  background: none;
}

.grow {
  flex-grow: 1;
}

.details {
  display: flex;
  flex: 1 1 auto;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-3);
  font: inherit;
  font-size: var(--text-11);
  text-align: left;
  cursor: pointer;
}

.details b {
  flex: none;
  color: var(--ink-2);
  font-weight: var(--weight-medium);
}

.summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chev {
  flex: none;
  transition: transform var(--dur-state) var(--ease-out);
}

.chev.open {
  transform: rotate(180deg);
}

.expanded {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-11);
}

.expanded-title {
  color: var(--ink-2);
  font-weight: var(--weight-medium);
}

.expanded code {
  overflow-wrap: anywhere;
  font: var(--text-11) var(--font-mono);
}

@media (prefers-reduced-motion: reduce) {
  .scanline,
  .dash {
    animation: none;
  }
}
</style>
