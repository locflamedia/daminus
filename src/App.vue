<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { onTrayOpenProject } from '@/api'
import PayloadSheet from '@/features/ai/payload/PayloadSheet.vue'
import AskDrawer from '@/features/ai/ask/AskDrawer.vue'
import HostKeyHost from '@/features/host-key/HostKeyHost.vue'
import IntroHost from '@/features/intro/IntroHost.vue'
import PaletteHost from '@/features/palette/PaletteHost.vue'
import ProjectSheet from '@/features/project-sheet/ProjectSheet.vue'
import ScanPanel from '@/features/scan-panel/ScanPanel.vue'
import ShortcutsHost from '@/features/shortcuts/ShortcutsHost.vue'
import AppWindow from '@/layout/AppWindow.vue'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import UiToastHost from '@/ui/UiToastHost.vue'
import { createInputTracker, playPush, pushDirection } from '@/ui/route-push'

const scan = useScanStore()
const projects = useProjectsStore()
const report = useReportStore()
const route = useRoute()
const router = useRouter()
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
// "Open <project>" in the menu bar menu.
let stopTray: (() => void) | undefined
let unmounted = false
onMounted(async () => {
  const stop = await onTrayOpenProject(({ project_id }) =>
    router.push({ name: 'project', params: { id: project_id } }),
  )
  if (unmounted) stop()
  else stopTray = stop
})
// Opening a detail with the pointer slides it in; a keyboard move (shortcut, Enter) is instant.
const input = createInputTracker(window)
const stopPush = router.afterEach((to, from, failure) => {
  const direction = pushDirection(from.name, to.name)
  if (failure || direction === null || input.last() !== 'pointer') return
  void nextTick(() => {
    const main = document.querySelector('[data-app-main]')
    if (main) playPush(main, direction)
  })
})
onBeforeUnmount(() => {
  unmounted = true
  stopTray?.()
  stopPush()
  input.stop()
  scan.dispose()
})
</script>

<template>
  <!-- Mounted once for the window; it skips a bare route itself, so the launch is read once. -->
  <IntroHost />
  <!-- A bare route (the dev gallery) draws without the window frame. -->
  <RouterView v-if="route.meta.bare === true" />
  <AppWindow v-else>
    <RouterView />
  </AppWindow>
  <component :is="DevSwitch" v-if="DevSwitch && route.meta.bare !== true" />
  <component :is="DevTrafficLights" v-if="DevTrafficLights && route.meta.bare !== true" />
  <ProjectSheet />
  <ScanPanel />
  <AskDrawer />
  <PayloadSheet />
  <HostKeyHost />
  <PaletteHost />
  <ShortcutsHost />
  <UiToastHost />
</template>
