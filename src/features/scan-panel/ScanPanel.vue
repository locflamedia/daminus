<!--
  The scan panel (board "Scan panel"): a card drawer opened from Scan all or ⌘R. One row per
  host, one segment per host above them, the host being read opened into its steps, a failed
  host with its cause and a Retry, what the finished hosts read, the trust line and the two
  ways out: Stop scan, or Keep in background (⌘B). esc closes the panel and the scan goes on.
  When the scan has ended and a host failed the panel stays, so the retry has somewhere to be.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { useHistoryStore } from '@/stores/history'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useScanStore } from '@/stores/scan'
import UiButton from '@/ui/UiButton.vue'
import UiChip, { type ChipTone } from '@/ui/UiChip.vue'
import UiDrawer from '@/ui/UiDrawer.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import {
  clockText,
  estimateLeftMs,
  foundSoFar,
  panelHosts,
  type PanelHost,
  type SegmentState,
} from './scan-panel-model'
import ScanPanelHost from './ScanPanelHost.vue'

const { t } = useI18n()
const fmt = useFormat()
const scan = useScanStore()
const panel = useScanPanelStore()
const projects = useProjectsStore()
const history = useHistoryStore()
const reports = useReportStore()

const running = computed(() => scan.scanning)
const hosts = computed<PanelHost[]>(() =>
  panelHosts(panel.run, projects.details, reports.latest?.disabled_groups ?? []),
)

// --- the clock ---------------------------------------------------------------------------

