<!--
  The part of a database that discovery cannot know: which `.env` this app uses and the name of
  the database. Daminus never reads a `.env`, so the name is typed; only the path of the file
  and the name are kept. A part without a name is left out of projects.json until it has one,
  and the note says so with the real project name.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isIncomplete, type DraftPart } from '@/lib/setup-model'
import UiField from '@/ui/UiField.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiSelect, { type SelectOption } from '@/ui/UiSelect.vue'
import RoleTag from '../components/RoleTag.vue'

type DbPart = Extract<DraftPart, { kind: 'db' }>

const props = defineProps<{
  part: DbPart
  envFiles: readonly string[]
  projectName: string
}>()
const emit = defineEmits<{ patch: [patch: { envFile?: string; database?: string }] }>()

const { t } = useI18n()

const options = computed<SelectOption[]>(() => {
  const all = props.envFiles.includes(props.part.envFile)
    ? [...props.envFiles]
    : [props.part.envFile, ...props.envFiles].filter((p) => p !== '')
  return all.map((value) => ({ value, label: value }))
})
const others = computed(() => props.envFiles.filter((p) => p !== props.part.envFile))
const missing = computed(() => isIncomplete(props.part))
const nameMissing = computed(() => props.part.database.trim() === '')
</script>

<template>
  <div class="editor" :data-testid="`db-editor-${part.key}`">
    <div class="head">
      <RoleTag role="db" />
      <span class="dim">{{ t('setupGroup.db.engine') }}</span>
      <span class="mono">{{ part.engine }}</span>
      <span class="dim">{{ t('setupGroup.db.on') }}</span>
      <span class="mono">{{ part.host }}</span>
      <span class="dim">{{ t('setupGroup.db.container') }}</span>
      <span class="mono">{{ part.container ?? t('setupGroup.db.none') }}</span>
      <span class="grow" />
      <span v-if="missing" class="chip" data-testid="needs-name">
        <UiIcon name="warn" :size="12" />{{ t('setupGroup.db.needsName') }}
      </span>
    </div>

    <div class="cols">
      <div class="env">
        <UiSelect
          :model-value="part.envFile"
          :options="options"
          :label="t('setupGroup.db.envLabel', { n: envFiles.length }, envFiles.length)"
          @update:model-value="(value) => emit('patch', { envFile: value })"
        />
        <div v-if="others.length > 0" class="also">
          <span class="dim">{{ t('setupGroup.db.alsoFound') }}</span>
          <button
            v-for="path in others"
            :key="path"
            type="button"
            class="path mono"
            @click="emit('patch', { envFile: path })"
          >
            {{ path }}
          </button>
        </div>
      </div>

      <div class="name" :class="{ required: nameMissing }" data-testid="db-name">
        <UiField
          :model-value="part.database"
          :label="t('setupGroup.db.nameLabel')"
          :placeholder="t('setupGroup.db.namePlaceholder')"
          :hint="nameMissing ? t('setupGroup.db.nameHelp') : undefined"
          mono
          @update:model-value="(value) => emit('patch', { database: value })"
        >
          <template v-if="!nameMissing" #trailing>
            <span class="tick" :title="t('setupGroup.db.nameSet')">
              <UiIcon name="check" :size="14" :stroke="1.8" />
              <span class="sr-only">{{ t('setupGroup.db.nameSet') }}</span>
            </span>
          </template>
        </UiField>
      </div>
    </div>

    <p v-if="missing" class="note" data-testid="save-allowed">
      <UiIcon name="warn" :size="14" />
      <span
        ><b>{{ t('setupGroup.db.saveAllowedLead') }}</b>
        {{ t('setupGroup.db.saveAllowedBody', { project: projectName }) }}</span
      >
    </p>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: var(--space-1) var(--space-2) var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-well);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--text-12);
}

.dim {
  color: var(--ink-3);
}

.grow {
  flex-grow: 1;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.env {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.also {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px var(--space-2);
  font-size: var(--text-11);
}

.path {
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  background: var(--surface-1);
  color: var(--ink-2);
  font-size: var(--text-11);
}

.path:hover {
  background: var(--surface-2);
}

.path:focus-visible {
  box-shadow: var(--focus-ring);
}

/* The required name has the amber outline until it is filled. */
.required :deep(.control) {
  box-shadow: inset 0 0 0 1.5px var(--warn-solid);
}

.required :deep(.note) {
  color: var(--warn-ink);
}

.tick {
  display: inline-grid;
  place-items: center;
  padding-right: var(--space-2);
  color: var(--ok-ink);
}

.note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: var(--text-12);
  line-height: 1.45;
}

.note :deep(.icon) {
  flex: none;
  margin-top: 2px;
}

.note b {
  font-weight: var(--weight-medium);
}
</style>
