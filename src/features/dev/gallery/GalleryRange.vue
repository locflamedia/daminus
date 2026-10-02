<!-- Provides a window range to the shell components inside, so a section can draw them narrow. -->
<script setup lang="ts">
import { computed, provide } from 'vue'
import { LAYOUT_RANGE, type SidebarRange } from '@/lib/viewport'

const props = defineProps<{ range: SidebarRange }>()
provide(
  LAYOUT_RANGE,
  computed(() => props.range),
)
</script>

<template>
  <slot />
</template>
