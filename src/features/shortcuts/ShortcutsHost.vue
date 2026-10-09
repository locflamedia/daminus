<!-- Mounts the shortcuts sheet once for the window and registers the keys that work anywhere. -->
<script setup lang="ts">
import ShortcutsSheet from './ShortcutsSheet.vue'
import { useShortcuts } from './use-shortcuts'
import { useShortcutsStore } from './shortcuts-store'

const store = useShortcutsStore()
useShortcuts()
</script>

<template>
  <div class="frame"><ShortcutsSheet :open="store.open" @close="store.close()" /></div>
</template>

<style scoped>
/* The sheet fills its nearest positioned ancestor; this one is the whole window and lets
   presses through while the sheet is closed. */
.frame {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}

.frame > :deep(*) {
  pointer-events: auto;
}
</style>
