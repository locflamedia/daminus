<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import HostKeyHost from '@/features/host-key/HostKeyHost.vue'
import ProjectSheet from '@/features/project-sheet/ProjectSheet.vue'
import ScanPanel from '@/features/scan-panel/ScanPanel.vue'
import AppWindow from '@/layout/AppWindow.vue'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import UiToastHost from '@/ui/UiToastHost.vue'

const scan = useScanStore()
const projects = useProjectsStore()
const report = useReportStore()
const route = useRoute()
// Present only in development; the production bundle drops the import with the constant.
const DevSwitch = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/features/dev/DevSwitch.vue'))
  : null
const DevTrafficLights = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/features/dev/DevTrafficLights.vue'))
  : null

// One subscription for the whole window: the sidebar and the Overview both follow it.
onMounted(() => void scan.init())
// Names and colours come from `projects.json`; read again when a new report arrives.
watch(
  () => report.latest,
  () => void projects.loadDetails(),
  { immediate: true },
)
onBeforeUnmount(() => scan.dispose())
</script>

<template>
  <!-- A bare route (the dev gallery) draws without the window frame. -->
  <RouterView v-if="route.meta.bare === true" />
  <AppWindow v-else>
    <RouterView />
  </AppWindow>
  <component :is="DevSwitch" v-if="DevSwitch && route.meta.bare !== true" />
  <component :is="DevTrafficLights" v-if="DevTrafficLights && route.meta.bare !== true" />
  <ProjectSheet />
  <ScanPanel />
  <HostKeyHost />
  <UiToastHost />
</template>
