<script setup lang="ts">
import { computed } from 'vue'
import { ICON_PATHS, type IconName } from './icon-paths'

const props = withDefaults(
  defineProps<{
    name: IconName
    /** Rendered size in px; the drawing is always 16 x 16. */
    size?: number
    /** 1.5 for 16 px icons; 1.8 for the 12 px ones in chips and metric labels. */
    stroke?: number
  }>(),
  { size: 16, stroke: 1.5 },
)

const d = computed(() => ICON_PATHS[props.name])
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
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
