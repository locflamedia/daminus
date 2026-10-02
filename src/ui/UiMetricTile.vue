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

  The value rolls when it changes (never on first draw). Every word is plain text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import UiEmptyValue from './UiEmptyValue.vue'
import UiIcon from './UiIcon.vue'
import UiRoll from './UiRoll.vue'
import UiSparkline, { type SparkTone } from './UiSparkline.vue'
import type { IconName } from './icon-paths'

export type MetricState = 'normal' | 'warn' | 'crit' | 'stale' | 'scanning' | 'needs-permission'

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
    /** Share of the series' range left above and below the line (10 % on the card). */
    headroom?: number
    /** When set, the line draws only the first time this key is seen. */
    once?: string
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
    headroom: 0.1,
    once: undefined,
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
</script>

<template>
  <div class="tile" :class="`state-${state}`" :data-state="state">
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

/* Reading: the value blurs in place and the shape holds. */
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
