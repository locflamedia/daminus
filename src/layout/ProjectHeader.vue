<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { Level } from '@/api'
import UiIcon from '@/ui/UiIcon.vue'
import ProjectDot from './ProjectDot.vue'
import { PROJECT_TABS, type ProjectTab } from './project-tabs'

const props = defineProps<{
  id: string
  /** Where it lives and when it was last read, e.g. `tiemtra.vn · vps-sg-1 · scan #12, 13:42`. */
  meta?: string
  tab: ProjectTab
  level?: Level
  /** Tabs with something inside that needs a look get a 6 px status dot. */
  tabLevels?: Partial<Record<ProjectTab, Level>>
}>()

const { t } = useI18n()
const dots = computed(() => props.tabLevels ?? {})
</script>

<template>
  <header class="project-header">
    <span class="tile" aria-hidden="true">
      <ProjectDot :level="level ?? 'ok'" />
    </span>
    <div class="titles">
      <RouterLink to="/" class="crumb">
        {{ t('project.breadcrumb') }}
        <UiIcon name="chevron-right" :size="12" />
      </RouterLink>
      <span class="line">
        <b class="name">{{ id }}</b>
        <span v-if="meta" class="meta">{{ meta }}</span>
      </span>
    </div>
    <span class="grow" />
    <div class="tabs" role="tablist" :aria-label="t('project.tabsLabel')">
      <RouterLink
        v-for="name in PROJECT_TABS"
        :key="name"
        :to="{ name: 'project', params: { id, tab: name } }"
        class="tab"
        :class="{ on: name === tab }"
        role="tab"
        :aria-selected="name === tab"
      >
        {{ t(`project.tabs.${name}`) }}
        <span
          v-if="dots[name] === 'warn' || dots[name] === 'crit'"
          class="mark"
          :class="dots[name]"
          :title="t('project.needsLook')"
        />
      </RouterLink>
    </div>
    <slot name="actions" />
  </header>
</template>

<style scoped>
.project-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
  height: 72px;
}

.tile {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.3;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.crumb .icon {
  color: var(--ink-4);
}

.line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  white-space: nowrap;
}

.name {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
}

.meta {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-12);
  text-overflow: ellipsis;
}

.grow {
  flex-grow: 1;
}

.tabs {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  gap: 2px;
  height: var(--h-control);
  padding: 3px;
  border-radius: var(--radius-sm);
  background: var(--seg-track);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 var(--space-3);
  border-radius: 7px;
  color: var(--ink-3);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  transition:
    background-color var(--dur-slide) var(--ease-out),
    color var(--dur-color) var(--ease-state);
}

.tab.on {
  background: var(--surface-0);
  color: var(--ink);
  box-shadow: var(--shadow-seg);
}

.mark {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
}

.mark.warn {
  background: var(--warn-solid);
}

.mark.crit {
  background: var(--crit-solid);
}
</style>
