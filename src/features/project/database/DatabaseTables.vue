<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { useResultsAged } from '../common/results-aged'
import type { DbSection } from './use-database-model'
import MysqlNote from './MysqlNote.vue'
import ProjectCard from '../common/ProjectCard.vue'

const props = defineProps<{ section: DbSection }>()
const { t } = useI18n()
const fmt = useFormat()

const mysql = computed(() => props.section.view?.engine === 'mysql')
const meta = computed(() => {
  const seq = props.section.prevSeq
  if (seq === null) return t('projectDatabase.largest.metaFirst')
  return t(
    mysql.value ? 'projectDatabase.largest.metaMysql' : 'projectDatabase.largest.metaPostgres',
    { seq },
  )
})
const aged = useResultsAged()
const deltaText = (d: number | null) =>
  d === null || aged.value
    ? ''
    : d === 0
      ? t('projectDatabase.largest.same')
      : fmt.delta(d, 'bytes').text
</script>

<template>
  <ProjectCard icon="database" :title="t('projectDatabase.largest.title')" :meta="meta" :gap="6">
    <MysqlNote v-if="mysql" />
    <ul
      v-if="section.rows.length > 0"
      class="rows"
      :aria-label="t('projectDatabase.largest.label')"
    >
      <li v-for="(r, i) in section.rows" :key="r.name" class="row">
        <span class="name">{{ r.name }}</span>
        <div class="bar">
          <i
            class="fill m-grow"
            :class="{ hot: !aged && r.name === section.grower }"
            :style="{ width: `${Math.max(2, r.share * 100)}%`, '--d': `${i * 60}ms` }"
          />
        </div>
        <b class="size">{{ fmt.measure(r.bytes, 'bytes').text }}</b>
        <span class="delta" :class="{ hot: (r.delta ?? 0) > 0 && r.name === section.grower }">
          {{ deltaText(r.delta) }}
        </span>
      </li>
    </ul>
    <p v-else class="none">{{ t('projectDatabase.largest.none') }}</p>
  </ProjectCard>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) 72px 72px;
  align-items: center;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.name,
.size,
.delta {
  font-family: var(--font-mono);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size,
.delta {
  text-align: right;
}

.size {
  font-weight: var(--weight-medium);
}

.delta {
  color: var(--ink-3);
}

.delta.hot {
  color: var(--warn-ink);
}

.bar {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--surface-2);
}

.fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 3px;
  background: var(--chart-lilac);
  transform-origin: left;
}

.fill.hot {
  background: var(--chart-amber);
}

.none {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
