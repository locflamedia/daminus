<!--
  Share bar of the zebra list (a table's size against the largest): 4 px, full radius, under
  the name. The growing item is amber, the rest accent-mid. On a grey zebra row the track
  flips to white so it stays visible. Decorative: the size is written in the row itself.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { barWidth } from '@/lib/chart-bands'

const props = withDefaults(
  defineProps<{ pct: number; tone?: 'accent' | 'grow'; onGrey?: boolean }>(),
  { tone: 'accent', onGrey: false },
)

const width = computed(() => barWidth(props.pct))
</script>

<template>
  <span class="share" :class="[`tone-${tone}`, { 'on-grey': onGrey }]" aria-hidden="true">
    <i class="fill" :style="{ width: `${width}%` }" />
  </span>
</template>

<style scoped>
.share {
  display: block;
  overflow: hidden;
  height: 4px;
  border-radius: 4px;
  background: var(--surface-2);
}

.on-grey {
  background: var(--surface-0);
}

.fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--accent-mid);
  transition: width var(--dur-tween) var(--ease-out);
}

.tone-grow .fill {
  background: var(--warn-solid);
}
</style>
