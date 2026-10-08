<!--
  The two-thumb slider of Settings › Scan, 50 to 100 percent: the warn thumb has its label above
  the track and the critical one below, so 80 and 90 never collide. A thumb moves with the
  pointer or the arrow keys (1 step; Page keys 5); the new value is sent when it is let go.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { DISK_RANGE } from '@/lib/scan-settings'

const props = defineProps<{ warn: number; crit: number }>()
const emit = defineEmits<{ change: [band: { warn: number; crit: number }] }>()

const { t } = useI18n()
const { min, max } = DISK_RANGE

const track = ref<HTMLElement>()
const drag = ref<{ thumb: 'warn' | 'crit'; value: number } | null>(null)

const warn = computed(() => (drag.value?.thumb === 'warn' ? drag.value.value : props.warn))
const crit = computed(() => (drag.value?.thumb === 'crit' ? drag.value.value : props.crit))

const bands = computed(
  () =>
    `linear-gradient(90deg, var(--ok-soft) 0 ${pct(warn.value)}%, ` +
    `var(--warn-soft) ${pct(warn.value)}% ${pct(crit.value)}%, var(--crit-soft) ${pct(crit.value)}%)`,
)

function pct(value: number): number {
  return ((value - min) / (max - min)) * 100
}

function clamp(thumb: 'warn' | 'crit', value: number): number {
  const v = Math.round(value)
  return thumb === 'warn'
    ? Math.min(Math.max(v, min), props.crit - 1)
    : Math.min(Math.max(v, props.warn + 1), max)
}

function valueAt(clientX: number): number {
  const box = track.value?.getBoundingClientRect()
  if (!box || box.width === 0) return min
  return min + ((clientX - box.left) / box.width) * (max - min)
}

function start(event: PointerEvent, thumb: 'warn' | 'crit') {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  drag.value = { thumb, value: thumb === 'warn' ? props.warn : props.crit }
}

function move(event: PointerEvent) {
  if (!drag.value) return
  drag.value = { thumb: drag.value.thumb, value: clamp(drag.value.thumb, valueAt(event.clientX)) }
}

function release() {
  const done = drag.value
  drag.value = null
  if (!done) return
  const before = done.thumb === 'warn' ? props.warn : props.crit
  if (done.value !== before) {
    emit('change', {
      warn: done.thumb === 'warn' ? done.value : props.warn,
      crit: done.thumb === 'crit' ? done.value : props.crit,
    })
  }
}

function press(event: KeyboardEvent, thumb: 'warn' | 'crit') {
  const now = thumb === 'warn' ? props.warn : props.crit
  const steps: Record<string, number> = {
    ArrowRight: 1,
    ArrowUp: 1,
    ArrowLeft: -1,
    ArrowDown: -1,
    PageUp: 5,
    PageDown: -5,
  }
  let next: number
  if (event.key in steps) next = now + (steps[event.key] ?? 0)
  else if (event.key === 'Home') next = min
  else if (event.key === 'End') next = max
  else return
  event.preventDefault()
  const value = clamp(thumb, next)
  if (value === now) return
  emit('change', {
    warn: thumb === 'warn' ? value : props.warn,
    crit: thumb === 'crit' ? value : props.crit,
  })
}
</script>

<template>
  <div class="slider">
    <div ref="track" class="track" :style="{ background: bands }" />
    <span class="top warn" :style="{ left: `${pct(warn)}%` }">
      {{ t('settingsScan.disk.warn', { n: warn }) }}
    </span>
    <span class="bottom crit" :style="{ left: `${pct(crit)}%` }">
      {{ t('settingsScan.disk.crit', { n: crit }) }}
    </span>
    <span class="end mono low">{{ min }}%</span>
    <span class="end mono high">{{ max }}%</span>
    <span
      role="slider"
      tabindex="0"
      class="thumb warn"
      :style="{ left: `${pct(warn)}%` }"
      :aria-label="t('settingsScan.disk.warnName')"
      :aria-valuemin="min"
      :aria-valuemax="props.crit - 1"
      :aria-valuenow="warn"
      :aria-valuetext="`${warn}%`"
      @pointerdown="start($event, 'warn')"
      @pointermove="move"
      @pointerup="release"
      @pointercancel="release"
      @keydown="press($event, 'warn')"
    />
    <span
      role="slider"
      tabindex="0"
      class="thumb crit"
      :style="{ left: `${pct(crit)}%` }"
      :aria-label="t('settingsScan.disk.critName')"
      :aria-valuemin="props.warn + 1"
      :aria-valuemax="max"
      :aria-valuenow="crit"
      :aria-valuetext="`${crit}%`"
      @pointerdown="start($event, 'crit')"
      @pointermove="move"
      @pointerup="release"
      @pointercancel="release"
      @keydown="press($event, 'crit')"
    />
  </div>
</template>

<style scoped>
.slider {
  position: relative;
  height: 64px;
  margin: 4px 8px 0;
}

.track {
  position: absolute;
  inset: 28px 0 auto;
  height: 6px;
  border-radius: 3px;
}

.thumb {
  position: absolute;
  top: 22px;
  width: 18px;
  height: 18px;
  margin-left: -9px;
  border-radius: 50%;
  background: var(--surface-0);
  cursor: grab;
  touch-action: none;
  transition: box-shadow var(--dur-state) var(--ease-out);
}

.thumb.warn {
  box-shadow:
    0 0 0 2px var(--warn-solid),
    var(--shadow-knob);
}

.thumb.crit {
  box-shadow:
    0 0 0 2px var(--crit-solid),
    var(--shadow-knob);
}

.thumb:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--surface-0),
    var(--focus-ring);
}

.top,
.bottom {
  position: absolute;
  transform: translateX(-50%);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.top {
  top: 0;
}

.bottom {
  top: 48px;
}

.warn.top {
  color: var(--warn-ink);
}

.crit.bottom {
  color: var(--crit-ink);
}

.end {
  position: absolute;
  color: var(--ink-4);
  font-size: 10px;
}

.end.low {
  left: 0;
  top: 48px;
}

.end.high {
  right: 0;
  top: 0;
}
</style>
