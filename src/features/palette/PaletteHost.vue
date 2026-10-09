<!-- Mounts the command palette once for the window: ⌘K (or the sidebar's Search row) opens it. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useProjectsStore } from '@/stores/projects'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useScanStore } from '@/stores/scan'
import { useSettingsStore } from '@/stores/settings'
import UiCommandPalette from '@/ui/UiCommandPalette.vue'
import { buildGroups } from './palette-model'
import { usePaletteStore } from './palette-store'
import { activateStarry, starryOn } from './starry'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = usePaletteStore()
const projects = useProjectsStore()
const scan = useScanStore()
const panel = useScanPanelStore()
const settings = useSettingsStore()

const query = ref('')
const suspended = computed(() => route.meta.setup === true || route.meta.bare === true)

const groups = computed(() =>
  buildGroups({
    projects: projects.projects,
    servers: projects.servers,
    domains: Object.fromEntries(projects.projects.map((p) => [p.id, projects.domain(p.id)])),
    canScan: projects.loaded && projects.details.length > 0 && !scan.scanning,
    easterEggs: settings.appearance.easter_eggs,
    query: query.value,
    t: (key) => t(key),
  }),
)

function onSelect(id: string) {
  const sep = id.indexOf(':')
  const kind = sep < 0 ? id : id.slice(0, sep)
  const rest = sep < 0 ? '' : id.slice(sep + 1)
  if (kind === 'project') void router.push({ name: 'project', params: { id: rest } })
  else if (kind === 'server') void router.push({ name: 'server', params: { host: rest } })
  else if (id === 'page:overview') void router.push({ name: 'overview' })
  else if (id === 'page:history') void router.push({ name: 'history' })
  else if (kind === 'settings') void router.push({ name: 'settings', params: { section: rest } })
  else if (id === 'scan') void panel.start()
  else if (id === 'starry') activateStarry()
}

function onKeydown(e: KeyboardEvent) {
  if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey || e.key.toLowerCase() !== 'k') return
  if (e.defaultPrevented || e.isComposing || suspended.value) return
  e.preventDefault()
  if (store.open) store.close()
  else store.show(true)
}

// The painting is a layer the window's ground draws (see the style below).
watch(
  starryOn,
  (on) => {
    if (on) document.documentElement.dataset.starry = ''
    else delete document.documentElement.dataset.starry
  },
  { immediate: true },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="frame">
    <UiCommandPalette
      v-model:query="query"
      :open="store.open"
      :groups="groups"
      :label="t('palette.label')"
      :instant="store.instant"
      @select="onSelect"
      @close="store.close()"
    />
  </div>
</template>

<style scoped>
/* The palette fills its nearest positioned ancestor; this one is the whole window and lets
   presses through while the palette is closed. */
.frame {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}

.frame > :deep(*) {
  pointer-events: auto;
}
</style>

<style>
/* The window's ground is the page column's own opaque fill, so the painting is a layer inside
   it: above the fill, below everything the page draws, and never in the way of a press. */
html[data-starry] [data-app-main]::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: url('@/assets/delight/starry-small.jpg') center / cover no-repeat;
  opacity: 0.22;
  pointer-events: none;
  animation: starry-wash 1.44s cubic-bezier(0.65, 0, 0.35, 1) both;
}

@keyframes starry-wash {
  from {
    opacity: 0;
  }

  to {
    opacity: 0.22;
  }
}

@media (prefers-reduced-motion: reduce) {
  html[data-starry] [data-app-main]::before {
    animation: none;
  }
}
</style>
