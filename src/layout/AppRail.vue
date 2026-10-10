<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import brandMark from '../../assets/brand/app-mark-flat-64.png'
import { isUnreachable, issueCount } from '@/lib/rollups'
import { useEmptyStore } from '@/features/empty/empty-store'
import { useProjectsStore } from '@/stores/projects'
import { useScanStore } from '@/stores/scan'
import UiIcon from '@/ui/UiIcon.vue'
import { badgeText } from '@/lib/micro'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import { useAiModelMark, useAiProviderName } from './use-ai-provider-name'
import DiskRing from './DiskRing.vue'
import ProjectTile from './ProjectTile.vue'

const { t } = useI18n()
const projects = useProjectsStore()
const scan = useScanStore()
// Scans can outlive projects.json: with no project, nothing from an old scan is drawn.
const empty = useEmptyStore()
const aiName = useAiProviderName()
const aiMark = useAiModelMark()

const reading = computed(
  () =>
    new Set(
      Object.entries(scan.run?.hosts ?? {})
        .filter(([, p]) => p && p.state !== 'queued' && p.state !== 'finished')
        .map(([host]) => host),
    ),
)

// A label appears after the pointer rests 300 ms, then instantly for the neighbours.
const SHOW_AFTER_MS = 300
const WARM_FOR_MS = 400
const root = ref<HTMLElement | null>(null)
const tip = ref<{ text: string; top: number; mono: boolean } | null>(null)
let showTimer: number | undefined
let coolTimer: number | undefined
let warm = false

function enter(text: string, event: PointerEvent, mono = false) {
  window.clearTimeout(showTimer)
  window.clearTimeout(coolTimer)
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const top = rect.top - (root.value?.getBoundingClientRect().top ?? 0) + rect.height / 2
  const show = () => {
    tip.value = { text, top, mono }
    warm = true
  }
  if (warm) show()
  else showTimer = window.setTimeout(show, SHOW_AFTER_MS)
}

function leave() {
  window.clearTimeout(showTimer)
  tip.value = null
  window.clearTimeout(coolTimer)
  coolTimer = window.setTimeout(() => (warm = false), WARM_FOR_MS)
}

onBeforeUnmount(() => {
  window.clearTimeout(showTimer)
  window.clearTimeout(coolTimer)
})

function issuesLabel(name: string, n: number): string {
  return n > 0 ? t('tooltip.issues', { name, count: t('nav.issues', { n }, n) }) : name
}

function serverLabel(host: string, unreachable: boolean, pct: number | null): string {
  if (unreachable) return `${host} · ${t('nav.unreachable')}`
  return pct === null ? host : `${host} · ${Math.round(pct)}%`
}

const overviewTip = computed(() =>
  projects.issues > 0
    ? t('tooltip.issues', {
        name: t('nav.overview'),
        count: t('nav.issues', { n: projects.issues }, projects.issues),
      })
    : t('nav.overview'),
)
</script>

