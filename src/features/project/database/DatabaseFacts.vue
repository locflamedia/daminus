<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { useResultsAged } from '../common/results-aged'
import { vEnter } from '@/lib/motion'
import type { DbSection } from './use-database-model'
import MysqlNote from './MysqlNote.vue'

const props = defineProps<{ section: DbSection }>()
const { t, te } = useI18n()
const fmt = useFormat()

const view = computed(() => props.section.view)
const engine = computed(() =>
  te(`projectDatabase.engine.${view.value?.engine}`)
    ? t(`projectDatabase.engine.${view.value?.engine}`)
    : t('projectDatabase.engine.other'),
)
const where = computed(() =>
  props.section.part?.container
    ? t('projectDatabase.engine.container', { name: props.section.part.container })
    : t('projectDatabase.engine.host', { host: props.section.item.key.host }),
)
const aged = useResultsAged()
const grew = computed(() => (props.section.delta ?? 0) > 0)
</script>

<template>
  <div v-if="view" class="facts">
    <div v-enter class="card" :style="{ '--d': '0ms' }">
      <span class="label">{{ t('projectDatabase.engine.label') }}</span>
      <b class="value">{{ engine }}</b>
      <span class="sub">{{ where }}</span>
    </div>
    <div v-enter class="card" :style="{ '--d': '60ms' }">
      <span class="label">{{ t('projectDatabase.size.label') }}</span>
      <b class="value">{{ view.size === null ? '—' : fmt.measure(view.size, 'bytes').text }}</b>
      <span v-if="!aged" class="sub" :class="{ warn: grew }">
        {{
          section.delta !== null && section.prevSeq !== null
            ? t('projectDatabase.size.since', {
                delta: section.delta === 0 ? '0' : fmt.delta(section.delta, 'bytes').text,
                seq: section.prevSeq,
              })
            : t('projectDatabase.size.first')
        }}
      </span>
      <MysqlNote v-if="view.engine === 'mysql'" />
    </div>
    <div v-enter class="card" :style="{ '--d': '120ms' }">
      <span class="label">{{ t('projectDatabase.tables.label') }}</span>
      <b class="value">{{ view.tables ?? '—' }}</b>
      <span class="sub">
        {{ view.top[0] ? t('projectDatabase.tables.largest', { name: view.top[0].name }) : '' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 14px var(--space-4);
  line-height: normal;
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.label {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.value {
  font-size: 22px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.02em;
}

.sub {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.sub.warn {
  color: var(--warn-ink);
}
</style>
