<!--
  The one summary line (boards "Overview · results" and "· old results"): the count first, then
  chips for critical and warnings that filter the cards, the server chip, and at the right the
  expected rules, kept apart in the accent and never counted as issues.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Report } from '@/api'
import type { ServerSummary } from '@/lib/overview-servers'
import ClearSky from '@/features/delight/ClearSky.vue'
import { useOverviewStore } from '@/stores/overview'
import { useProjectsStore } from '@/stores/projects'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ report: Report; servers: ServerSummary | null }>()

const { t } = useI18n()
const projects = useProjectsStore()
const selection = useOverviewStore()

const counts = computed(() => props.report.counts)
const expected = computed(() => counts.value.expected)
const reviewDue = computed(() => props.report.rules_due.length)

const projectsWord = computed(() =>
  t('overview.projectCount', { n: projects.projects.length }, projects.projects.length),
)
const serversWord = computed(() =>
  t('overview.serverCount', { n: projects.servers.length }, projects.servers.length),
)
const issuesWord = computed(() => t('nav.issues', { n: projects.issues }, projects.issues))

/** "2 expected · 1 review due": rules apart from the issue count. */
const expectedText = computed(() => {
  const head = t('overview.expected', { n: expected.value })
  return reviewDue.value > 0 ? `${head} · ${t('overview.reviewDue', { n: reviewDue.value })}` : head
})

const serverText = computed(() => {
  const s = props.servers
  if (!s) return ''
  return s.pct !== null
    ? t('overviewScreen.serverDisk', { n: s.count, pct: s.pct }, s.count)
    : t('overviewScreen.serverLook', { n: s.count }, s.count)
})
</script>

<template>
  <div class="summary">
    <ClearSky />
    <span class="lead">
      <i18n-t v-if="projects.issues > 0" keypath="overview.summary" scope="global">
        <template #issues
          ><b>{{ issuesWord }}</b></template
        >
        <template #projects>{{ projectsWord }}</template>
        <template #servers>{{ serversWord }}</template>
      </i18n-t>
      <i18n-t v-else keypath="overview.clear" scope="global">
        <template #projects>{{ projectsWord }}</template>
        <template #servers>{{ serversWord }}</template>
      </i18n-t>
    </span>
    <button
      v-if="counts.crit > 0"
      type="button"
      class="chip crit"
      :aria-pressed="selection.severity === 'crit'"
      :title="t('overviewScreen.chipFilter', { what: t('overview.crit', { n: counts.crit }) })"
      @click="selection.toggleSeverity('crit')"
    >
      <UiIcon name="critical" :size="12" :stroke="1.8" />
      {{ t('overview.crit', { n: counts.crit }) }}
    </button>
    <button
      v-if="counts.warn > 0"
      type="button"
      class="chip warn"
      :aria-pressed="selection.severity === 'warn'"
      :title="
        t('overviewScreen.chipFilter', {
          what: t('overview.warn', { n: counts.warn }, counts.warn),
        })
      "
      @click="selection.toggleSeverity('warn')"
    >
      <UiIcon name="warn" :size="12" :stroke="1.8" />
      {{ t('overview.warn', { n: counts.warn }, counts.warn) }}
    </button>
    <span v-if="servers" class="chip plain">{{ serverText }}</span>
    <span class="grow" />
    <span v-if="expected > 0 || reviewDue > 0" class="chip info">
      <UiIcon name="check-circle" :size="12" :stroke="1.8" />
      {{ expectedText }}
    </span>
  </div>
</template>

<style scoped>
.summary {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  flex: none;
  gap: 10px;
  line-height: normal;
}

.lead {
  color: var(--ink-2);
  font-size: var(--text-13);
}

.lead b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

button.chip {
  transition: box-shadow var(--dur-color) var(--ease-out);
}

button.chip:focus-visible {
  box-shadow: var(--focus-ring);
}

button.chip[aria-pressed='true'] {
  box-shadow: inset 0 0 0 1.5px currentcolor;
}

.chip.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.chip.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.chip.plain {
  background: var(--surface-1);
  color: var(--ink-2);
}

.chip.info {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.grow {
  flex-grow: 1;
}
</style>
