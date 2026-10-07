<!--
  Containers of the server page, from the board "Server detail": every Compose container on
  the host across the projects that run there, grouped by project colour, with CPU, memory and
  restarts. A restart count that grew since the baseline turns amber with a ▲.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { Containers, ContainerRow } from '@/lib/server-containers'
import UiIcon from '@/ui/UiIcon.vue'
import { vEnter } from '@/lib/motion'

const props = defineProps<{
  host: string
  containers: Containers
  /** Colour of a Daminus project, `null` when it has none. */
  colorOf: (project: string) => string | null
  scope: string
}>()

const { t } = useI18n()
const fmt = useFormat()

const meta = computed(() =>
  t('serverScreen.containers.meta', {
    projects: t(
      'serverScreen.containers.projects',
      { n: props.containers.projects },
      props.containers.projects,
    ),
    running: props.containers.running,
  }),
)

function cpu(row: ContainerRow): string {
  return row.cpu === null
    ? '—'
    : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(row.cpu)}%`
}

function memory(row: ContainerRow): string {
  return row.mem === null ? '—' : fmt.measure(row.mem, 'bytes').text
}

const DOT: Record<ContainerRow['tone'], string> = {
  ok: 'var(--dot-ok)',
  warn: 'var(--dot-warn)',
  crit: 'var(--dot-crit)',
  idle: 'var(--dot-idle)',
}

function dot(row: ContainerRow): string {
  return DOT[row.tone]
}

function groupColor(row: ContainerRow): string {
  return (row.owner && props.colorOf(row.owner)) || 'var(--ink-5)'
}
</script>

<template>
  <section class="card" :aria-label="t('serverScreen.containers.title')">
    <h3 class="head">
      <UiIcon name="container" :size="16" class="mark" />
      {{ t('serverScreen.containers.title') }}
      <span class="meta">{{ meta }}</span>
    </h3>
    <template v-if="containers.rows.length > 0">
      <div class="cols" aria-hidden="true">
        <span />
        <span>{{ t('serverScreen.containers.name') }}</span>
        <span>{{ t('serverScreen.containers.project') }}</span>
        <span>{{ t('serverScreen.containers.cpu') }}</span>
        <span>{{ t('serverScreen.containers.memory') }}</span>
        <span>{{ t('serverScreen.containers.restarts') }}</span>
      </div>
      <ul class="list" :aria-label="t('serverScreen.containers.list', { host })">
        <li
          v-for="(row, i) in containers.rows"
          :key="`${scope}:${row.id}`"
          v-enter="{ index: i, kind: 'reveal', once: `${scope}:container:${row.id}` }"
          class="row"
        >
          <span
            class="dot"
            :style="{ background: dot(row) }"
            :title="t('serverScreen.containers.state', { name: row.name, state: row.state })"
          />
          <span class="sr-only">{{
            t('serverScreen.containers.state', { name: row.name, state: row.state })
          }}</span>
          <span class="name mono" :title="row.name">{{ row.name }}</span>
          <span class="project"
            ><i class="swatch" :style="{ background: groupColor(row) }" />{{ row.compose }}</span
          >
          <span class="mono">{{ cpu(row) }}</span>
          <span class="mono">{{ memory(row) }}</span>
          <span class="mono restarts" :class="{ grew: row.grew !== null && row.grew > 0 }">
            {{ row.restarts }}
            <template v-if="row.grew !== null && row.grew > 0">
              <span aria-hidden="true"> ▲</span>
              <span class="sr-only">{{
                t('serverScreen.containers.restartsGrew', { n: row.grew }, row.grew)
              }}</span>
            </template>
          </span>
        </li>
      </ul>
    </template>
    <p v-else class="empty">{{ t('serverScreen.containers.empty') }}</p>
  </section>
</template>

<style scoped>
.card {
  --dot-ok: var(--ok-solid);
  --dot-warn: var(--warn-solid);
  --dot-crit: var(--crit-solid);
  --dot-idle: var(--ink-5);
  --cols: 10px minmax(0, 1fr) 84px 64px 72px 76px;

  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.mark {
  flex: none;
  color: var(--ink-3);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.cols,
.row {
  display: grid;
  grid-template-columns: var(--cols);
  gap: var(--space-3);
  align-items: center;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

.cols {
  height: 20px;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  height: 36px;
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  color: var(--ink-2);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swatch {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.restarts {
  color: var(--ink-3);
}

.restarts.grew {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}

.empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
