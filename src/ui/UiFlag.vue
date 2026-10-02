<script setup lang="ts">
import { FLAGS, type FlagCode } from './flags'

defineProps<{ code: FlagCode }>()
</script>

<template>
  <svg class="flag" width="20" height="15" viewBox="0 0 20 15" aria-hidden="true">
    <template v-for="(part, index) in FLAGS[code].parts" :key="index">
      <rect
        v-if="part.kind === 'rect'"
        :x="part.x"
        :y="part.y"
        :width="part.w"
        :height="part.h"
        :fill="part.fill"
      />
      <circle
        v-else-if="part.kind === 'circle'"
        :cx="part.cx"
        :cy="part.cy"
        :r="part.r"
        :fill="part.fill"
      />
      <polygon v-else-if="part.kind === 'poly'" :points="part.points" :fill="part.fill" />
      <path
        v-else
        :d="part.d"
        :fill="part.fill ?? 'none'"
        :stroke="part.stroke"
        :stroke-width="part.width"
      />
    </template>
  </svg>
</template>

<style scoped>
.flag {
  flex: none;
  overflow: hidden;
  border-radius: 3px;
  /* A hairline of ink keeps a white flag from dissolving into a white row. */
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent);
}
</style>
