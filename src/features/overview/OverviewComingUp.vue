<!--
  "Coming up" (board "Overview · results"): a short list of what the next days hold, taken from
  what the scans saved: a disk that fills, an expected rule that wants a review, a certificate
  that expires, a host that has gone quiet. After a long absence it says "as of" the scan day.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import type { UpcomingRow } from './overview-list-text'

const props = defineProps<{
  rows: readonly UpcomingRow[]
  /** The day of the scan, when the results are old. */
  asOf: string | null
}>()

const { t } = useI18n()
const settings = useSettingsStore()

const title = computed(() => {
  if (!props.asOf) return t('overviewScreen.coming.title')
  const day = new Intl.DateTimeFormat(settings.language === 'en' ? 'en-US' : settings.language, {
    weekday: 'long',
  }).format(new Date(props.asOf))
  return t('overviewScreen.coming.titleOld', { day })
})
</script>

<template>
  <section class="coming">
    <h2>{{ title }}</h2>
    <ul v-if="rows.length > 0" class="list">
      <li v-for="row in rows" :key="row.id" class="row" :class="`tone-${row.tone}`">
        <span class="dot" aria-hidden="true" />
        <span class="text" :title="row.text">{{ row.text }}</span>
        <span class="value">{{ row.value }}</span>
      </li>
    </ul>
    <p v-else class="empty">{{ t('overviewScreen.coming.empty') }}</p>
  </section>
</template>

<style scoped>
.coming {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
}

h2 {
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: normal;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  font-size: var(--text-12);
}

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-3);
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.tone-warn .dot {
  background: var(--warn-ink);
}

.tone-warn .value {
  color: var(--warn-ink);
}

.tone-info .dot {
  background: var(--accent-ink);
}

.tone-info .value {
  color: var(--accent-ink);
}

.empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
