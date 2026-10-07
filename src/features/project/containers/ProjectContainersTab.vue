<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNow } from '@/composables/use-now'
import UiTag from '@/ui/UiTag.vue'
import ProjectTabShell from '../common/ProjectTabShell.vue'
import ComposeSection from './ComposeSection.vue'
import ContainersSkeleton from './ContainersSkeleton.vue'
import ContainersTrouble from './ContainersTrouble.vue'
import Pm2Card from './Pm2Card.vue'
import { useContainersModel } from './use-containers-model'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const now = useNow()
const m = useContainersModel(toRef(props, 'id'))
</script>

<template>
  <ProjectTabShell
    :loading="m.loading.value"
    :status="m.state.value.status"
    :unreachable="m.state.value.unreachable"
    :stale-since="m.state.value.staleSince"
    group="containers"
    :empty-title="t('projectContainers.empty.title')"
    :empty-text="t('projectContainers.empty.text')"
  >
    <template #skeleton><ContainersSkeleton /></template>
    <ComposeSection
      v-for="c in m.composes.value"
      :key="`${c.item.key.host}${c.item.key.target}`"
      :section="c"
      :now="now"
      :cpu-of="m.cpuOf"
    />
    <section v-if="m.apps.value.length > 0" class="pm2">
      <div class="strip">
        <UiTag>
          {{ t('projectContainers.context.pm2') }}
          <b class="count">{{
            t('projectContainers.context.apps', { n: m.apps.value.length }, m.apps.value.length)
          }}</b>
        </UiTag>
        <span class="source">{{ t('projectContainers.context.sourcePm2') }}</span>
      </div>
      <div class="grid">
        <template v-for="(a, i) in m.apps.value" :key="`${a.item.key.host}${a.item.key.target}`">
          <Pm2Card v-if="a.view" :app="a.view" :now="now" :index="i" />
          <div v-else class="unknown">
            <b>{{
              t('projectContainers.unknownPm2.title', {
                name: a.item.key.target,
                host: a.item.key.host,
              })
            }}</b>
            <p>
              {{
                t(
                  `projectContainers.unknownPm2.${a.problem === 'needs_perm' || a.problem === 'missing' ? a.problem : 'other'}`,
                  { host: a.item.key.host },
                )
              }}
            </p>
          </div>
        </template>
      </div>
    </section>
    <ContainersTrouble
      v-if="m.trouble.value"
      :id="id"
      :host="m.trouble.value.section.item.key.host"
      :service="m.trouble.value.service"
      :memory="m.memory.value"
      :peak="m.memoryPeak.value"
      :also="m.also.value"
      :host-memory="m.hostMem.value"
    />
  </ProjectTabShell>
</template>

<style scoped>
.pm2 {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.strip {
  display: flex;
  align-items: center;
  gap: 10px;
}

.count {
  font-weight: var(--weight-medium);
}

.source {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.unknown {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
  font-size: var(--text-12);
}

.unknown p {
  margin: 4px 0 0;
  color: var(--ink-2);
}
</style>
