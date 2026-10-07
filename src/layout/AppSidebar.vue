<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import brandMark from '../../assets/brand/app-mark-flat-64.png'
import { useNow } from '@/composables/use-now'
import SidebarAiCard from '@/features/empty/components/SidebarAiCard.vue'
import SidebarGhosts from '@/features/empty/components/SidebarGhosts.vue'
import SidebarTermius from '@/features/empty/components/SidebarTermius.vue'
import { useEmptyStore } from '@/features/empty/empty-store'
import { diskTone, isUnreachable, issueCount } from '@/lib/rollups'
import { staleDays } from '@/lib/staleness'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import DiskRing from './DiskRing.vue'
import ProjectDot from './ProjectDot.vue'

const { t } = useI18n()
const report = useReportStore()
const projects = useProjectsStore()
const scan = useScanStore()
const empty = useEmptyStore()

/** No project yet: the sidebar draws its empty form, by the screen Overview shows. */
const firstLaunch = computed(() => empty.active)
const helpScreen = computed(() => firstLaunch.value && empty.screen === 'help')

/** Results over a day old: Overview reads "4 d old" and nothing is coloured by severity. */
const clock = useNow()
const oldDays = computed(() => staleDays(report.latest?.scanned_at, clock.value))

/** Hosts a running scan is connecting to or reading right now. */
const reading = computed(
  () =>
    new Set(
      Object.entries(scan.run?.hosts ?? {})
        .filter(([, p]) => p && p.state !== 'queued' && p.state !== 'finished')
        .map(([host]) => host),
    ),
)

function projectReading(id: string): boolean {
  return projects.servers.some((s) => s.used_by.includes(id) && reading.value.has(s.host))
}

function projectCountTone(level: string): string {
  return level === 'crit' ? 'crit' : level === 'warn' ? 'warn' : ''
}

const serverRows = computed(() =>
  projects.servers.map((s) => {
    const unreachable = isUnreachable(s.outcome)
    const pct = projects.disk(s.host)
    return {
      host: s.host,
      unreachable,
      pct,
      tone: pct === null || oldDays.value !== null ? '' : diskTone(pct),
      reading: reading.value.has(s.host),
    }
  }),
)
</script>

