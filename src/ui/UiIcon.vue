<script setup lang="ts">
import { computed } from 'vue'
import { ICON_PATHS, strokeForSize, type IconName } from './icon-paths'

const props = withDefaults(
  defineProps<{
    name: IconName
    /** Rendered size in px; the drawing is always 16 x 16. */
    size?: number
    /** Overrides the stroke the size calls for (ticks and glyphs drawn heavier). */
    stroke?: number
    /** The dashed form of a ring: "not set up". */
    dashed?: boolean
  }>(),
  { size: 16, stroke: undefined, dashed: false },
)

const d = computed(() => ICON_PATHS[props.name])
const width = computed(() => props.stroke ?? strokeForSize(props.size))
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    :stroke-width="width"
    :stroke-dasharray="dashed ? '2 2' : undefined"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="d" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
}
</style>
