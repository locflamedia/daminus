<!--
  One part of a project as a row: role tag, a neutral mark for its kind (the stack logos are not
  bundled), source kind and name, host, and what discover saw of it. A database part that is
  missing its `.env` shows the amber row with "Choose .env", which reveals a field for the
  absolute path; Daminus cannot check that path, the server does at scan time.
-->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SetupRecord } from '@/api'
import { engineName, liveText, partSource } from '@/lib/group-view'
import { type DraftPart, isAbsPath } from '@/lib/setup-model'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'
import RoleTag from '../components/RoleTag.vue'

const props = defineProps<{
  part: DraftPart
  records: readonly SetupRecord[]
  /** `.env` files known for the project; with none, a database part offers "Choose .env". */
  hasEnvFiles: boolean
}>()
const emit = defineEmits<{ chooseEnv: [path: string] }>()

const { t } = useI18n()

const MARKS: Record<DraftPart['kind'], IconName> = {
  path: 'folder',
  pm2: 'terminal',
  compose: 'container',
  db: 'database',
}

const source = computed(() => partSource(props.part))
const name = computed(() => engineName(props.part, props.records))
const live = computed(() => liveText(props.part, props.records))
const noEnv = computed(
  () => props.part.kind === 'db' && props.part.envFile === '' && !props.hasEnvFiles,
)

const choosing = ref(false)
const path = ref('')
const bad = ref(false)
const field = ref<HTMLInputElement>()

function startChoosing() {
  choosing.value = true
  void nextTick(() => field.value?.focus())
}

function cancel() {
  choosing.value = false
  bad.value = false
  path.value = ''
}

function commit() {
  const value = path.value.trim()
  if (value === '') return cancel()
  if (!isAbsPath(value)) {
    bad.value = true
    return
  }
  bad.value = false
  emit('chooseEnv', value)
  choosing.value = false
  path.value = ''
}
</script>

<template>
  <div class="row" :data-testid="`part-${part.key}`" :class="{ amber: noEnv }">
    <RoleTag :role="part.role" />
    <span class="mark" aria-hidden="true"><UiIcon :name="MARKS[part.kind]" :size="14" /></span>
    <span class="src">
      <span class="k">{{ t(`setupGroup.source.${source.kind}`) }}</span>
      <span class="mono">{{ name }}</span>
    </span>
    <span class="host mono">{{ part.host }}</span>
    <span class="state">
      <template v-if="noEnv">
        <template v-if="!choosing">
          <span class="warn"><UiIcon name="warn" :size="12" />{{ t('setupGroup.db.noEnv') }}</span>
          <UiButton size="small" data-testid="choose-env" @click="startChoosing">{{
            t('setupGroup.db.chooseEnv')
          }}</UiButton>
        </template>
        <span v-else class="pathbox" :class="{ bad }">
          <input
            ref="field"
            v-model="path"
            class="mono"
            type="text"
            data-testid="env-path"
            :aria-label="t('setupGroup.db.envPathLabel')"
            :aria-invalid="bad || undefined"
            :placeholder="t('setupGroup.db.envPathPlaceholder')"
            :title="bad ? t('setupGroup.db.envPathBad') : t('setupGroup.db.envPathUnchecked')"
            @keydown.enter.prevent="commit"
            @keydown.esc.stop="cancel"
            @blur="commit"
          />
        </span>
      </template>
      <span v-else-if="live" class="ok" :class="{ attn: live.tone === 'warn' }">
        <UiIcon :name="live.tone === 'ok' ? 'check' : 'warn'" :size="12" :stroke="1.8" />
        <span>{{ t(live.words.key, live.words.params, live.words.n ?? 0) }}</span>
      </span>
    </span>
  </div>
  <p v-if="choosing && bad" class="bad-note" role="alert">{{ t('setupGroup.db.envPathBad') }}</p>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 64px 24px minmax(0, 1fr) 96px 200px;
  gap: var(--space-3);
  align-items: center;
  height: var(--h-row);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.row.amber {
  background: var(--warn-soft);
}

.mark {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--ink-3);
}

.src {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-12);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.k {
  color: var(--ink-3);
}

.host {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.state {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.ok {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  color: var(--ok-ink);
  font-size: var(--text-11);
  white-space: nowrap;
}

.ok span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ok.attn,
.warn {
  color: var(--warn-ink);
}

.warn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-11);
  white-space: nowrap;
}

.pathbox {
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: 7px;
  background: var(--surface-0);
  box-shadow: 0 0 0 2px var(--accent-mid);
}

.pathbox.bad {
  box-shadow: 0 0 0 2px var(--crit-solid);
}

.pathbox input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font-size: var(--text-11);
}

.bad-note {
  margin: 0;
  padding: 0 var(--space-2);
  color: var(--crit-ink);
  font-size: var(--text-11);
}
</style>