<template>
  <nav class="sidebar" :aria-label="t('nav.primary')">
    <span class="lights" aria-hidden="true" />
    <div class="brand">
      <img :src="brandMark" alt="" width="22" height="22" />
      <b>{{ t('app.name') }}</b>
    </div>

    <button v-if="!helpScreen" type="button" class="search">
      <UiIcon name="search" />
      <span class="grow">{{ t('nav.search') }}</span>
      <UiKbd>⌘K</UiKbd>
    </button>

    <div class="list">
      <RouterLink to="/" class="item" active-class="" exact-active-class="on">
        <UiIcon name="grid" />
        {{ t('nav.overview') }}
        <span v-if="scan.scanning" class="count scanning">{{ t('nav.scanning') }}</span>
        <span v-else-if="oldDays !== null" class="count old">
          {{ t('nav.stale', { n: oldDays }) }}
        </span>
        <span v-else-if="report.latest && projects.issues > 0" class="count">
          {{ t('nav.issues', { n: projects.issues }, projects.issues) }}
        </span>
      </RouterLink>
      <RouterLink to="/history" class="item" active-class="on">
        <UiIcon name="clock" />
        {{ t('nav.history') }}
        <span v-if="report.latest?.seq != null" class="count">{{ report.latest.seq }}</span>
      </RouterLink>
    </div>

    <template v-if="firstLaunch">
      <section v-if="helpScreen" class="list">
        <h3 class="group">{{ t('nav.projects') }} <span>0</span></h3>
        <h3 class="group">{{ t('nav.servers') }} <span>0</span></h3>
      </section>
      <SidebarGhosts v-else />
      <SidebarTermius v-if="helpScreen && empty.input.termiusInstalled" />
    </template>

    <section v-if="projects.projects.length" class="list">
      <h3 class="group">
        {{ t('nav.projects') }} <span>{{ projects.projects.length }}</span>
      </h3>
      <RouterLink
        v-for="p in projects.projects"
        :key="p.id"
        :to="{ name: 'project', params: { id: p.id } }"
        class="item"
        active-class="on"
      >
        <ProjectDot
          :level="p.level"
          :unreachable="p.unreachable_hosts.length > 0"
          :reading="projectReading(p.id)"
          :color="projects.color(p.id)"
        />
        <span class="name">{{ p.id }}</span>
        <span
          v-if="oldDays === null && issueCount(p) > 0"
          class="count strong"
          :class="projectCountTone(p.level)"
        >
          {{ issueCount(p) }}
        </span>
      </RouterLink>
    </section>

    <section v-if="serverRows.length" class="list">
      <h3 class="group">
        {{ t('nav.servers') }} <span>{{ serverRows.length }}</span>
      </h3>
      <RouterLink
        v-for="s in serverRows"
        :key="s.host"
        :to="{ name: 'server', params: { host: s.host } }"
        class="item server"
        :class="{ off: s.unreachable }"
        active-class="on"
      >
        <DiskRing
          :pct="s.pct"
          :reading="s.reading"
          :dim="s.unreachable"
          :neutral="oldDays !== null"
        />
        <span class="mono name">{{ s.host }}</span>
        <span v-if="s.unreachable" class="count strong">{{ t('nav.unreachable') }}</span>
        <span v-else-if="s.pct !== null" class="count strong" :class="s.tone">
          {{ Math.round(s.pct) }}%
        </span>
      </RouterLink>
    </section>

    <div class="foot">
      <SidebarAiCard v-if="firstLaunch && !helpScreen" />
      <RouterLink to="/settings" class="item" active-class="on">
        <UiIcon name="settings" />
        {{ t('nav.settings') }}
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  height: 100%;
  min-width: 0;
  padding: var(--space-4);
  overflow-y: auto;
  background: linear-gradient(165deg, var(--side-1), var(--side-2) 58%, var(--side-3));
  line-height: normal;
}

.lights {
  flex: none;
  height: var(--lights-row);
}

:global(:root[data-fullscreen='true']) .lights {
  display: none;
}

:global(:root[data-fullscreen='true']) .sidebar {
  padding-top: var(--side-top-fullscreen);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  height: var(--h-control);
  padding: 0 var(--space-1);
  font-size: var(--text-15);
}

.brand b {
  font-weight: var(--weight-medium);
}

.brand img {
  display: block;
  flex: none;
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  height: var(--h-control);
  padding: 0 var(--space-2) 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--side-search);
  color: var(--ink-3);
  font-size: var(--text-13);
  text-align: left;
}

.search .icon {
  color: var(--ink-4);
}

.grow {
  flex-grow: 1;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: none;
}

.group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  padding: 0 var(--space-3);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: var(--text-13);
  white-space: nowrap;
  transition:
    background-color var(--dur-color) var(--ease-state),
    color var(--dur-color) var(--ease-state);
}

.item .icon {
  color: var(--ink-3);
}

.item:hover {
  background: var(--side-hover);
}

.item.on {
  background: var(--surface-0);
  color: var(--ink);
  box-shadow: var(--shadow-lift);
}

.item.on .icon {
  color: var(--accent);
}

.item:focus-visible {
  box-shadow: var(--focus-ring);
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server {
  color: var(--ink);
}

.server .name {
  font-size: var(--text-12);
}

.server.off {
  color: var(--ink-3);
}

.count {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.count.strong {
  font-weight: var(--weight-medium);
}

.count.scanning {
  color: var(--accent-ink);
}

.count.old {
  color: var(--warn-ink);
}

.count.crit {
  color: var(--crit-ink);
}

.count.warn {
  color: var(--warn-ink);
}

.foot {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: auto;
  flex: none;
}
</style>