<template>
  <nav ref="root" class="rail" :aria-label="t('nav.primary')">
    <div class="scroll">
      <span class="lights" aria-hidden="true" />
      <span class="ri brand">
        <img :src="brandMark" alt="" width="22" height="22" />
      </span>
      <button
        type="button"
        class="ri"
        :aria-label="t('nav.search')"
        @pointerenter="enter(t('nav.search'), $event)"
        @pointerleave="leave"
      >
        <UiIcon name="search" />
      </button>
      <RouterLink
        to="/"
        class="ri"
        active-class=""
        exact-active-class="on"
        :aria-label="overviewTip"
        @pointerenter="enter(overviewTip, $event)"
        @pointerleave="leave"
      >
        <UiIcon name="grid" />
        <b v-if="!empty.active && badgeText(projects.issues)" class="badge accent">{{
          badgeText(projects.issues)
        }}</b>
      </RouterLink>
      <RouterLink
        to="/history"
        class="ri"
        active-class="on"
        :aria-label="t('nav.history')"
        @pointerenter="enter(t('nav.history'), $event)"
        @pointerleave="leave"
      >
        <UiIcon name="clock" />
      </RouterLink>

      <!-- Projects and servers scroll on their own, so the AI mark and the Settings gear stay in
           view in a short window. -->
      <div class="mid">
        <template v-if="!empty.active && projects.projects.length">
          <span class="line" />
          <RouterLink
            v-for="p in projects.projects"
            :key="p.id"
            v-slot="{ isActive }"
            :to="{ name: 'project', params: { id: p.id } }"
            class="ri project"
            active-class="on"
            :aria-label="issuesLabel(p.id, issueCount(p))"
            @pointerenter="enter(issuesLabel(p.id, issueCount(p)), $event)"
            @pointerleave="leave"
          >
            <ProjectTile
              :color="projects.color(p.id)"
              :level="p.level"
              :count="issueCount(p)"
              :active="isActive"
            />
          </RouterLink>
        </template>

        <template v-if="!empty.active && projects.servers.length">
          <span class="line" />
          <RouterLink
            v-for="s in projects.servers"
            :key="s.host"
            :to="{ name: 'server', params: { host: s.host } }"
            class="ri"
            active-class="on"
            :aria-label="serverLabel(s.host, isUnreachable(s.outcome), projects.disk(s.host))"
            @pointerenter="
              enter(
                serverLabel(s.host, isUnreachable(s.outcome), projects.disk(s.host)),
                $event,
                true,
              )
            "
            @pointerleave="leave"
          >
            <DiskRing
              :pct="projects.disk(s.host)"
              :reading="reading.has(s.host)"
              :dim="isUnreachable(s.outcome)"
              :size="18"
            />
          </RouterLink>
        </template>
      </div>
      <RouterLink
        v-if="aiName"
        :to="{ name: 'settings', params: { section: 'ai' } }"
        class="ri"
        active-class=""
        :aria-label="t('nav.aiProvider', { name: aiName })"
        @pointerenter="enter(t('nav.aiProvider', { name: aiName }), $event)"
        @pointerleave="leave"
      >
        <UiBrandMark :name="aiMark" :size="16"><UiIcon name="spark" /></UiBrandMark>
        <span class="live" aria-hidden="true" />
      </RouterLink>
      <RouterLink
        to="/settings"
        class="ri"
        active-class="on"
        :aria-label="t('nav.settings')"
        @pointerenter="enter(t('nav.settings'), $event)"
        @pointerleave="leave"
      >
        <UiIcon name="settings" />
      </RouterLink>
    </div>
    <span
      v-if="tip"
      class="tip"
      :class="{ mono: tip.mono }"
      :style="{ top: `${tip.top}px` }"
      role="tooltip"
    >
      {{ tip.text }}
    </span>
  </nav>
</template>

<style scoped>
.rail {
  position: relative;
  height: 100%;
  background: linear-gradient(165deg, var(--side-1), var(--side-2) 58%, var(--side-3));
}

.scroll {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: var(--space-4) 0;
  overflow: hidden;
}

.mid {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  align-self: stretch;
  min-height: 0;
  padding: 4px 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.lights {
  flex: none;
  height: var(--lights-row-rail);
}

:global(:root[data-fullscreen='true']) .lights {
  display: none;
}

.ri {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 36px;
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  transition: background-color var(--dur-color) var(--ease-state);
}

.ri:hover {
  background: var(--side-hover);
}

.ri.on {
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
}

.ri.on > .icon {
  color: var(--accent);
}

.ri:focus-visible {
  box-shadow: var(--focus-ring);
}

.brand:hover {
  background: none;
}

.brand img {
  display: block;
}

.ri.project {
  width: 40px;
  height: 38px;
}

.ri.project.on {
  background: none;
  box-shadow: none;
}

.badge {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  color: var(--on-solid);
  line-height: 1;
  font-size: 9px;
  font-weight: var(--weight-semibold);
}

.badge.accent {
  background: var(--accent);
}

.line {
  flex: none;
  width: 24px;
  height: 1px;
  margin: var(--space-1) 0;
  background: var(--side-line);
}

.live {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok-ink);
}

.tip {
  position: absolute;
  left: 64px;
  z-index: 10;
  padding: 5px var(--space-2);
  border-radius: var(--space-2);
  background: var(--btn);
  color: var(--btn-ink);
  font-size: var(--text-11);
  white-space: nowrap;
  pointer-events: none;
  transform: translateY(-50%);
  animation: tip-in var(--dur-popover) var(--ease-out) both;
}

@keyframes tip-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Under Reduce Motion the tip only fades in, as every tooltip does. */
@media (prefers-reduced-motion: reduce) {
  .tip {
    animation-name: tip-fade;
  }
}

@keyframes tip-in {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%);
  }
}
</style>
