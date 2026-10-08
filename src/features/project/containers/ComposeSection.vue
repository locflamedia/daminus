<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { imagesOf, isSafeName, type ServiceView } from '@/lib/project-containers'
import { useLayoutRange } from '@/lib/viewport'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiTag from '@/ui/UiTag.vue'
import ProjectPermissionCard, { type PermissionStep } from '../common/ProjectPermissionCard.vue'
import ServiceCard from './ServiceCard.vue'
import type { ComposeSection } from './use-containers-model'

const props = defineProps<{
  section: ComposeSection
  now: number
  cpuOf: (c: ComposeSection, s: ServiceView) => number[]
}>()

const { t, te } = useI18n()
const range = useLayoutRange()
const host = computed(() => props.section.item.key.host)
const name = computed(() => props.section.item.key.target)
const view = computed(() => props.section.view)
const images = computed(() => imagesOf(view.value?.services ?? []))

const steps = computed<PermissionStep[]>(() => {
  const h = host.value
  const safe = isSafeName(h)
  return [
    {
      title: t('projectContainers.perm.tryTitle'),
      command: safe ? `ssh ${h} "docker ps"` : null,
    },
    {
      title: t('projectContainers.perm.fixTitle'),
      text: t('projectContainers.perm.fixText'),
      command: 'sudo usermod -aG docker SSH_USER',
    },
  ]
})
const reason = computed(() => props.section.problem ?? 'other')
</script>

<template>
  <section class="section">
    <ProjectPermissionCard
      v-if="reason === 'needs_perm'"
      :title="t('projectContainers.perm.title', { host })"
      :text="t('projectContainers.perm.text')"
      :steps="steps"
      :note="t('projectContainers.perm.again')"
      :host="host"
    />
    <div v-else-if="section.problem" class="unknown">
      <b>{{ t('projectContainers.unknown.title', { name, host }) }}</b>
      <p>
        {{
          te(`projectContainers.unknown.${reason}`)
            ? t(`projectContainers.unknown.${reason}`, { host })
            : t('projectContainers.unknown.unreachable')
        }}
      </p>
    </div>
    <template v-else-if="view">
      <div class="strip">
        <UiTag>
          <UiBrandMark name="docker" :size="14"><UiIcon name="container" :size="12" /></UiBrandMark>
          {{ t('projectContainers.context.compose') }} <b class="mono">{{ name }}</b>
        </UiTag>
        <UiTag v-if="images[0]">
          {{ t('projectContainers.context.image') }} <span class="mono">{{ images[0] }}</span>
          <template v-if="section.imageSeq !== null">
            · {{ t('projectContainers.context.updated', { seq: section.imageSeq }) }}
          </template>
        </UiTag>
        <UiTag>
          {{
            t(
              'projectContainers.context.services',
              { n: view.containers, up: view.running },
              view.containers,
            )
          }}
        </UiTag>
        <span class="source">{{ t('projectContainers.context.source') }}</span>
      </div>
      <div class="grid" :class="{ one: range === 'narrow' }">
        <ServiceCard
          v-for="(s, i) in view.services"
          :key="s.name"
          :service="s"
          :cpu="cpuOf(section, s)"
          :now="now"
          :index="i"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.strip :deep(.tag) {
  height: 26px;
  padding: 0 10px;
}

.mono {
  font-family: var(--font-mono);
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

.grid.one {
  grid-template-columns: minmax(0, 1fr);
}

.unknown {
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
  font-size: var(--text-12);
}

.unknown p {
  margin: 4px 0 0;
  color: var(--ink-2);
}
</style>
