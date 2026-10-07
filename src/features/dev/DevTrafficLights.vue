<!--
  Development only: in a plain browser there is no native title bar, so the three window
  buttons the overlay title bar puts at x 16, y 18 are drawn here, where the boards draw them.
  Inside a Tauri window the real ones are there and this draws nothing.
-->
<script setup lang="ts">
const native = 'isTauri' in globalThis
</script>

<template>
  <div v-if="!native" class="lights" aria-hidden="true">
    <span class="close" /><span class="min" /><span class="zoom" />
  </div>
</template>

<style scoped>
.lights {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 60;
  display: flex;
  gap: var(--space-2);
  pointer-events: none;
}

.lights span {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
}

.close {
  background: var(--traffic-close);
}

.min {
  background: var(--traffic-min);
}

.zoom {
  background: var(--traffic-zoom);
}
</style>
