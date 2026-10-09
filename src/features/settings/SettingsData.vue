<!--
  Settings › Data: where Daminus keeps things, how much, for how long, and a way out: export,
  or a delete you have to mean. The numbers come from the core (`data_usage`), the limits from
  `settings.json`.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import DataReveal from './DataReveal.vue'
import DataBackupsCard from './DataBackupsCard.vue'
import DataExportCard from './DataExportCard.vue'
import DataHistoryCard from './DataHistoryCard.vue'
import DataSizeCard from './DataSizeCard.vue'
import DataStartOverCard from './DataStartOverCard.vue'
import DataStorageCard from './DataStorageCard.vue'
import DataStoredCard from './DataStoredCard.vue'

const data = useDataStore()

// The header that holds the target is drawn with this view, so the button waits for the mount.
const ready = ref(false)

onMounted(() => {
  ready.value = true
  void data.load()
})
</script>

<template>
  <Teleport v-if="ready" to="#settings-actions"><DataReveal /></Teleport>
  <div class="data">
    <div class="layout">
      <div class="column">
        <DataStorageCard />
        <DataHistoryCard />
        <DataStoredCard />
        <DataSizeCard />
      </div>
      <div class="column">
        <DataExportCard />
        <DataBackupsCard />
        <DataStartOverCard />
      </div>
    </div>
  </div>
</template>

<style scoped>
.data {
  container-type: inline-size;
  min-width: 0;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: var(--space-4);
  align-items: stretch;
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

/* Under 860 px of content the right column goes under the left one. */
@container (max-width: 860px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
