<!--
  One line of "What Daminus found on this Mac": a tile, the name in mono, what it found in a
  sentence, and one chip. A row that was a problem and is now fine flashes green once and its
  chip changes with it; the Termius row is neutral grey, a promise and not a problem.
-->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { BrandName } from '@/ui/brand-marks'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiChip from '@/ui/UiChip.vue'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'

const props = defineProps<{
  icon: IconName
  /** The owner's mark, drawn in place of the icon when the row names an app (Termius). */
  brand?: BrandName
  name: string
  sub: string
  chip: string
  tone: 'ok' | 'warn' | 'neutral'
}>()

/** Long enough for the green wash and the chip to read as one change. */
const FLASH_MS = 1400
const flashing = ref(false)
let timer: number | undefined

watch(
  () => props.tone,
  (now, before) => {
    if (before !== 'warn' || now !== 'ok') return
    flashing.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (flashing.value = false), FLASH_MS)
  },
)
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <li class="row" :class="{ flash: flashing }">
    <span class="tile">
      <UiBrandMark :name="brand ?? null" :size="14"><UiIcon :name="icon" :size="14" /></UiBrandMark>
    </span>
    <div class="text">
      <span class="mono name">{{ name }}</span>
      <span class="sub">{{ sub }}</span>
    </div>
    <UiChip
      :key="tone"
      class="chip"
      :class="{ 'm-reveal': flashing }"
      :tone="tone"
      :icon="tone === 'ok' ? 'check' : undefined"
    >
      {{ chip }}
    </UiChip>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  min-height: 48px;
  padding: 0 10px;
  border-radius: 12px;
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.tile {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--surface-0);
  box-shadow: var(--shadow-node);
  color: var(--ink-2);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.name {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.sub {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.4;
}

.row > .chip {
  align-self: center;
}

.flash {
  animation: wash 1400ms var(--ease-out) 1;
}

@keyframes wash {
  30% {
    background: var(--ok-soft);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flash {
    animation: none;
  }
}
</style>
