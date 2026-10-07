<!--
  Name and colour. The id follows the name until the first save and is then fixed (`id
  tiemtra` at the field's right end); a new project can still edit it, which opens an Id field
  under the row where its own problems are told.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { draftToProject } from '@/lib/setup-model'
import ColourSwatches from './ColourSwatches.vue'
import SheetInput from './SheetInput.vue'
import SheetMessages from './SheetMessages.vue'
import { useSheet } from './sheet-context'

const { t } = useI18n()
const sheet = useSheet()
</script>

<template>
  <section class="basics">
    <div class="grid">
      <label class="field">
        <span class="label">{{ t('projectSheet.name.label') }}</span>
        <SheetInput
          :model-value="sheet.draft.name"
          :tone="sheet.visible.name.some((i) => i.level === 'error') ? 'error' : 'none'"
          data-sheet-field="name"
          @update:model-value="sheet.setName"
          @blur="sheet.touch('name')"
        >
          <template #after>
            <span class="id">
              <button
                v-if="sheet.draft.isNew"
                type="button"
                class="id-edit"
                :title="t('projectSheet.id.edit')"
                :aria-label="`${t('projectSheet.id.edit')}: ${sheet.draft.id}`"
                @click="sheet.showId()"
              >
                {{ t('projectSheet.id.tag') }} <span class="mono">{{ sheet.draft.id }}</span>
              </button>
              <template v-else>
                {{ t('projectSheet.id.tag') }} <span class="mono">{{ sheet.draft.id }}</span>
              </template>
            </span>
          </template>
        </SheetInput>
        <SheetMessages
          :issues="sheet.visible.name"
          :project="draftToProject(sheet.draft).project"
        />
      </label>
      <div class="field">
        <span class="label">{{ t('projectSheet.colour.label') }}</span>
        <ColourSwatches :model-value="sheet.draft.color" @update:model-value="sheet.setColor" />
      </div>
    </div>
    <div v-if="sheet.draft.isNew && (sheet.editingId || sheet.visible.id.length > 0)" class="field">
      <label class="label" for="sheet-id">{{ t('projectSheet.id.label') }}</label>
      <SheetInput
        id="sheet-id"
        :model-value="sheet.draft.id"
        mono
        :tone="sheet.visible.id.some((i) => i.level === 'error') ? 'error' : 'none'"
        data-sheet-field="id"
        @update:model-value="sheet.setId"
        @blur="sheet.touch('id')"
      />
      <SheetMessages :issues="sheet.visible.id" :project="draftToProject(sheet.draft).project" />
    </div>
  </section>
</template>

<style scoped>
.basics {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: start;
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

.id {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.id-edit {
  color: inherit;
  font: inherit;
  border-radius: 4px;
}

.id-edit:hover {
  color: var(--ink);
}

.id-edit:focus-visible {
  box-shadow: var(--focus-ring);
}

.mono {
  font-family: var(--font-mono);
}
</style>
