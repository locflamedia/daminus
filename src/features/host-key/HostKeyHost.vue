<!--
  Mounts the host key screen once for the window and decides what happens after it: when Retry
  finds the key accepted, the screen closes after a short moment and that host is scanned again.
-->
<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useHostKeyStore } from '@/stores/host-key'
import { useScanPanelStore } from '@/stores/scan-panel'
import HostKeyDialog from './HostKeyDialog.vue'

/** How long "Key accepted" stays readable before the screen goes and the scan starts. */
const ACCEPTED_MS = 1400

const store = useHostKeyStore()
const panel = useScanPanelStore()
let timer: number | undefined

watch(
  () => store.result,
  (result) => {
    window.clearTimeout(timer)
    if (result !== 'accepted' || store.alias === null) return
    const host = store.alias
    timer = window.setTimeout(() => {
      store.close()
      void panel.start({ projects: [], hosts: [host] })
    }, ACCEPTED_MS)
  },
)
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div class="frame" :class="{ idle: !store.isOpen }"><HostKeyDialog /></div>
</template>

<style scoped>
.frame {
  position: fixed;
  inset: 0;
  z-index: 60;
}

.frame.idle {
  pointer-events: none;
}
</style>
