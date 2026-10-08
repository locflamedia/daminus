<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ENV_FORMS,
  GROUP_COMMAND,
  listEnvCommand,
  sudoRuleLine,
  tryLoginCommand,
  type DbEngineName,
  engineOf,
} from '@/lib/project-database'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import UiIcon from '@/ui/UiIcon.vue'
import ProjectPermissionCard, { type PermissionStep } from '../common/ProjectPermissionCard.vue'
import type { DbSection } from './use-database-model'

const props = defineProps<{ section: DbSection }>()

const ICONS = { refused: 'database', unsupported: 'file', missing: 'circle' } as const
const { t } = useI18n()

const host = computed(() => props.section.item.key.host)
const database = computed(() => props.section.item.key.target)
const envFile = computed(() => props.section.part?.env_file ?? '')
const engine = computed<DbEngineName>(() => engineOf(props.section.part?.engine))
const login = computed(() => tryLoginCommand(host.value, engine.value))
const client = computed(() => (engine.value === 'postgres' ? 'psql' : 'mysql'))

const steps = computed<PermissionStep[]>(() => [
  {
    title: t('projectDatabase.perm.listTitle'),
    command: envFile.value ? listEnvCommand(host.value, envFile.value) : null,
  },
  {
    title: t('projectDatabase.perm.groupTitle'),
    text: t('projectDatabase.perm.groupText'),
    command: GROUP_COMMAND,
  },
  {
    title: t('projectDatabase.perm.sudoTitle'),
    text: t('projectDatabase.perm.sudoText', { host: host.value }),
    command: envFile.value ? sudoRuleLine(envFile.value) : null,
  },
  {
    title: t('projectDatabase.perm.loginTitle'),
    text: t('projectDatabase.perm.loginText', { database: database.value }),
    command: login.value,
  },
])
</script>

<template>
  <ProjectPermissionCard
    v-if="section.problem === 'permission'"
    :title="t('projectDatabase.perm.title', { name: database, host })"
    :text="t('projectDatabase.perm.text')"
    :steps="steps"
    :note="t('projectDatabase.perm.again')"
    :host="host"
  />
  <section v-else class="state">
    <header class="head">
      <span class="tile" :class="{ warm: section.problem === 'refused' }" aria-hidden="true">
        <UiIcon :name="ICONS[section.problem ?? 'missing']" :size="14" />
      </span>
      <h3 class="title">
        {{
          section.problem === 'refused'
            ? t('projectDatabase.refused.title')
            : section.problem === 'unsupported'
              ? t('projectDatabase.unsupported.title')
              : t('projectDatabase.missing.title')
        }}
      </h3>
    </header>

    <template v-if="section.problem === 'refused'">
      <p class="text">{{ t('projectDatabase.refused.text', { host }) }}</p>
      <template v-if="login">
        <span class="sub">{{ t('projectDatabase.refused.tryTitle') }}</span>
        <UiCommandCopy :command="login" />
      </template>
      <p class="muted">{{ t('projectDatabase.refused.why', { database }) }}</p>
    </template>

    <template v-else-if="section.problem === 'unsupported'">
      <p class="text">{{ t('projectDatabase.unsupported.text') }}</p>
      <span class="sub">{{ t('projectDatabase.unsupported.read') }}</span>
      <div class="tags">
        <code v-for="f in ENV_FORMS" :key="f" class="tag">{{ f }}</code>
      </div>
      <span class="sub">{{ t('projectDatabase.unsupported.notRead') }}</span>
      <p class="muted"><code>${VAR}</code>, {{ t('projectDatabase.unsupported.notReadText') }}</p>
      <p class="muted">{{ t('projectDatabase.unsupported.fix', { path: envFile || '.env' }) }}</p>
    </template>

    <template v-else>
      <p class="text">{{ t('projectDatabase.missing.text') }}</p>
      <p class="text">
        <b>{{ t('projectDatabase.missing.env', { path: envFile || '.env' }) }}</b>
        · {{ t('projectDatabase.missing.envFix') }}
      </p>
      <p class="text">
        <b>{{ t('projectDatabase.missing.client', { client, host }) }}</b>
        · {{ t('projectDatabase.missing.clientFix') }}
      </p>
      <p class="text">
        <b>{{
          t('projectDatabase.missing.container', { name: section.part?.container ?? '—' })
        }}</b>
        · {{ t('projectDatabase.missing.containerFix') }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tile {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--surface-1);
  color: var(--ink-4);
}

.tile.warm {
  background: var(--warn-soft);
  color: var(--warn-solid);
}

.title {
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.text,
.muted {
  margin: 0;
  font-size: var(--text-12);
  line-height: 1.45;
}

.text {
  color: var(--ink-2);
}

.text b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.muted {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.sub {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  border-radius: var(--radius-xs);
  background: var(--surface-1);
  font-family: var(--font-mono);
  font-size: var(--text-11);
}

code {
  font-family: var(--font-mono);
}
</style>
