<!--
  Server level meter, from the boards "Data display" and "Charts". Two shapes:
  `stack` is the table meter, the value and the absolute amount above a 4 px bar on a tinted
  track; `row` is the pill meter, a label, an 8 px bar and the value in one line. The fill is
  accent below the warn line, amber, then rose, and the number takes the ink of its band; a
  reading that is missing is grey and draws no bar (never zero). The band decides colour only
  in addition to the number, and `bandLabel` puts its word in what a screen reader hears.
  All text is rendered as text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { barWidth, type Band } from '@/lib/chart-bands'
import { shouldPlay } from '@/lib/motion'

const props = withDefaults(
  defineProps<{
    /** The formatted reading, "92%" or "1.55"; "—" when there is none. */
    value: string
    /** 0 to 100, how much of the bar is filled; `null` draws an empty track. */
    pct: number | null
    band?: Band
    /** Absolute amount, "73.6 / 80 GB", above the bar (stack shape). */
    abs?: string
    /** What is measured: the visible label of the row shape, and the name for screen readers. */
    label: string
    /** The word for the band ("Warning"), read out with the value. */
    bandLabel?: string
    shape?: 'stack' | 'row'
    once?: string
  }>(),
  {
    band: 'ok',
    abs: undefined,
    bandLabel: undefined,
    shape: 'stack',
    once: undefined,
  },
)

const width = computed(() => barWidth(props.pct))
const play = shouldPlay(props.once)
const spoken = computed(() =>
  [props.value, props.abs, props.bandLabel].filter((part) => part && part !== '').join(', '),
)
</script>

<template>
  <div
    class="meter"
    :class="[`shape-${shape}`, `band-${band}`]"
    role="meter"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="pct === null ? undefined : width"
    :aria-valuetext="spoken"
  >
    <template v-if="shape === 'stack'">
      <div class="head">
        <b class="value">{{ value }}</b>
        <span v-if="abs" class="abs">{{ abs }}</span>
      </div>
      <div class="track">
        <i class="fill" :class="{ 'm-grow': play }" :style="{ width: `${width}%` }" />
      </div>
    </template>
    <template v-else>
      <span class="label">{{ label }}</span>
      <span class="track">
        <i class="fill" :class="{ 'm-grow': play }" :style="{ width: `${width}%` }" />
      </span>
      <b class="value">{{ value }}</b>
    </template>
  </div>
</template>

<style scoped>
.meter {
  --fill: var(--accent-mid);
  --ink-value: var(--ink);
}

.band-warn {
  --fill: var(--warn-solid);
  --ink-value: var(--warn-ink);
}

.band-crit {
  --fill: var(--crit-solid);
  --ink-value: var(--crit-ink);
}

.band-off {
  --fill: var(--surface-3);
  --ink-value: var(--ink-3);
}

.shape-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  line-height: normal;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-12);
}

.value {
  color: var(--ink-value);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.abs {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.track {
  display: block;
  overflow: hidden;
  height: 4px;
  border-radius: 4px;
  background: var(--surface-2);
}

.fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--fill);
  transition: width var(--dur-tween) var(--ease-out);
}

/* The pill shape: label, 8 px bar, value. The fill is accent 70 or amber, as on the board. */
.shape-row {
  --fill: var(--chart-accent-70);

  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) 48px;
  gap: var(--space-3);
  align-items: center;
  font-size: var(--text-12);
  line-height: normal;
}

.shape-row.band-warn {
  --fill: var(--chart-amber);
}

.shape-row.band-crit {
  --fill: var(--crit-solid);
}

.shape-row.band-off {
  --fill: var(--surface-3);
}

.shape-row .label {
  overflow: hidden;
  color: var(--ink-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shape-row .track {
  height: 8px;
  border-radius: var(--radius-full);
}

.shape-row .value {
  color: var(--ink);
  text-align: right;
}
</style>
