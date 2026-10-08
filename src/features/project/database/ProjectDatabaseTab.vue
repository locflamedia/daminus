<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectTabShell from '../common/ProjectTabShell.vue'
import DatabaseCurve from './DatabaseCurve.vue'
import DatabaseFacts from './DatabaseFacts.vue'
import DatabaseProblem from './DatabaseProblem.vue'
import DatabaseReads from './DatabaseReads.vue'
import DatabaseSkeleton from './DatabaseSkeleton.vue'
import DatabaseTables from './DatabaseTables.vue'
import { useDatabaseModel } from './use-database-model'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const m = useDatabaseModel(toRef(props, 'id'))
</script>

<template>
  <ProjectTabShell
    :loading="m.loading.value"
    :status="m.state.value.status"
    :unreachable="m.state.value.unreachable"
    :stale-since="m.state.value.staleSince"
    group="databases"
    :empty-title="t('projectDatabase.empty.title')"
    :empty-text="t('projectDatabase.empty.text')"
  >
    <template #skeleton><DatabaseSkeleton /></template>
    <section
      v-for="s in m.sections.value"
      :key="`${s.item.key.host}${s.item.key.target}`"
      class="db"
    >
      <DatabaseProblem v-if="s.problem" :section="s" />
      <template v-else-if="s.view">
        <DatabaseFacts :section="s" />
        <div class="two">
          <DatabaseTables :section="s" />
          <DatabaseCurve :section="s" :loading="m.curveLoading.value" />
        </div>
        <DatabaseReads :section="s" />
      </template>
    </section>
  </ProjectTabShell>
</template>

<style scoped>
.db {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: var(--space-3);
  align-items: stretch;
}

@media (max-width: 1079px) {
  .two {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
