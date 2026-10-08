<!--
  "Snapshots", from the board "Project · History": how many scans are kept out of the limit in
  Settings and what they weigh, with one cell per kept slot. It sits in the sidebar on a
  project's History tab only, so history never grows silently. Read from the history store.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { snapshotsCard } from '@/lib/history-snapshots'
import { useHistoryStore } from '@/stores/history'

const { t } = useI18n()
const fmt = useFormat()
const history = useHistoryStore()

const card = computed(() => snapshotsCard(history.view))
const text = computed(() => {
  const c = card.value
  if (!c) return ''
  const size = fmt.measure(c.bytes, 'bytes').text
  return c.keep === null
    ? t('projectHistory.snapshots.keptAll', { n: c.kept, size })
    : t('projectHistory.snapshots.kept', { n: c.kept, keep: c.keep, size })
})
const bar = computed(() =>
  card.value && card.value.keep !== null
    ? t('projectHistory.snapshots.bar', { n: card.value.kept, keep: card.value.keep })
    : '',
)
</script>

<template>
  <section v-if="card" class="snapshots" :aria-label="t('projectHistory.snapshots.title')">
    <b class="title">{{ t('projectHistory.snapshots.title') }}</b>
    <span class="text">{{ text }}</span>
    <div v-if="card.cells > 0" class="cells" role="img" :aria-label="bar">
      <i v-for="n in card.cells" :key="n" :class="{ on: n <= card.on }" />
    </div>
  </section>
</template>

<style scoped>
.snapshots {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-3);
  border-radius: 14px;
  background: var(--side-card);
}

.title {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.text {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

.cells {
  display: flex;
  gap: 2px;
  height: 6px;
}

.cells i {
  flex: 1;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}

.cells i.on {
  background: var(--accent);
}
</style>
