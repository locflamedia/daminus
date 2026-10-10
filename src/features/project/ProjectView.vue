<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useFormat } from '@/composables/use-format'
import { isProjectTab } from '@/layout/project-tabs'
import ProjectHeader from '@/layout/ProjectHeader.vue'
import { tabLevels } from '@/lib/rollups'
import ProjectContainersTab from './containers/ProjectContainersTab.vue'
import ProjectDatabaseTab from './database/ProjectDatabaseTab.vue'
import ProjectDiskTab from './disk/ProjectDiskTab.vue'
import ProjectHistoryTab from './history/ProjectHistoryTab.vue'
import ProjectOverviewTab from './overview/ProjectOverviewTab.vue'
import ProjectSecurityTab from './security/ProjectSecurityTab.vue'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'

const { t } = useI18n()
const fmt = useFormat()
const route = useRoute()
const projects = useProjectsStore()
const reports = useReportStore()

const id = computed(() => String(route.params.id ?? ''))
const tab = computed(() => (isProjectTab(route.params.tab) ? route.params.tab : 'overview'))
const rollup = computed(() => projects.project(id.value))

const meta = computed(() => {
  const hosts = projects.servers.filter((s) => s.used_by.includes(id.value)).map((s) => s.host)
  return [projects.domain(id.value), hosts.join(' + ')].filter(Boolean).join(' · ')
})
const scan = computed(() => {
  const report = reports.latest
  return report?.seq != null && report.scanned_at
    ? t('project.scanMeta', { seq: report.seq, time: fmt.clock(report.scanned_at) })
    : ''
})

const levels = computed(() => tabLevels(reports.latest?.items ?? [], id.value))
</script>

<template>
  <ProjectHeader
    :id="id"
    :meta="meta"
    :scan="scan"
    :tab="tab"
    :level="rollup?.level"
    :tab-levels="levels"
    :color="projects.color(id)"
  />
  <ProjectOverviewTab v-if="tab === 'overview'" :id="id" />
  <ProjectDiskTab v-else-if="tab === 'disk'" :id="id" />
  <ProjectDatabaseTab v-else-if="tab === 'database'" :id="id" />
  <ProjectContainersTab v-else-if="tab === 'containers'" :id="id" />
  <ProjectSecurityTab v-else-if="tab === 'security'" :id="id" />
  <ProjectHistoryTab v-else :id="id" />
</template>
