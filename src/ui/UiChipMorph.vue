<!--
  Chip morph, from the board "Motion": the chip of a project's state changes ("Scanning" to
  "Needs a look") by growing or shrinking its width and changing its fill in 250 ms while the
  two labels cross-fade in 200 ms. It looks like `UiChip`; use it where a chip's word changes
  in place. The first draw sets the width without animating, and Reduce Motion keeps the
  fade but drops the width change. A hidden copy of the label measures the natural width.
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiIcon from './UiIcon.vue'
import UiSpinner from './UiSpinner.vue'
import type { ChipTone } from './UiChip.vue'
import type { IconName } from './icon-paths'

const props = withDefaults(
  defineProps<{
    tone?: ChipTone
    icon?: IconName
    busy?: boolean
    label: string
    /** A 6 px dot in the tone's solid colour, hollow for the neutral tone. */
    dot?: boolean
    /** The critical halo on the dot: three pulses, then still. */
    pulse?: boolean
    /** The 24 px chip of a project card head, with 10 px of padding. */
    large?: boolean
  }>(),
  { tone: 'neutral', icon: undefined, busy: false, dot: false, pulse: false, large: false },
)

const sizer = ref<HTMLElement>()
const width = ref<number>()
const ready = ref(false)

function measure() {
  const w = sizer.value?.offsetWidth
  if (w) width.value = w
}

let watcher: ResizeObserver | undefined

onMounted(async () => {
  measure()
  // The label is measured again when its size changes without the label changing: the web
  // font arriving after the first draw widens the word, and a width taken from the fallback
  // font would cut it ("2 critic…").
  if (sizer.value && typeof ResizeObserver !== 'undefined') {
    watcher = new ResizeObserver(measure)
    watcher.observe(sizer.value)
  }
  await nextTick()
  ready.value = true
})

onBeforeUnmount(() => watcher?.disconnect())

watch(
  () => [props.label, props.icon, props.busy, props.dot],
  () => nextTick(measure),
)
</script>

<template>
  <span
    class="chip"
    :class="[`chip-${tone}`, { ready, large }]"
    :style="width ? { width: `${width}px` } : undefined"
  >
    <span ref="sizer" class="sizer" aria-hidden="true">
      <span v-if="dot && !busy" class="lead" :class="{ 'm-halo': pulse && tone === 'crit' }" />
      <UiSpinner v-if="busy" :size="12" />
      <UiIcon v-else-if="icon" :name="icon" :size="12" /><span class="word">{{ label }}</span>
    </span>
    <Transition name="face">
      <span :key="`${label}|${icon ?? ''}|${busy}|${dot}`" class="face">
        <span v-if="dot && !busy" class="lead" :class="{ 'm-halo': pulse && tone === 'crit' }" />
        <UiSpinner v-if="busy" :size="12" />
        <UiIcon v-else-if="icon" :name="icon" :size="12" /><span class="word">{{ label }}</span>
      </span>
    </Transition>
  </span>
</template>

<style scoped>
.chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  height: var(--h-chip);
  overflow: hidden;
  border-radius: var(--radius-full);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
}

.chip.ready {
  transition:
    width var(--dur-slide) var(--ease-out),
    background-color var(--dur-slide) var(--ease-out),
    color var(--dur-slide) var(--ease-out);
}

.sizer,
.face {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
}

/* The measuring copy takes no space of its own: the chip's width is the measured one. */
.sizer {
  position: absolute;
  left: 0;
  width: max-content;
  max-width: none;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}

/* The measuring copy is never squeezed: it reports the whole word. */
.sizer .word {
  overflow: visible;
  text-overflow: clip;
}

/* A chip squeezed by its row (the card head) cuts the word, not the dot. */
.face {
  max-width: 100%;
  min-width: 0;
}

.word {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Tall enough for stacked Vietnamese marks (Ổ), which line-height 1 would cut. */
  line-height: 1.4;
}

/* The large chip of a card head: 24 tall, 10 of padding, 6 between the dot and the word. */
.large {
  height: 24px;
}

.large .sizer,
.large .face {
  gap: 6px;
  padding: 0 10px;
}

.lead {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentcolor;
}

.chip-crit .lead {
  background: var(--crit-solid);
}

.chip-warn .lead {
  background: var(--warn-solid);
}

.chip-ok .lead {
  background: var(--ok-solid);
}

.chip-neutral .lead {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
}

.face {
  position: absolute;
  left: 0;
  height: 100%;
}

.face-enter-active,
.face-leave-active {
  transition:
    opacity var(--dur-state) var(--ease-state),
    filter var(--dur-state) var(--ease-state);
}

.face-enter-from,
.face-leave-to {
  opacity: 0;
  filter: blur(2px);
}

@media (prefers-reduced-motion: reduce) {
  .face-enter-from,
  .face-leave-to {
    filter: none;
  }
}

.chip-ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.chip-warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.chip-crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.chip-info {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.chip-neutral {
  background: var(--surface-1);
  color: var(--ink-3);
}

.chip-plain {
  background: var(--surface-0);
  color: var(--ink-3);
}

.chip-plain-ok {
  background: var(--surface-0);
  color: var(--ok-ink);
}
</style>
