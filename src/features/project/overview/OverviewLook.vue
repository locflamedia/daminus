<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { checkName, issueText } from '@/lib/issue-text'
import { vEnter } from '@/lib/motion'
import type { LookRow } from '@/lib/project-overview'
import UiIcon from '@/ui/UiIcon.vue'
import ProjectCard from '../common/ProjectCard.vue'

const props = defineProps<{ id: string; rows: readonly LookRow[] }>()
const { t } = useI18n()

const meta = computed(() => {
  const crit = props.rows.filter((r) => r.level === 'crit').length
  const warn = props.rows.filter((r) => r.level === 'warn').length
  const perm = props.rows.filter((r) => r.needsPermission).length
  return [
    crit ? t('projectOverview.look.critical', { n: crit }) : '',
    warn ? t('projectOverview.look.warnings', { n: warn }, warn) : '',
    perm ? t('projectOverview.look.permission', { n: perm }) : '',
  ]
    .filter(Boolean)
    .join(' · ')
})
const title = (r: LookRow) =>
  r.needsPermission
    ? t('projectOverview.look.permissionTitle', { check: checkName(r.issue.key.check) })
    : issueText(r.issue)
const to = (r: LookRow) =>
  'tab' in r.target
    ? r.target.tab === 'overview'
      ? undefined
      : { name: 'project', params: { id: props.id, tab: r.target.tab } }
    : { name: 'server', params: { host: r.target.host } }
const linkText = (r: LookRow) =>
  'tab' in r.target ? t(`project.tabs.${r.target.tab}`) : t('projectOverview.look.server')
const sub = (r: LookRow) => `${r.issue.key.check} · ${r.issue.key.target || r.issue.key.host}`
</script>

<template>
  <ProjectCard icon="warn" :title="t('projectOverview.look.title')" :meta="meta" :gap="8">
    <ul v-if="rows.length > 0" class="rows">
      <li
        v-for="(r, i) in rows"
        :key="r.id"
        v-enter="{ index: 5 + i }"
        class="row"
        :class="r.level"
      >
        <span class="tile"
          ><UiIcon :name="r.level === 'unknown' ? 'lock' : 'warn'" :size="14"
        /></span>
        <div class="words">
          <b class="title" :title="title(r)">{{ title(r) }}</b>
          <span class="sub">{{ sub(r) }}</span>
        </div>
        <RouterLink v-if="to(r)" class="link" :to="to(r)!">{{ linkText(r) }} ›</RouterLink>
      </li>
    </ul>
    <div v-else class="row calm">
      <span class="tile"><UiIcon name="check-circle" :size="14" /></span>
      <div class="words">
        <b class="title">{{ t('projectOverview.look.none') }}</b>
        <span class="sub plain">{{ t('projectOverview.look.noneText') }}</span>
      </div>
    </div>
  </ProjectCard>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 10px;
  border-radius: 12px;
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.row.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.row.unknown,
.row.calm {
  background: var(--surface-1);
  color: var(--ink-2);
}

.row.calm {
  display: flex;
  gap: 10px;
}

.tile {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  background: var(--surface-0);
}

.words {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.title {
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

/* A finding's title runs to a second line rather than being cut: the column is as wide as the
   board's, and real titles are longer than its sample. */
.rows .title {
  display: -webkit-box;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.sub {
  overflow: hidden;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub.plain {
  font-family: var(--font-sans);
  font-size: var(--text-11);
}

.link {
  color: inherit;
  white-space: nowrap;
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}
</style>
