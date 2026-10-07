<!--
  The window frame of the boards "Navigation" and "Narrow window": the full sidebar at 248 and
  216, the 64 px rail, the Settings column with and without its values, the project mark in
  its states and the project tab menu. The real components, over a small fixed report.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppRail from '@/layout/AppRail.vue'
import PageHeader from '@/layout/PageHeader.vue'
import AppSidebar from '@/layout/AppSidebar.vue'
import ProjectTile from '@/layout/ProjectTile.vue'
import SettingsNav from '@/layout/SettingsNav.vue'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { shellProjects, shellReport } from '@/testing/shell-fixture'
import UiButton from '@/ui/UiButton.vue'
import UiMenu from '@/ui/UiMenu.vue'
import GalleryAtom from './GalleryAtom.vue'
import GalleryFrame from './GalleryFrame.vue'
import GalleryLights from './GalleryLights.vue'
import GalleryRange from './GalleryRange.vue'

const { t } = useI18n()
const k = (key: string) => t(`gallery.shell.${key}`)

const report = useReportStore()
const projects = useProjectsStore()
onMounted(() => {
  if (!report.latest) report.latest = shellReport()
  if (projects.details.length === 0) projects.details = shellProjects()
})

const tabs = ['overview', 'disk', 'database', 'containers', 'security', 'history'] as const
const items = tabs.map((id, i) => ({
  id,
  label: t(`project.tabs.${id}`),
  checked: id === 'security',
  mark:
    id === 'disk' || id === 'containers'
      ? ('warn' as const)
      : id === 'security'
        ? ('crit' as const)
        : undefined,
  markLabel: t('project.needsLook'),
  hint: `⌘${i + 1}`,
}))
const open = ref(true)
</script>

<template>
  <div class="shell">
    <GalleryFrame :title="k('frames')" :spec="k('spec')">
      <div class="frames">
        <GalleryAtom :name="k('full.name')" :spec="k('full.spec')" plain class="col">
          <div class="frame" style="width: 248px; height: 700px">
            <GalleryLights />
            <GalleryRange range="wide"><AppSidebar /></GalleryRange>
          </div>
        </GalleryAtom>
        <GalleryAtom :name="k('medium.name')" :spec="k('medium.spec')" plain class="col">
          <div class="frame" style="width: 216px; height: 700px">
            <GalleryLights />
            <GalleryRange range="medium"><AppSidebar /></GalleryRange>
          </div>
        </GalleryAtom>
        <GalleryAtom :name="k('rail.name')" :spec="k('rail.spec')" plain class="col">
          <div class="frame" style="width: 64px; height: 700px">
            <GalleryLights rail />
            <GalleryRange range="narrow"><AppRail /></GalleryRange>
          </div>
        </GalleryAtom>
        <div class="stack">
          <GalleryAtom :name="k('settings.name')" :spec="k('settings.spec')" plain class="col">
            <div class="frame" style="width: 248px; height: 400px">
              <GalleryLights />
              <GalleryRange range="wide"><SettingsNav /></GalleryRange>
            </div>
          </GalleryAtom>
          <GalleryAtom
            :name="k('settingsNarrow.name')"
            :spec="k('settingsNarrow.spec')"
            plain
            class="col"
          >
            <div class="frame" style="width: 216px; height: 400px">
              <GalleryLights />
              <GalleryRange range="narrow"><SettingsNav /></GalleryRange>
            </div>
          </GalleryAtom>
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame
      :title="k('titlebar.title')"
      :text="k('titlebar.lede')"
      :spec="k('titlebar.spec')"
    >
      <div class="titlebar">
        <div class="frame" style="width: 248px; height: 132px">
          <GalleryLights />
          <GalleryRange range="wide"><AppSidebar /></GalleryRange>
          <span class="hatch" aria-hidden="true" />
        </div>
        <div class="frame page" style="width: 420px; height: 132px">
          <span class="hatch" aria-hidden="true" />
          <GalleryRange range="wide">
            <PageHeader
              :title="t('nav.overview')"
              :meta="t('toolbar.scanMeta', { seq: 12, when: '13:42' })"
            >
              <template #actions>
                <UiButton variant="primary" shortcut="⌘R">{{ t('toolbar.scanAll') }}</UiButton>
              </template>
            </PageHeader>
          </GalleryRange>

          <code class="strip-label">{{ k('titlebar.strip') }}</code>
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame :title="k('marks.title')" :text="k('marks.lede')" :spec="k('marks.spec')">
      <div class="marks">
        <GalleryAtom :name="k('marks.issues.name')" :spec="k('marks.issues.spec')">
          <ProjectTile color="#e0649a" level="crit" :count="3" />
          <ProjectTile color="#4f6bed" level="warn" :count="2" />
          <ProjectTile color="#9a7bea" />
          <ProjectTile />
        </GalleryAtom>
        <GalleryAtom :name="k('marks.active.name')" :spec="k('marks.active.spec')">
          <ProjectTile color="#e0649a" level="crit" :count="3" active />
          <ProjectTile color="#4f6bed" level="warn" :count="12" active />
          <ProjectTile color="#9a7bea" active />
        </GalleryAtom>
        <GalleryAtom :name="k('marks.well.name')" :spec="k('marks.well.spec')" plain>
          <div class="well-card">
            <ProjectTile color="#e0649a" surface="well" />
            <span class="well-name"><b>kho-hang</b><span>khohang.vn · vps-hn-3</span></span>
          </div>
        </GalleryAtom>
      </div>
    </GalleryFrame>

    <GalleryFrame :title="k('tabs.title')" :text="k('tabs.lede')" :spec="k('tabs.spec')">
      <div class="menu-stage">
        <UiMenu v-model:open="open" :items="items" :label="t('project.tabsLabel')" compact inline>
          <template #trigger="{ attrs, toggle }">
            <button v-bind="attrs" type="button" class="menu-trigger" @click="toggle">
              {{ t('project.tabs.security') }}
            </button>
          </template>
        </UiMenu>
      </div>
    </GalleryFrame>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.frames {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-4);
}

.col {
  flex: none;
  width: 300px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.frame {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.titlebar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.page {
  padding: 0 var(--space-6);
  background: var(--page);
}

.hatch {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 40px;
  background: repeating-linear-gradient(135deg, var(--hatch-1) 0 6px, transparent 6px 12px);
  opacity: 0.6;
  pointer-events: none;
}

.strip-label {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-11);
}

.marks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.well-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px var(--space-3);
  border-radius: 12px;
  background: var(--surface-0);
}

.well-name {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.well-name b {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.well-name span {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.menu-stage {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  min-height: 300px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--page-sheet);
}

.menu-trigger {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--surface-1);
  font-weight: var(--weight-medium);
  box-shadow: 0 0 0 2px var(--accent-mid);
}
</style>
