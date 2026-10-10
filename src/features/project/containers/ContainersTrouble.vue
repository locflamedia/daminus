<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import {
  logsCommand,
  raisedLimit,
  statsCommand,
  troubleKind,
  type ServiceView,
} from '@/lib/project-containers'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import ProjectCard from '../common/ProjectCard.vue'
import ProjectCurve from '../common/ProjectCurve.vue'

const props = defineProps<{
  host: string
  service: ServiceView
  memory: readonly { seq: number; value: number }[]
  peak: number | null
  also: readonly ServiceView[]
  hostMemory: { used: number; total: number } | null
  id: string
}>()

const { t } = useI18n()
const fmt = useFormat()

/** A service name starts the sentence: the board writes "Worker hits its limit". */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const kind = computed(() => troubleKind(props.service))
const logs = computed(() => logsCommand(props.host, props.service.name))
const stats = computed(() => statsCommand(props.host, props.service.name))
const limit = computed(() =>
  props.service.limit === null ? null : fmt.measure(props.service.limit, 'bytes').text,
)
// docker inspect's start time as a clock time ("13:19"), with the date when it was not today.
const time = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toDateString() === new Date().toDateString()
    ? fmt.clock(iso)
    : fmt.dateTime(iso)
}

const title = computed(() => sentence(rawTitle.value))
const rawTitle = computed(() => {
  const name = props.service.svc
  if (kind.value === 'oom') {
    return limit.value
      ? t('projectContainers.finding.oomLimit', { name, limit: limit.value })
      : t('projectContainers.finding.oom', { name })
  }
  return kind.value === 'down'
    ? t('projectContainers.finding.down', { name })
    : t('projectContainers.finding.restarted', { name, n: props.service.restarts })
})
const text = computed(() => {
  const s = props.service
  if (kind.value === 'oom') {
    return limit.value
      ? t('projectContainers.finding.oomTextLimit', {
          n: s.restarts,
          name: s.svc,
          limit: limit.value,
        })
      : t('projectContainers.finding.oomText', { n: s.restarts, name: s.svc })
  }
  return kind.value === 'down'
    ? t('projectContainers.finding.downText', { state: s.state, exit: s.exit ?? '—' })
    : t('projectContainers.finding.restartedText')
})
const raised = computed(() => raisedLimit(props.service.limit, props.hostMemory))
const hostNote = computed(() => {
  const m = props.hostMemory
  if (!m) return ''
  const used = fmt.measure(m.used, 'bytes').text
  const total = fmt.measure(m.total, 'bytes').text
  return raised.value !== null && kind.value === 'oom'
    ? t('projectContainers.finding.hostMemoryFits', {
        used,
        total,
        name: props.service.svc,
        target: fmt.measure(raised.value, 'bytes').text,
      })
    : t('projectContainers.finding.hostMemory', { used, total })
})
const peakNote = computed(() => {
  if (props.peak === null) return ''
  const peak = fmt.measure(props.peak, 'bytes').text
  return limit.value
    ? t('projectContainers.exit.peak', { peak, limit: limit.value })
    : t('projectContainers.exit.peakOnly', { peak })
})
const memoryLabel = computed(() =>
  t('projectContainers.exit.memoryLabel', {
    name: props.service.svc,
    n: props.memory.length,
    peak: props.peak === null ? '—' : fmt.measure(props.peak, 'bytes').text,
  }),
)
</script>

<template>
  <div class="trouble">
    <ProjectCard
      icon="terminal"
      :title="t('projectContainers.exit.title', { name: service.svc })"
      :meta="t('projectContainers.exit.meta')"
      :gap="8"
    >
      <div class="code">
        <div>
          <span class="dim">{{ t('projectContainers.exit.state') }}</span>
          {{ t('projectContainers.exit.oom') }}
          <span :class="{ hl: service.oom }">{{
            service.oom ? t('projectContainers.exit.yes') : t('projectContainers.exit.no')
          }}</span>
          · {{ t('projectContainers.exit.code') }} {{ service.exit ?? '—' }}
        </div>
        <div>
          <span class="dim">{{ t('projectContainers.exit.started') }}</span>
          {{ time(service.started) }} ·
          <span class="dim">{{ t('projectContainers.exit.image') }}</span>
          {{ service.image || '—' }} ·
          <span class="dim">{{ t('projectContainers.exit.restarts') }}</span> {{ service.restarts }}
        </div>
      </div>
      <template v-if="logs">
        <span class="sub">{{ t('projectContainers.exit.seeWhy') }}</span>
        <UiCommandCopy :command="logs" />
      </template>
      <span class="note">{{ t('projectContainers.exit.noLogs') }}</span>
      <template v-if="memory.length > 2">
        <span class="sub top">
          {{ t('projectContainers.exit.memoryTitle', { name: service.svc, n: memory.length }) }}
        </span>
        <ProjectCurve
          :values="memory.map((p) => p.value)"
          tone="amber"
          straight
          :height="120"
          :limit="service.limit ?? undefined"
          :limit-label="limit ? t('projectContainers.exit.limit', { size: limit }) : undefined"
          :label="memoryLabel"
          :once="`containers-mem-${id}-${service.name}`"
        />
        <span class="note">{{ peakNote }}</span>
      </template>
    </ProjectCard>

    <ProjectCard icon="warn" tone="warn" :title="title" :gap="8">
      <p class="body">{{ text }}</p>
      <UiCommandCopy v-if="stats" :command="stats" />
      <template v-if="also.length > 0">
        <span class="sub top">{{ t('projectContainers.finding.also', { host }) }}</span>
        <ul class="rows">
          <li v-for="s in also" :key="s.name" class="row">
            <i class="dot" :class="{ off: s.state !== 'running' }" />
            <span class="mono">{{ s.name }}</span>
            <span class="muted mono">{{
              s.cpu === null ? '—' : fmt.measure(s.cpu, '%', { maximumFractionDigits: 1 }).text
            }}</span>
            <span class="muted mono">{{
              s.mem === null ? '—' : fmt.measure(s.mem, 'bytes').text
            }}</span>
          </li>
        </ul>
      </template>
      <span v-if="hostNote" class="note">{{ hostNote }}</span>
    </ProjectCard>
  </div>
</template>

<style scoped>
.trouble {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: var(--space-3);
  align-items: stretch;
}

@media (max-width: 1079px) {
  .trouble {
    grid-template-columns: minmax(0, 1fr);
  }
}

.code {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--code);
  color: var(--code-ink);
  font: 400 11px/1.65 var(--font-mono);
}

.dim {
  color: var(--code-dim);
}

.hl {
  color: var(--code-hl);
}

.sub {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.sub.top {
  margin-top: 6px;
}

.note {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.body {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) 70px 70px;
  align-items: center;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 10px;
  font-size: var(--text-12);
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.mono {
  font-family: var(--font-mono);
}

.muted {
  color: var(--ink-3);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--ok-solid);
}

.dot.off {
  background: var(--crit-solid);
}
</style>
