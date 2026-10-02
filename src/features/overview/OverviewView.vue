<!--
  Stands in for the designed Overview: it runs the real scan flow (start, stop, host
  progress, results) inside the real layout, in either theme and language. The cards,
  servers strip and change list of the board replace this body.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HostProgress, Item } from '@/api'
import { useFormat } from '@/composables/use-format'
import { checkName, errorText, severityText } from '@/lib/issue-text'
import { useLayoutRange } from '@/lib/viewport'
import PageHeader from '@/layout/PageHeader.vue'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import { useScanStore } from '@/stores/scan'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import { vEnter } from '@/lib/motion'

const { t } = useI18n()
const fmt = useFormat()
const scan = useScanStore()
const reports = useReportStore()
const projects = useProjectsStore()
const range = useLayoutRange()

const report = computed(() => reports.latest)

// --- toolbar ---------------------------------------------------------------------------

const now = ref(Date.now())
let ticker: number | undefined
watch(
  () => scan.scanning,
  (running) => {
    window.clearInterval(ticker)
    if (running) {
      now.value = Date.now()
      ticker = window.setInterval(() => (now.value = Date.now()), 200)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => window.clearInterval(ticker))

const meta = computed(() => {
  const seq = report.value?.seq
  if (scan.run) {
    const elapsed = Math.max(0, now.value - Date.parse(scan.run.started_at))
    return t('toolbar.scanMetaRunning', { seq: (seq ?? 0) + 1, elapsed: fmt.duration(elapsed) })
  }
  if (seq != null && report.value?.scanned_at) {
    return t('toolbar.scanMeta', {
      seq,
      when: fmt.when(report.value.scanned_at, { withToday: true }),
    })
  }
  return t('toolbar.noScan')
})

/** Hosts of the running scan; `@local` is the URL checks run from this Mac. */
const hosts = computed(() =>
  Object.entries(scan.run?.hosts ?? {}).flatMap(([host, p]) =>
    p && host !== '@local' ? [{ host, progress: p }] : [],
  ),
)
const urlProgress = computed(() => scan.run?.hosts['@local'])
const hostsDone = computed(() => hosts.value.filter((h) => h.progress.state === 'finished').length)
const fraction = computed(() =>
  hosts.value.length === 0 ? 0 : hostsDone.value / hosts.value.length,
)

function chipTone(p: HostProgress): string {
  if (p.state === 'finished') {
    if (p.outcome.state === 'reached') return 'ok'
    return p.outcome.state === 'partial' ? 'warn' : 'crit'
  }
  return p.state === 'queued' ? 'idle' : 'busy'
}

function chipText(p: HostProgress): string {
  return t(`scanHost.${p.state === 'finished' ? p.outcome.state : p.state}`)
}

// --- keyboard --------------------------------------------------------------------------

function onKeydown(e: KeyboardEvent) {
  if (e.metaKey && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    if (!scan.scanning) void scan.start()
  } else if (e.key === 'Escape' && !e.defaultPrevented && scan.scanning) {
    void scan.stop()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// --- results ---------------------------------------------------------------------------

const ORDER: Record<string, number> = { crit: 0, warn: 1, unknown: 2, info: 3, ok: 4 }

const rows = computed(() => {
  const items: readonly Item[] = report.value?.items ?? []
  return [...items]
    .sort(
      (a, b) =>
        (ORDER[a.severity.level] ?? 5) - (ORDER[b.severity.level] ?? 5) ||
        a.key.host.localeCompare(b.key.host) ||
        a.key.check.localeCompare(b.key.check) ||
        a.key.target.localeCompare(b.key.target),
    )
    .map((item) => ({
      id: `${item.key.host}|${item.key.check}|${item.key.target}`,
      level: item.severity.level,
      severity: severityText(item.severity),
      name: checkName(item.key.check),
      host: item.key.host,
      target: item.key.target,
      value: item.fact?.value == null ? '' : fmt.measure(item.fact.value, item.fact.unit).text,
      note:
        item.disposition.kind === 'expected'
          ? t('severity.expected')
          : item.disposition.kind === 'stale'
            ? t('severity.stale', { seq: item.disposition.since_seq })
            : item.delta?.kind === 'new' || item.delta?.kind === 'fixed'
              ? t(`delta.${item.delta.kind}`)
              : '',
    }))
})

const errorMessage = computed(() => {
  const error = scan.error ?? reports.error
  return error ? errorText(error) : ''
})

const counts = computed(() => report.value?.counts)
const expected = computed(() => counts.value?.expected ?? 0)
const reviewDue = computed(() => report.value?.rules_due.length ?? 0)

/** "6 issues across 3 projects and 5 servers", or "No issues across ..." when clear. */
const summary = computed(() => {
  const named = {
    projects: t('overview.projectCount', { n: projects.projects.length }, projects.projects.length),
    servers: t('overview.serverCount', { n: projects.servers.length }, projects.servers.length),
  }
  return projects.issues > 0
    ? t('overview.summary', {
        issues: t('nav.issues', { n: projects.issues }, projects.issues),
        ...named,
      })
    : t('overview.clear', named)
})

/** "2 expected · 1 review due": rules apart from the issue count, in accent. */
const expectedText = computed(() => {
  const head = t('overview.expected', { n: expected.value })
  return reviewDue.value > 0 ? `${head} · ${t('overview.reviewDue', { n: reviewDue.value })}` : head
})

const narrow = computed(() => range.value === 'narrow')
const scanLabel = computed(() => (narrow.value ? t('toolbar.scan') : `↳ ${t('toolbar.scanAll')}`))
</script>

<template>
  <div class="overview">
    <div v-if="scan.scanning" class="scan-line" aria-hidden="true"><i /></div>

    <PageHeader :title="t('nav.overview')" :meta="meta">
      <template #actions>
        <template v-if="scan.scanning">
          <span class="progress">
            <b>{{ t('toolbar.hostsOf', { done: hostsDone, total: hosts.length }) }}</b>
            <span class="track"><i :style="{ transform: `scaleX(${fraction})` }" /></span>
            <span v-if="urlProgress" class="urls">
              {{ t('toolbar.urlChecks') }}
              <template v-if="urlProgress.state === 'finished'">✓</template>
            </span>
          </span>
          <button type="button" class="btn" @click="scan.stop()">
            {{ t('toolbar.stop') }}<UiKbd>esc</UiKbd>
          </button>
        </template>
        <button v-else type="button" class="btn primary" @click="scan.start()">
          <UiIcon v-if="narrow" name="refresh" />
          {{ scanLabel }}
          <UiKbd v-if="!narrow" tone="on-button">⌘R</UiKbd>
        </button>
      </template>
    </PageHeader>

    <p v-if="errorMessage" class="banner" role="alert">
      <UiIcon name="critical" />
      <span>{{ errorMessage }}</span>
    </p>

    <div v-if="scan.scanning" class="chips">
      <span v-for="h in hosts" :key="h.host" class="host-chip" :class="chipTone(h.progress)">
        <span class="mono">{{ h.host }}</span>
        <span class="state">{{ chipText(h.progress) }}</span>
      </span>
      <span class="grow" />
      <span class="note">{{ t('toolbar.orderHolds') }}</span>
    </div>

    <div v-else-if="report && report.seq != null && counts" class="summary">
      <span class="lead">
        <b v-if="projects.issues > 0">{{ summary }}</b>
        <template v-else>{{ summary }}</template>
      </span>
      <span v-if="counts.crit > 0" class="chip crit">
        <UiIcon name="critical" :size="12" :stroke="1.8" />
        {{ t('overview.crit', { n: counts.crit }) }}
      </span>
      <span v-if="counts.warn > 0" class="chip warn">
        <UiIcon name="warn" :size="12" :stroke="1.8" />
        {{ t('overview.warn', { n: counts.warn }, counts.warn) }}
      </span>
      <span class="grow" />
      <span v-if="expected > 0 || reviewDue > 0" class="chip info">
        <UiIcon name="check-circle" :size="12" :stroke="1.8" />
        {{ expectedText }}
      </span>
    </div>

    <p v-else-if="!scan.scanning && !errorMessage" class="empty">{{ t('overview.firstScan') }}</p>

    <section v-if="rows.length" :key="report?.seq ?? 'none'" class="results">
      <h2 class="section">
        {{ t('overview.results') }} <span>{{ rows.length }}</span>
      </h2>
      <ul class="rows">
        <li v-for="(r, i) in rows" :key="r.id" v-enter="{ index: Math.min(i, 10) }" class="row">
          <span class="pill" :class="r.level">{{ r.severity }}</span>
          <span class="what">
            {{ r.name }}
            <span v-if="r.target" class="mono target">{{ r.target }}</span>
          </span>
          <span class="mono host">{{ r.host }}</span>
          <span class="value">{{ r.value }}</span>
          <span class="note">{{ r.note }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.scan-line {
  position: absolute;
  top: 0;
  right: calc(-1 * var(--space-8));
  left: calc(-1 * var(--space-8));
  z-index: 3;
  height: 2px;
  overflow: hidden;
}

.scan-line i {
  display: block;
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: sweep 1.4s var(--ease-in-out) infinite;
}

@keyframes sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(340%);
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-control);
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  transition: transform var(--dur-press) var(--ease-out);
}

.btn:active {
  transform: scale(0.97);
}

.btn.primary {
  background: var(--btn);
  box-shadow: var(--shadow-primary);
  color: var(--btn-ink);
}

.btn:focus-visible {
  box-shadow: var(--focus-ring);
}

.progress {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
  font-size: var(--text-12);
}

.progress b {
  font-weight: var(--weight-medium);
}

.track {
  width: 120px;
  height: 4px;
  border-radius: 2px;
  background: var(--surface-2);
  overflow: hidden;
}

.track i {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--wash-1));
  transform-origin: left;
  transition: transform 300ms var(--ease-out);
}

.urls {
  color: var(--ink-3);
}

.banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--h-status-row);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--crit-soft);
  color: var(--crit-ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.host-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--h-control-sm);
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.host-chip .state {
  font-weight: var(--weight-regular);
}

.host-chip.ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.host-chip.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.host-chip.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.host-chip.busy {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.host-chip.idle {
  background: var(--surface-1);
  color: var(--ink-3);
}

.grow {
  flex-grow: 1;
}

.note {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
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

.chip.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.chip.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.chip.info {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.empty {
  color: var(--ink-3);
  font-size: var(--text-13);
}

.results {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.section {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.section span {
  color: var(--ink-3);
  font-weight: var(--weight-regular);
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) minmax(0, 140px) 88px minmax(0, 120px);
  align-items: center;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

.row:nth-child(odd) {
  background: var(--surface-1);
}

.pill {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  height: 20px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.pill.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.pill.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.pill.ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.pill.info {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.what,
.host,
.value,
.note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target {
  margin-left: var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-11);
}

.host {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.value {
  font-weight: var(--weight-medium);
  text-align: right;
}

@media (prefers-reduced-motion: reduce) {
  .scan-line i {
    animation: none;
    width: 100%;
    opacity: 0.4;
  }
}
</style>
