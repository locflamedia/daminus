<!--
  The details of a database part, inline under its row (never a second modal): the database
  name, the `.env` on the server that holds its credentials, and an optional container. Only
  the path of the `.env` is kept here; the values are read on the server at scan time.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Project, ProjectIssue } from '@/api'
import { badPath } from '@/lib/sheet-parts'
import type { DraftPart } from '@/lib/setup-model'
import UiIcon from '@/ui/UiIcon.vue'
import SheetInput from './SheetInput.vue'
import { useSheet } from './sheet-context'

type DbPart = Extract<DraftPart, { kind: 'db' }>

const props = defineProps<{ part: DbPart; issues?: readonly ProjectIssue[]; project?: Project }>()
const { t } = useI18n()
const sheet = useSheet()

function patch(change: Partial<DbPart>) {
  sheet.replacePart({ ...props.part, ...change })
}
const envBad = () => badPath(props.part) && sheet.isShown(`part:${props.part.key}`)
</script>

<template>
  <div class="db">
    <div class="fields">
      <label class="field">
        <span class="label">{{ t('projectSheet.db.database') }}</span>
        <SheetInput
          :model-value="part.database"
          mono
          :data-sheet-field="envBad() ? undefined : `part:${part.key}`"
          @update:model-value="patch({ database: $event })"
        />
      </label>
      <label class="field">
        <span class="label">{{ t('projectSheet.db.env') }}</span>
        <SheetInput
          :model-value="part.envFile"
          mono
          :placeholder="t('projectSheet.db.envPath')"
          :tone="envBad() ? 'error' : 'none'"
          :data-sheet-field="envBad() ? `part:${part.key}` : undefined"
          @update:model-value="patch({ envFile: $event })"
          @blur="sheet.touch(`part:${part.key}`)"
        />
      </label>
      <label class="field">
        <span class="label">
          {{ t('projectSheet.db.container') }}
          <span class="optional">{{ t('projectSheet.db.optional') }}</span>
        </span>
        <SheetInput
          :model-value="part.container ?? ''"
          mono
          @update:model-value="patch({ container: $event.trim() === '' ? null : $event })"
        />
      </label>
    </div>
    <p v-if="envBad()" class="bad">
      <UiIcon name="close" :size="10" :stroke="2" />{{ t('projectSheet.parts.absPath') }}
    </p>
    <p class="never"><UiIcon name="lock" :size="12" />{{ t('projectSheet.db.never') }}</p>
  </div>
</template>

<style scoped>
.db {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-left: 24px;
}

.fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.label {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.optional {
  font-weight: 400;
}

.never,
.bad {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.bad {
  color: var(--crit-ink);
}
</style>
