<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useFormat } from '@/composables/use-format'
import { isProjectTab } from '@/layout/project-tabs'
import ProjectHeader from '@/layout/ProjectHeader.vue'
import { tabLevels } from '@/lib/rollups'
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
  const report = reports.latest
  const scanned =
    report?.seq != null && report.scanned_at
      ? t('project.scanMeta', { seq: report.seq, time: fmt.clock(report.scanned_at) })
      : ''
  return [projects.domain(id.value), hosts.join(' + '), scanned].filter(Boolean).join(' · ')
})

const levels = computed(() => tabLevels(reports.latest?.items ?? [], id.value))
</script>

<template>
  <ProjectHeader
    :id="id"
    :meta="meta"
    :tab="tab"
    :level="rollup?.level"
    :tab-levels="levels"
    :color="projects.color(id)"
  />
</template>
