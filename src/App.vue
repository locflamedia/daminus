<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppWindow from '@/layout/AppWindow.vue'
import { useScanStore } from '@/stores/scan'
import UiToastHost from '@/ui/UiToastHost.vue'

const scan = useScanStore()
const route = useRoute()
// Present only in development; the production bundle drops the import with the constant.
const DevSwitch = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/features/dev/DevSwitch.vue'))
  : null

// One subscription for the whole window: the sidebar and the Overview both follow it.
onMounted(() => void scan.init())
onBeforeUnmount(() => scan.dispose())
</script>

<template>
  <!-- A bare route (the dev gallery) draws without the window frame. -->
  <RouterView v-if="route.meta.bare === true" />
  <AppWindow v-else>
    <RouterView />
  </AppWindow>
  <component :is="DevSwitch" v-if="DevSwitch && route.meta.bare !== true" />
  <UiToastHost />
</template>
