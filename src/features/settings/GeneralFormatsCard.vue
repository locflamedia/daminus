<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatClock, formatDate } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'
import SettingsCard from './SettingsCard.vue'

const { t } = useI18n()
const settings = useSettingsStore()

/** The sample the board uses: 1,240.5 MB, 26 Sep 2026, 13:42, two hours earlier. */
const SAMPLE = new Date(2026, 8, 26, 13, 42)

const rows = computed(() => {
  const locale = settings.language
  const day = formatDate(SAMPLE, locale)
  return [
    {
      key: 'numbers',
      value: `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(1240.5)} MB`,
    },
    {
      key: 'dates',
      value: locale === 'en' ? `${day} 2026` : `${day}/2026`,
    },
    { key: 'time', value: formatClock(SAMPLE, locale) },
    {
      key: 'relative',
      value: t('settingsGeneral.formats.hoursAgo', { n: 2 }, { plural: 2, locale }),
    },
  ]
})
</script>

<template>
  <SettingsCard
    :title="t('settingsGeneral.formats.title')"
    :remark="t('settingsGeneral.formats.follow')"
  >
    <dl class="list">
      <div v-for="row in rows" :key="row.key" class="line">
        <dt>{{ t(`settingsGeneral.formats.${row.key}`) }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
  </SettingsCard>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
}

.line {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--surface-1);
  font-size: var(--text-12);
}

dt {
  color: var(--ink-3);
}

dd {
  margin: 0;
  font-family: var(--font-mono);
}
</style>
