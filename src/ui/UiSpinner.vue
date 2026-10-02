<!--
  The scan's one loop: a quarter arc turning on a faint ring. It takes the colour of the text
  around it. With Reduce Motion it stops turning and stays as a still arc.
-->
<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 14 })
</script>

<template>
  <svg
    class="spinner m-spin"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke-width="2"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6" stroke="currentColor" opacity="0.25" />
    <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.spinner {
  flex: none;
}
</style>
