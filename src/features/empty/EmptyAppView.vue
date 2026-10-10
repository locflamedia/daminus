<!--
  The first screen of an app with no project: one obvious way forward, a read-only preview of
  what Daminus will read from `~/.ssh/config`, and proof that nothing touches the servers.
  Shown when the config has hosts and the agent holds keys; otherwise `EmptyNoConfigView`
  takes its place.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useSetupStore } from '@/stores/setup'
import ConfigPreview from './components/ConfigPreview.vue'
import EmptyHero from './components/EmptyHero.vue'
import EmptyKeyboard from './components/EmptyKeyboard.vue'
import EmptyStack from './components/EmptyStack.vue'
import EmptySteps from './components/EmptySteps.vue'
import EmptyTrust from './components/EmptyTrust.vue'
import { previewRows, previewSkips } from './empty-state'

defineEmits<{ import: []; add: [] }>()

const setup = useSetupStore()
const rows = computed(() => previewRows(setup.entries))
const skips = computed(() => previewSkips(setup.skipped))
</script>

<template>
  <div class="empty-app">
    <div class="body">
      <div class="left">
        <EmptyHero @import="$emit('import')" @add="$emit('add')" />
        <EmptySteps />
      </div>
      <div class="right">
        <ConfigPreview :ready="setup.listing !== null" :rows="rows" :skips="skips" />
        <EmptyTrust />
      </div>
    </div>
    <footer class="foot">
      <EmptyStack />
      <EmptyKeyboard class="keys" />
    </footer>
  </div>
</template>

<style scoped>
.empty-app {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: var(--space-6);
  min-width: 0;
}

.body,
.foot {
  display: grid;
  /* The preview keeps 520 at 1440 and gives way down to 480 at 1280, so the two buttons and
     the step cards keep the board's row (board 01). */
  grid-template-columns: minmax(0, 1fr) clamp(480px, 50%, 520px);
  gap: var(--space-10);
}

.body {
  align-items: start;
  padding-top: var(--space-4);
}

.left {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  min-width: 0;
  padding-top: var(--space-2);
}

.right {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.foot {
  margin-top: auto;
  padding-top: var(--space-1);
}

.keys {
  align-self: end;
}

@media (max-width: 1100px) {
  .body,
  .foot {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