const now = ref(Date.now())
let ticker: number | undefined
watch(
  () => panel.open && running.value,
  (on) => {
    window.clearInterval(ticker)
    if (on) {
      now.value = Date.now()
      ticker = window.setInterval(() => (now.value = Date.now()), 1000)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => window.clearInterval(ticker))

/** Time since the scan started; it stops where the scan did. */
const elapsedMs = computed(() => {
  const run = panel.run
  if (!run) return 0
  const end = running.value ? now.value : (panel.endedAt ?? now.value)
  return Math.max(0, end - Date.parse(run.started_at))
})
const clock = computed(() => clockText(elapsedMs.value))

const left = computed(() => {
  const ms = running.value ? estimateLeftMs(history.view, elapsedMs.value) : null
  return ms === null ? null : fmt.duration(Math.ceil(ms / 1000) * 1000)
})

// --- header and counts -------------------------------------------------------------------

const chip = computed<{ tone: ChipTone; label: string }>(() => {
  if (running.value) return { tone: 'info', label: t('scanPanel.running') }
  if (panel.end === 'cancelled') return { tone: 'neutral', label: t('scanPanel.stopped') }
  return { tone: panel.failedHosts.length > 0 ? 'warn' : 'ok', label: t('scanPanel.done') }
})
const title = computed(() => {
  if (running.value) return t('scanPanel.title')
  return panel.end === 'cancelled' ? t('scanPanel.titleStopped') : t('scanPanel.titleDone')
})

const total = computed(() => hosts.value.length)
const done = computed(() => hosts.value.filter((h) => h.segment === 'done').length)
const failed = computed(() => hosts.value.filter((h) => h.segment === 'failed').length)

function fill(h: PanelHost): number {
  return h.segment === 'reading' ? Math.max(0.12, h.progress) : 1
}

const SEGMENT_CLASS: Record<SegmentState, string> = {
  done: 'done',
  reading: 'reading',
  failed: 'failed',
  waiting: 'waiting',
}

// --- what finished hosts read ------------------------------------------------------------

const found = computed(() => foundSoFar(hosts.value))

function foundText(h: PanelHost): string {
  if (h.segment === 'failed') return t(`scanHost.${h.detail}`)
  const read = t('scanPanel.foundRead', { n: h.facts }, h.facts)
  return h.projects.length > 0
    ? t('scanPanel.foundLine', { projects: h.projects.join(' · '), read })
    : read
}

// --- keyboard ----------------------------------------------------------------------------

/**
 * ⌘B tucks the panel away (or brings it back while a scan runs), from any screen. The listener
 * runs in the capture phase so that esc closes the panel before the Overview's own esc, which
 * ends the scan, gets to see the key.
 */
function onKeydown(e: KeyboardEvent) {
  if (e.metaKey && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    panel.toggle()
  } else if (e.key === 'Escape' && !e.defaultPrevented && panel.open) {
    // The panel closes; the scan, and the stop that esc means on the Overview, are left alone.
    e.preventDefault()
    panel.close()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="layer">
    <Transition name="scrim">
      <div v-if="panel.open" class="scrim" aria-hidden="true" @click="panel.close()" />
    </Transition>
    <UiDrawer
      class="drawer"
      variant="card"
      :open="panel.open"
      :label="t('scanPanel.label')"
      @close="panel.close()"
    >
      <header class="head">
        <div class="title-row">
          <h2>{{ title }}</h2>
          <UiChip :tone="chip.tone" class="state">
            <i v-if="running" class="live" aria-hidden="true" />
            {{ chip.label }} · <span class="clock">{{ clock }}</span>
          </UiChip>
          <span class="grow" />
          <UiKbd>esc</UiKbd>
          <button
            type="button"
            class="close"
            :aria-label="t('scanPanel.close')"
            @click="panel.close()"
          >
            <UiIcon name="close" :size="16" />
          </button>
        </div>
        <ol class="segments" :aria-label="t('scanPanel.hostsLabel')">
          <li v-for="h in hosts" :key="h.host" :class="SEGMENT_CLASS[h.segment]">
            <b class="fill" :style="{ transform: `scaleX(${fill(h)})` }" />
            <span class="sr-only">{{ h.host }}: {{ t(`scanPanel.mark.${h.segment}`) }}</span>
          </li>
        </ol>
        <div class="counts">
          <span>
            <b>{{ t('scanPanel.progress', { done, total }) }}</b>
            <template v-if="failed > 0">
              · {{ t('scanPanel.unreachable', { n: failed }) }}</template
            >
          </span>
          <span v-if="left" class="left">{{ t('scanPanel.left', { time: left }) }}</span>
        </div>
      </header>

      <ul class="hosts">
        <ScanPanelHost
          v-for="(h, i) in hosts"
          :key="h.host"
          :host="h"
          :can-retry="!running"
          :style="{ '--d': `${i * 70}ms` }"
          @retry="panel.start({ projects: [], hosts: [$event] })"
        />
      </ul>

      <section class="found">
        <h3>{{ t('scanPanel.found') }}</h3>
        <ul v-if="found.length > 0">
          <li v-for="h in found" :key="h.host" class="line m-enter">
            <i
              class="dot"
              :class="h.segment === 'failed' ? 'bad' : h.detail === 'partial' ? 'warn' : 'ok'"
            />
            <span class="text">{{ foundText(h) }}</span>
            <span class="where mono">{{ h.host }}</span>
          </li>
        </ul>
      </section>

      <footer class="foot">
        <span v-if="running" class="trust">
          <UiIcon name="lock" :size="14" />
          {{ t('scanPanel.trust') }}
        </span>
        <div class="buttons">
          <template v-if="running">
            <UiButton @click="scan.stop()">{{ t('scanPanel.stop') }}</UiButton>
            <span class="grow" />
            <UiButton variant="primary" shortcut="⌘B" @click="panel.close()">
              {{ t('scanPanel.background') }}
            </UiButton>
          </template>
          <template v-else>
            <span class="grow" />
            <UiButton variant="primary" @click="panel.close()">{{
              t('scanPanel.finish')
            }}</UiButton>
          </template>
        </div>
      </footer>
    </UiDrawer>
  </div>
</template>

<style scoped>
/* A layer over the window that lets everything through except the panel and its scrim. */
.layer {
  position: fixed;
  inset: 0;
  z-index: 34;
  pointer-events: none;
}

.scrim {
  position: absolute;
  inset: 0 0 0 var(--sidebar-w);
  background: color-mix(in srgb, var(--page-sheet) 62%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: auto;
}

/* The scrim starts where the main column does: after the sidebar or the rail. */
:global(body:has(.window[data-column='medium'])) .scrim {
  inset-inline-start: var(--sidebar-w-medium);
}

:global(body:has(.window[data-column='rail'])) .scrim {
  inset-inline-start: var(--rail-w);
}

.scrim-enter-active,
.scrim-leave-active {
  transition: opacity var(--dur-drawer) var(--ease-drawer);
}

.scrim-enter-from,
.scrim-leave-to {
  opacity: 0;
}

.drawer {
  pointer-events: auto;
}

.head {
  display: flex;
  flex-direction: column;
  flex: none;
  gap: 14px;
  padding: 20px 20px 16px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

h2 {
  margin: 0;
  font-size: 17px;
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
  line-height: normal;
}

/* The chip of the board is 24 px high, like the chips of the Overview. */
.state {
  height: 24px;
  padding: 0 10px;
}

.grow {
  flex-grow: 1;
}

.clock {
  font-variant-numeric: tabular-nums;
}

.close {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-xs);
  color: var(--ink-3);
}

.close:hover {
  background: var(--surface-1);
}

.close:focus-visible {
  box-shadow: var(--focus-ring);
}

/* The live dot rings once as the scan starts, then stays still. */
.live {
  position: relative;
  display: inline-block;
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.live::after {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  content: '';
  animation: ping 600ms var(--ease-out) 1;
}

@keyframes ping {
  from {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent);
  }

  to {
    box-shadow: 0 0 0 6px transparent;
  }
}

.segments {
  display: flex;
  gap: 4px;
  height: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.segments li {
  position: relative;
  flex: 1;
  overflow: hidden;
  border-radius: 3px;
  background: var(--surface-2);
}

.fill {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  background: var(--ok-solid);
  transform-origin: left;
  transition: transform var(--dur-bar) var(--ease-out);
}

.reading .fill {
  background: var(--accent);
}

.failed .fill {
  background: var(--crit-solid);
}

.waiting .fill {
  transform: scaleX(0) !important;
}

.counts {
  display: flex;
  justify-content: space-between;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: normal;
}

.counts b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.left {
  color: var(--ink-3);
}

.hosts {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
  margin: 0;
  padding: 0 20px;
  overflow-y: auto;
  list-style: none;
}

.found {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-height: 96px;
  padding: 12px 20px 0;
  overflow-y: auto;
}

.found h3 {
  margin: 0;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  line-height: normal;
}

.found ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.line {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 28px;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ok-solid);
}

.dot.warn {
  background: var(--warn-solid);
}

.dot.bad {
  background: var(--crit-solid);
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.where {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.foot {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) 20px 20px;
  background: var(--page);
}

.trust {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: normal;
}

.trust :deep(svg) {
  color: var(--ok-ink);
}

.buttons {
  display: flex;
  gap: var(--space-2);
}

@media (prefers-reduced-motion: reduce) {
  .live::after {
    animation: none;
  }
}
</style>
