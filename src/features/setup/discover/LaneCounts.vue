<!--
  The counts of one host by kind, live: sites, compose projects, pm2 apps, databases, `.env`
  files and listening ports. A kind with nothing found is dim, not hidden, so a missing kind
  is visible. Each number rolls once when it changes.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { HostCounts } from '@/lib/discover-view'
import UiRoll from '@/ui/UiRoll.vue'

defineProps<{ host: string; counts: HostCounts }>()

const { t } = useI18n()
const KINDS = ['sites', 'compose', 'pm2', 'databases', 'env', 'ports'] as const
</script>

<template>
  <ul class="counts" :aria-label="t('setupDiscover.counts.label', { host })">
    <li v-for="kind in KINDS" :key="kind" :class="{ zero: counts[kind] === 0 }">
      <b><UiRoll :text="String(counts[kind])" /></b>
      {{ t(`setupDiscover.counts.${kind}`, counts[kind]) }}
    </li>
  </ul>
</template>

<style scoped>
.counts {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--space-3);
  margin: 0;
  padding: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  list-style: none;
}

li {
  display: inline-flex;
  gap: var(--space-1);
  white-space: nowrap;
}

b {
  color: var(--ink-2);
  font-weight: var(--weight-medium);
}

.zero,
.zero b {
  color: var(--ink-4);
}
</style>
