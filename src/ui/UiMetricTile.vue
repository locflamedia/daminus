<!--
  Metric tile, from the boards "Components" and "Project card": padding 8 12, radius 10 on a
  grey well. The label (11, with its 12 px glyph) and the delta share one line; under them
  the value (15/500, the unit 11 in ink-3), a 24 px sparkline of the last nine scans, and
  optionally a note with the state in words. States:

  - normal: accent line; the delta compares with the baseline chosen in the toolbar;
  - warn / crit: the delta and the line take the band's colour (past a threshold);
  - stale: a dashed grey line, and the age sits in the delta slot;
  - scanning: the value and the line blur and dim while the host is read, the layout holds;
  - needs permission: an em dash with a padlock, no line, the reason on hover.

  `form="note"` is the tile of a project card (board "Project card"): padding 8 10, no
  sparkline (trends live on the project page), and one note line under the value that says
  what changed, "no change", or what to do. The note is grey, 500 weight for a delta, amber
  past a threshold, amber at 400 for a missing permission, grey for the age of an old result, rose when critical;
  a value that is not set up is written in grey, and while the host is read the value and the
  note give way to two skeleton bars of their final heights.

  The value rolls when it changes (never on first draw). Every word is plain text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import UiEmptyValue from './UiEmptyValue.vue'
import UiIcon from './UiIcon.vue'
import UiRoll from './UiRoll.vue'
import UiSkeleton from './UiSkeleton.vue'
import UiSparkline, { type SparkTone } from './UiSparkline.vue'
import UiTooltip from './UiTooltip.vue'
import type { IconName } from './icon-paths'

export type MetricState =
  'normal' | 'warn' | 'crit' | 'stale' | 'scanning' | 'needs-permission' | 'not-set-up'

/** How the note line of the card form reads: plain, a delta, past a threshold, or old. */
export type NoteTone = 'plain' | 'delta' | 'warn' | 'crit' | 'old'

const props = withDefaults(
  defineProps<{
    label: string
    icon?: IconName
    /** The change since the baseline ("+1.1 GB"), or the age of a stale reading ("3 d ago"). */
    delta?: string
    value?: string
    unit?: string
    /** Up to nine readings, oldest first. */
    series?: readonly number[]
    state?: MetricState
    /** The state in words under the line ("Normal", "Needs permission"). */
    note?: string
    /** Why the value is missing, on hover (needs-permission). */
    reason?: string
    /** Share of the series' range left above and below the line (15 % everywhere). */
    headroom?: number
    /** When set, the line draws only the first time this key is seen. */
    once?: string
    /** `note` is the tile of a project card: no sparkline, one note line under the value. */
    form?: 'trend' | 'note'
    /** How the note reads in the card form; follows the state when not given. */
    noteTone?: NoteTone
    /** A clock beside the label of the card form, with this text as its tooltip: the number
     * can lag behind (MySQL refreshes table sizes about once a day). */
    hint?: string
  }>(),
  {
    icon: undefined,
    delta: undefined,
    value: undefined,
    unit: undefined,
    series: () => [],
    state: 'normal',
    note: undefined,
    reason: undefined,
    headroom: 0.15,
    once: undefined,
    form: 'trend',
    noteTone: undefined,
    hint: undefined,
  },
)

const tone = computed<SparkTone>(() =>
  props.state === 'warn'
    ? 'warn'
    : props.state === 'crit'
      ? 'crit'
      : props.state === 'stale'
        ? 'stale'
        : 'accent',
)
const deltaClass = computed(() => `delta-${props.state}`)
const missing = computed(() => props.state === 'needs-permission' || props.value === undefined)
const noteClass = computed(() => {
  if (props.noteTone) return `note-${props.noteTone}`
  if (props.state === 'warn') return 'note-warn'
  if (props.state === 'crit') return 'note-crit'
  if (props.state === 'stale' || props.state === 'needs-permission') return 'note-old'
  return 'note-plain'
})
</script>

