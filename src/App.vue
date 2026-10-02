<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppWindow from '@/layout/AppWindow.vue'
import { useScanStore } from '@/stores/scan'

const scan = useScanStore()
// Present only in development; the production bundle drops the import with the constant.
const DevSwitch = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/features/dev/DevSwitch.vue'))
  : null

// One subscription for the whole window: the sidebar and the Overview both follow it.
onMounted(() => void scan.init())
onBeforeUnmount(() => scan.dispose())
</script>

<template>
  <AppWindow>
    <RouterView />
  </AppWindow>
  <component :is="DevSwitch" v-if="DevSwitch" />
</template>
