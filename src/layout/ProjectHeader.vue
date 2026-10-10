<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import type { Level } from '@/api'
import AskAiButton from '@/features/ai/ask/AskAiButton.vue'
import { draftFromProject } from '@/lib/setup-model'
import { useViewportWidth } from '@/lib/viewport'
import { useProjectSheetStore } from '@/stores/project-sheet'
import { useProjectsStore } from '@/stores/projects'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu from '@/ui/UiMenu.vue'
import ProjectTile from './ProjectTile.vue'
import { PROJECT_TABS, type ProjectTab } from './project-tabs'

const props = defineProps<{
  id: string
  /** Where it lives, e.g. `tiemtra.vn · vps-sg-1 + vps-sg-2`; cut first when the row is short. */
  meta?: string
  /** When it was last read, e.g. `scan #12, 13:42`; always shown whole. */
  scan?: string
  tab: ProjectTab
  level?: Level
  /** The project's own colour, `#rrggbb`, already checked. */
  color?: string | null
  /** Tabs with something inside that needs a look get a 6 px status dot. */
  tabLevels?: Partial<Record<ProjectTab, Level>>
}>()

const { t } = useI18n()
const router = useRouter()
const dots = computed(() => props.tabLevels ?? {})

// "Edit" opens the project sheet on the saved project; it waits for `projects.json` to be read.
const projects = useProjectsStore()
const sheet = useProjectSheetStore()
const saved = computed(() => projects.details.find((p) => p.id === props.id))
function edit() {
  if (saved.value) sheet.open({ draft: draftFromProject(saved.value), mode: 'saved' })
}

// "Tabs become a menu under 960 in project pages" (board "Narrow window"): the same tabs, in
// a menu opened from a button that names the current one.
const MENU_BELOW = 960
const width = useViewportWidth()
const asMenu = computed(() => width.value < MENU_BELOW)
const items = computed(() =>
  PROJECT_TABS.map((name, i) => ({
    id: name,
    label: t(`project.tabs.${name}`),
    checked: name === props.tab,
    mark: dotOf(name),
    markLabel: t('project.needsLook'),
    hint: `⌘${i + 1}`,
  })),
)

function dotOf(name: ProjectTab): 'warn' | 'crit' | undefined {
  const level = dots.value[name]
  return level === 'warn' || level === 'crit' ? level : undefined
}

function pick(id: string) {
  void router.push({ name: 'project', params: { id: props.id, tab: id } })
}

// ⌘1 to ⌘6 open the tabs in order, whether they are drawn as a strip or as the menu.
function onKeydown(e: KeyboardEvent) {
  if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
  const tab = PROJECT_TABS[Number(e.key) - 1]
  if (!tab) return
  e.preventDefault()
  pick(tab)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header class="project-header">
    <ProjectTile :color="color" :level="level ?? 'ok'" aria-hidden="true" />
    <div class="titles">
      <RouterLink to="/" class="crumb">
        {{ t('project.breadcrumb') }}
        <UiIcon name="chevron-right" :size="12" />
      </RouterLink>
      <span class="line">
        <b class="name">{{ id }}</b>
        <span v-if="meta" class="meta" :title="meta">{{ meta }}</span>
        <span v-if="scan" class="scan">{{ meta ? `· ${scan}` : scan }}</span>
      </span>
    </div>
    <span class="grow" />
    <UiMenu
      v-if="asMenu"
      :items="items"
      :label="t('project.tabsLabel')"
      placement="bottom-end"
      compact
      @select="pick"
    >
      <template #trigger="{ attrs, toggle, open }">
        <button v-bind="attrs" type="button" class="trigger" :class="{ open }" @click="toggle">
          {{ t(`project.tabs.${tab}`) }}
          <span v-if="dotOf(tab)" class="mark" :class="dotOf(tab)" aria-hidden="true" />
          <span v-if="dotOf(tab)" class="sr-only">{{ t('project.needsLook') }}</span>
          <UiIcon name="chevron-down" :size="14" />
        </button>
      </template>
    </UiMenu>
    <div v-else class="tabs" role="tablist" :aria-label="t('project.tabsLabel')">
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
    <AskAiButton :scope="{ kind: 'project', id }" />
    <UiButton v-if="saved" icon="edit" @click="edit">{{ t('projectSheet.editButton') }}</UiButton>
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

/* The header sits over the page's drag strip: only its controls take the pointer, so the
   blank space, the tile and the name still drag the window. */
.project-header {
  pointer-events: none;
}

.project-header > :not(.titles, .grow, :first-child),
.crumb {
  pointer-events: auto;
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
  align-self: flex-start;
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

/* The scan number and time never give way; the servers before them do. */
.scan {
  flex: none;
  margin-left: calc(-1 * var(--space-1));
  color: var(--ink-3);
  font-size: var(--text-12);
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

.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--surface-1);
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  transition: box-shadow var(--dur-color) var(--ease-state);
}

.trigger .icon {
  color: var(--ink-3);
}

.trigger.open {
  box-shadow: 0 0 0 2px var(--accent-mid);
}

.trigger:focus-visible {
  box-shadow: var(--focus-ring);
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
