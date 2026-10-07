<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { PartRow } from '@/lib/project-overview'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'
import ProjectCard from '../common/ProjectCard.vue'
import { stateCell } from './part-text'

defineProps<{ rows: readonly PartRow[] }>()
const { t } = useI18n()
const fmt = useFormat()

const ICON: Record<PartRow['kind'], IconName> = {
  path: 'folder',
  pm2: 'terminal',
  compose: 'container',
  db: 'database',
}
const bytes = (v: number) => fmt.measure(v, 'bytes').text
const source = (r: PartRow) =>
  r.state.kind === 'db'
    ? t(`projectOverview.parts.source.${r.state.engine}`)
    : t(`projectOverview.parts.source.${r.kind}`)
const cell = (r: PartRow) => stateCell(r, t, bytes)
const cpu = (r: PartRow) => (r.cpu === null ? '—' : fmt.measure(r.cpu, '%').text)
const mem = (r: PartRow) => (r.mem === null ? '—' : bytes(r.mem))
</script>

<template>
  <ProjectCard
    icon="folder"
    :title="t('projectOverview.parts.title')"
    :meta="t('projectOverview.parts.meta')"
    :gap="6"
  >
    <ul v-if="rows.length > 0" class="rows" :aria-label="t('projectOverview.parts.label')">
      <li v-for="r in rows" :key="r.id" class="row">
        <b class="role" :class="`role-${r.role}`">{{
          t(`projectOverview.wiring.role.${r.role}`)
        }}</b>
        <UiIcon :name="ICON[r.kind]" :size="16" class="glyph" />
        <span class="muted">{{ source(r) }}</span>
        <span class="name mono">{{ r.name }}</span>
        <span class="muted mono">{{ r.host }}</span>
        <span class="state" :class="r.tone">{{ cell(r) }}</span>
        <span class="muted mono">{{ cpu(r) }}</span>
        <span class="muted mono">{{ mem(r) }}</span>
      </li>
    </ul>
    <p v-else class="none">{{ t('projectOverview.parts.none') }}</p>
  </ProjectCard>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 56px 20px 70px minmax(0, 1fr) 80px minmax(80px, 120px) 56px 64px;
  align-items: center;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.role {
  display: inline-flex;
  justify-content: center;
  padding: 2px 0;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--weight-semibold);
}

.role-fe {
  background: color-mix(in srgb, var(--role-fe) 12%, transparent);
  color: var(--role-fe);
}

.role-be {
  background: color-mix(in srgb, var(--role-be) 12%, transparent);
  color: var(--role-be);
}

.role-db {
  background: color-mix(in srgb, var(--role-db) 12%, transparent);
  color: var(--role-db);
}

.role-worker {
  background: color-mix(in srgb, var(--role-worker) 12%, transparent);
  color: var(--role-worker);
}

.glyph {
  color: var(--ink-3);
}

.muted {
  color: var(--ink-3);
}

.mono {
  font-family: var(--font-mono);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state.warn {
  color: var(--warn-ink);
}

.state.crit {
  color: var(--crit-ink);
}

.none {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