<template>
  <div v-if="form === 'note'" class="tile tile-note" :class="`state-${state}`" :data-state="state">
    <span class="line">
      <span class="label"> <UiIcon v-if="icon" :name="icon" :size="12" />{{ label }} </span>
      <UiTooltip v-if="hint" :text="hint">
        <span class="lag" tabindex="0" role="img" :aria-label="hint"
          ><UiIcon name="clock" :size="12"
        /></span>
      </UiTooltip>
    </span>
    <template v-if="state === 'scanning'">
      <UiSkeleton class="sk-value" width="70%" height="16px" />
      <span v-if="note" class="note" :class="noteClass">{{ note }}</span>
      <UiSkeleton v-else class="sk-note" width="45%" height="10px" />
    </template>
    <template v-else>
      <span class="value" :class="{ muted: state === 'not-set-up' }">
        <span v-if="state === 'needs-permission' || value === undefined" aria-hidden="true">—</span>
        <template v-else>
          <UiRoll :text="value" />
          <span v-if="unit" class="unit">{{ ` ${unit}` }}</span>
        </template>
      </span>
      <span v-if="note" class="note" :class="noteClass" :title="note">{{ note }}</span>
    </template>
  </div>
  <div v-else class="tile" :class="`state-${state}`" :data-state="state">
    <span class="line">
      <span class="label"> <UiIcon v-if="icon" :name="icon" :size="12" />{{ label }} </span>
      <span v-if="delta" class="delta" :class="deltaClass">{{ delta }}</span>
    </span>
    <span class="value">
      <UiEmptyValue
        v-if="missing"
        :reason="state === 'needs-permission' ? 'permission' : 'none'"
        :hint="reason"
      />
      <template v-else>
        <UiRoll :text="value ?? ''" />
        <span v-if="unit" class="unit">{{ ` ${unit}` }}</span>
      </template>
    </span>
    <span class="spark">
      <UiSparkline
        v-if="!missing && series.length >= 3"
        :values="series"
        :tone="tone"
        :headroom="headroom"
        :once="once"
      />
    </span>
    <span v-if="note" class="note">{{ note }}</span>
  </div>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}

.delta {
  font-weight: var(--weight-medium);
}

.delta-normal {
  color: var(--ok-ink);
}

.delta-warn,
.delta-stale {
  color: var(--warn-ink);
}

.delta-crit {
  color: var(--crit-ink);
}

.delta-scanning,
.delta-needs-permission {
  color: var(--ink-3);
}

.value {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  line-height: 20px;
  transition:
    opacity var(--dur-state) var(--ease-state),
    filter var(--dur-state) var(--ease-state);
}

.unit {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
  white-space: pre;
}

.spark {
  display: block;
  height: 24px;
  transition:
    opacity var(--dur-state) var(--ease-state),
    filter var(--dur-state) var(--ease-state);
}

/* The card form: the clock follows the label, a gap apart, never against it. */
.tile-note .line {
  justify-content: flex-start;
  gap: var(--space-2);
}

/* The clock that says the number can lag: quiet, with the usual focus ring. */
.lag {
  display: inline-flex;
  flex: none;
  border-radius: var(--radius-xs);
  color: var(--ink-4);
}

.lag:focus-visible {
  box-shadow: var(--focus-ring);
}

/* Reading: the value blurs in place and the shape holds. */
.tile-note {
  padding: var(--space-2) 10px;
}

.value.muted {
  color: var(--ink-3);
}

.sk-value {
  margin-top: 3px;
}

.sk-note {
  margin-top: 4px;
}

.tile-note :is(.line, .value, .note) {
  line-height: normal;
}

/* The value and its unit stay on one line ("200 · 212 ms"). */
.tile-note .value {
  white-space: nowrap;
}

.tile-note .label {
  overflow: hidden;
}

/* One line, always: a card keeps its height whatever the note says. */
.tile-note .note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-note .note-plain {
  color: var(--ink-3);
}

.tile-note .note-delta {
  color: var(--ink-3);
  font-weight: var(--weight-medium);
}

.tile-note .note-warn {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}

.tile-note .note-crit {
  color: var(--crit-ink);
  font-weight: var(--weight-medium);
}

.tile-note .note-old {
  color: var(--warn-ink);
}

.state-scanning .value,
.state-scanning .spark {
  opacity: 0.3;
  filter: blur(2px);
}

.note {
  color: var(--ink-3);
  font-size: var(--text-11);
}

@media (prefers-reduced-motion: reduce) {
  .state-scanning .value,
  .state-scanning .spark {
    filter: none;
  }
}
</style>
