<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { ENV_KEYS } from '@/lib/project-database'
import ProjectCard from '../common/ProjectCard.vue'
import type { DbSection } from './use-database-model'

const props = defineProps<{ section: DbSection }>()
const { t } = useI18n()
const fmt = useFormat()

const view = computed(() => props.section.view)
const part = computed(() => props.section.part)
/** The query the script runs, abbreviated as on the board; the server's own text is never shown. */
const command = computed(() => {
  const postgres = view.value?.engine === 'postgres'
  const client = postgres ? 'psql -At -c "select …"' : 'mysql -N -e "select …"'
  return part.value?.container ? `docker exec ${part.value.container} ${client}` : client
})
const result = computed(() => {
  const size = view.value?.size
  if (size == null) return ''
  const text = fmt.measure(size, 'bytes').text
  return view.value?.tables != null
    ? t('projectDatabase.reads.result', { tables: view.value.tables, size: text })
    : t('projectDatabase.reads.resultSize', { size: text })
})
</script>

<template>
  <ProjectCard
    v-if="view && part"
    icon="shield"
    :title="t('projectDatabase.reads.title')"
    :meta="t('projectDatabase.reads.meta')"
    :gap="10"
  >
    <div class="code">
      <div>
        <span class="d">{{ t('projectDatabase.reads.env') }}</span> {{ part.env_file }}
        <span class="d">{{ t('projectDatabase.reads.arrow') }}</span
        >{{ ' ' }}
        <span class="k">{{ ENV_KEYS.join(' ') }}</span>
      </div>
      <div><span class="d">$</span> {{ command }}</div>
      <div class="ok">{{ result }}</div>
    </div>
    <span class="text">{{ t('projectDatabase.reads.text') }}</span>
  </ProjectCard>
</template>

<style scoped>
.code {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--code);
  color: var(--code-ink);
  font: 400 11px/1.65 var(--font-mono);
  overflow-wrap: anywhere;
}

.d {
  color: var(--code-dim);
}

.k {
  color: var(--code-key);
}

.ok {
  color: var(--code-ok);
}

.text {
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}
</style>
