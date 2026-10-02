<!--
  The three window buttons the boards draw in the top-left corner of a sidebar or rail. The app
  has the real ones (an overlay title bar); a gallery frame has none, so it draws them.
-->
<script setup lang="ts">
defineProps<{ rail?: boolean }>()
</script>

<template>
  <span class="lights" :class="{ rail }" aria-hidden="true">
    <i class="close" /><i class="min" /><i class="zoom" />
  </span>
</template>

<style scoped>
.lights {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 5;
  display: flex;
  gap: var(--space-2);
  pointer-events: none;
}

.lights.rail {
  top: 16px;
  left: 50%;
  gap: 6px;
  transform: translateX(-50%);
}

i {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
}

.rail i {
  width: 10px;
  height: 10px;
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
