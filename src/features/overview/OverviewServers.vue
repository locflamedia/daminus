<!--
  The servers strip (board "Overview · results"): a disk ring per host with load and memory.
  Servers never outrank the projects on this screen, so it sits below the cards. Hosts that do
  not answer fade and offer Retry; during a scan each cell follows its host.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ServerCell } from '@/lib/overview-servers'
import { serverScan } from '@/lib/overview-scan'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useScanStore } from '@/stores/scan'
import OverviewServerCell from './OverviewServerCell.vue'

defineProps<{ cells: readonly ServerCell[]; neutral: boolean }>()

const { t } = useI18n()
const scan = useScanStore()
const panel = useScanPanelStore()

/** Servers arrive after the cards, 60 ms apart. */
const delay = (i: number) => `${300 + i * 60}ms`
</script>

<template>
  <section class="servers" :aria-label="t('overviewScreen.servers.title')">
    <h2 class="head">
      {{ t('overviewScreen.servers.title') }}
      <span class="hint">{{ t('overviewScreen.servers.hint') }}</span>
    </h2>
    <div class="grid">
      <OverviewServerCell
        v-for="(cell, i) in cells"
        :key="cell.host"
        class="m-enter"
        :style="{ '--d': delay(i) }"
        :cell="cell"
        :scan="serverScan(cell.host, scan.run)"
        :neutral="neutral"
        @retry="panel.start({ projects: [], hosts: [cell.host] })"
      />
    </div>
  </section>
</template>

<style scoped>
.servers {
  display: flex;
  flex-direction: column;
  flex: none;
  gap: 10px;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: normal;
}

.hint {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

[data-range='narrow'] .grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
</style>
