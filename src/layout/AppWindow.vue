<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { watchFullscreen } from '@/api'
import { prefersReducedMotion } from '@/lib/motion'
import { LAYOUT_RANGE, rangeOf, useViewportWidth } from '@/lib/viewport'
import { useSettingsStore } from '@/stores/settings'
import AppRail from './AppRail.vue'
import SettingsNav from './SettingsNav.vue'
import AppSidebar from './AppSidebar.vue'

const route = useRoute()
const settings = useSettingsStore()
const width = useViewportWidth()

const range = computed(() => rangeOf(width.value))
provide(LAYOUT_RANGE, range)
const inSettings = computed(() => route.meta.settings === true)
// Settings has its own left column; it never folds to a rail.
const folded = computed(() => !inSettings.value && settings.isFolded(range.value))
const column = computed(() => {
  if (folded.value) return 'rail'
  return range.value === 'wide' ? 'full' : 'medium'
})

/**
 * The sidebar <-> rail change is a 240 ms width transition when the window or the mouse
 * causes it, and instant when a keyboard shortcut does. The column clips only while it
 * moves, so rail tooltips can sit outside it the rest of the time.
 */
const animating = ref(false)
const instant = ref(false)
let settleTimer: number | undefined

watch(column, () => {
  if (instant.value || prefersReducedMotion()) return
  animating.value = true
  window.clearTimeout(settleTimer)
  settleTimer = window.setTimeout(() => (animating.value = false), 280)
})

function onKeydown(e: KeyboardEvent) {
  // ⌘\ folds or unfolds the sidebar at any width; the choice is kept per width range.
  if (e.metaKey && e.key === '\\' && !inSettings.value) {
    e.preventDefault()
    instant.value = true
    settings.toggleFolded(range.value)
    window.setTimeout(() => (instant.value = false), 0)
  }
}

// The title bar is an overlay: the traffic lights sit in the sidebar's first row and are gone
// in full screen, where the sidebar keeps only its top padding.
let stopWatching: (() => void) | undefined
let unmounted = false
onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  const stop = await watchFullscreen((full) => {
    document.documentElement.dataset.fullscreen = String(full)
  })
  if (unmounted) stop()
  else stopWatching = stop
})
onBeforeUnmount(() => {
  unmounted = true
  window.removeEventListener('keydown', onKeydown)
  window.clearTimeout(settleTimer)
  stopWatching?.()
  delete document.documentElement.dataset.fullscreen
})
</script>

<template>
  <div class="window" :class="{ instant }" :data-column="column" :data-range="range">
    <aside class="side" :class="{ animating }">
      <!-- The top 40 px of the sidebar and of the page drags the window; a double click zooms. -->
      <span class="drag" data-tauri-drag-region aria-hidden="true" />
      <SettingsNav v-if="inSettings" />
      <AppRail v-else-if="folded" />
      <AppSidebar v-else />
    </aside>
    <main class="main">
      <span class="blob" aria-hidden="true" />
      <span class="drag" data-tauri-drag-region aria-hidden="true" />
      <slot />
    </main>
  </div>
</template>

<style scoped>
.window {
  --side-col: var(--sidebar-w);
  --drag-strip: 40px;

  display: grid;
  grid-template-columns: var(--side-col) minmax(0, 1fr);
  height: 100%;
  min-width: 0;
  background: var(--surface-0);
  transition: grid-template-columns var(--dur-sidebar) var(--ease-in-out);
}

.window.instant {
  transition: none;
}

.window[data-column='medium'] {
  --side-col: var(--sidebar-w-medium);
}

.window[data-column='rail'] {
  --side-col: var(--rail-w);
}

.side {
  position: relative;
  z-index: 3;
  min-width: 0;
}

.side.animating {
  overflow: hidden;
}

.drag {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 1;
  height: var(--drag-strip);
}

/* In the page the strip stays at the top while the content scrolls and the controls of a header
   (positioned, later in the tree) sit above it. */
.main .drag {
  position: sticky;
  z-index: 0;
  flex: none;
  margin: 0 calc(-1 * var(--main-pad)) calc(-1 * (var(--drag-strip) + var(--main-gap)));
}

.main {
  --main-pad: var(--space-8);
  --main-gap: var(--space-4);

  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--main-gap);
  min-width: 0;
  min-height: 0;
  padding: 0 var(--main-pad) var(--space-6);
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--page);
  isolation: isolate;
}

.blob {
  position: absolute;
  top: -160px;
  right: 40px;
  z-index: -1;
  width: 380px;
  height: 380px;
  border-radius: 50%;
  background: var(--blob);
  filter: blur(56px);
  pointer-events: none;
}

[data-range='narrow'] .main {
  --main-pad: var(--space-6);
  --main-gap: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .window {
    transition: none;
  }
}
</style>
