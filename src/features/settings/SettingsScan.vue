<!--
  Settings › Scan: the six groups of checks, the folders to skip, the two limits, the thresholds
  that turn a number amber or red and, beside them, the exact commands a scan runs. Everything
  saves at once; there is no Save button.
-->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useScanSettingsStore } from '@/stores/scan-settings'
import ScanChecksCard from './ScanChecksCard.vue'
import ScanCommandsCard from './ScanCommandsCard.vue'
import ScanLimitsCard from './ScanLimitsCard.vue'
import ScanSkipCard from './ScanSkipCard.vue'
import ScanThresholdsCard from './ScanThresholdsCard.vue'

const store = useScanSettingsStore()

onMounted(() => void store.load())
</script>

<template>
  <div class="scan">
    <div class="layout">
      <div class="column">
        <ScanChecksCard />
        <ScanSkipCard />
        <ScanLimitsCard />
      </div>
      <div class="column">
        <ScanThresholdsCard />
        <ScanCommandsCard />
      </div>
    </div>
  </div>
</template>

<style scoped>
.scan {
  container-type: inline-size;
  min-width: 0;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--space-4);
  align-items: start;
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

@container (max-width: 640px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
