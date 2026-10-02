<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
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

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.clearTimeout(settleTimer)
})
</script>

<template>
  <div class="window" :class="{ instant }" :data-column="column" :data-range="range">
    <aside class="side" :class="{ animating }">
      <SettingsNav v-if="inSettings" />
      <AppRail v-else-if="folded" />
      <AppSidebar v-else />
    </aside>
    <main class="main">
      <span class="blob" aria-hidden="true" />
      <slot />
    </main>
  </div>
</template>

<style scoped>
.window {
  --side-col: var(--sidebar-w);

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

.main {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  min-height: 0;
  padding: 0 var(--space-8) var(--space-6);
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
  padding: 0 var(--space-6) var(--space-6);
  gap: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .window {
    transition: none;
  }
}
</style>
